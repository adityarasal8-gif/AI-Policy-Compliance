from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import firebase_admin
from firebase_admin import auth, credentials

from .models import (
    AnalyzeRequest,
    CompanySettings,
    ComplianceReport,
    EmployeeInvite,
    HealthResponse,
    PolicyToggle,
    RewriteRequest,
    RewriteResponse,
)
from .analyzer import rewrite_text_for_compliance
from .parser import extract_text_from_bytes, extract_text_from_upload
from .services import ComplianceService

logger = logging.getLogger("complylens")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path, override=True)

app = FastAPI(title="ComplyLens API", version="0.2.1")

try:
    firebase_admin.get_app()
except ValueError:
    firebase_admin.initialize_app(options={"projectId": "capgemini-buildathon"})

security = HTTPBearer(auto_error=False)

@app.on_event("startup")
async def startup_event() -> None:
    data_dir = Path(__file__).resolve().parents[1] / "data"
    data_path = data_dir / "state.sqlite3"
    legacy_json_path = data_dir / "state.json"
    app.state.service = ComplianceService(data_path)
    logger.info("ComplianceService initialized; policy_chunks=%d", app.state.service.policy_chunk_count)


def get_service(request: Request) -> ComplianceService:
    service = getattr(request.app.state, "service", None)
    if service is None:
        raise HTTPException(status_code=500, detail="Service not initialized")
    return service

def get_current_user(cred: HTTPAuthorizationCredentials = Depends(security), service: ComplianceService = Depends(get_service)):
    # Fallback user for development
    dev_user = {"email": "admin@complylens.local", "uid": "dev-admin-id", "db_role": "admin"}
    
    if not cred or not cred.credentials:
        logger.warning("No token provided. Using development fallback user.")
        return dev_user
        
    try:
        decoded_token = auth.verify_id_token(cred.credentials)
    except Exception as e:
        logger.warning(f"Token verification failed: {e}. Using development fallback user.")
        return dev_user
    
    email = decoded_token.get("email")
    if email:
        emp = service.storage.get_employee_by_email(email)
        if emp:
            decoded_token["db_role"] = emp.role
            decoded_token["db_id"] = emp.id
            return decoded_token
            
    decoded_token["db_role"] = "employee"
    return decoded_token

def require_admin(user: dict = Depends(get_current_user)):
    if user.get("db_role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5175", "chrome-extension://*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    logger.warning("HTTPException: %s %s", request.method, request.url.path)
    return JSONResponse(status_code=exc.status_code, content={"error": "http_error", "detail": str(exc.detail)})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning("Validation error for request %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "validation_error", "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error for request %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "internal_error", "detail": "An unexpected error occurred."},
    )


@app.get("/health", response_model=HealthResponse)
async def health(service: ComplianceService = Depends(get_service)) -> HealthResponse:
    return HealthResponse(ok=True, service="complylens-api", policy_chunks=service.policy_chunk_count)


@app.post("/settings/company", response_model=CompanySettings)
async def update_company(payload: CompanySettings, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)) -> CompanySettings:
    settings = service.update_settings(payload)
    logger.info("updated company settings threshold=%s", payload.threshold)
    return settings


@app.post("/upload-policy")
async def upload_policy(
    file: UploadFile = File(...),
    policy_name: str = Form("Uploaded Company Policy"),
    section: str = Form("Company policy"),
    owner: str = Form("Compliance"),
    department: str = Form("All"),
    user: dict = Depends(require_admin),
    service: ComplianceService = Depends(get_service),
) -> dict[str, Any]:
    try:
        raw_bytes = await file.read()
        text = extract_text_from_bytes(raw_bytes, file.filename)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded policy did not contain extractable text.")

    references = service.upload_policy(
        text=text,
        policy_name=policy_name,
        section=section,
        owner=owner,
        department=department,
        raw_bytes=raw_bytes,
        original_filename=file.filename,
    )
    logger.info("uploaded policy chunks=%d", len(references))
    # Return only summary info to avoid exposing chunked references in the admin UI
    return {
        "uploaded": True,
        "chunks": len(references),
        "policy": policy_name,
        "version": max([r.version for r in references]) if references else 1,
    }


@app.get("/policies")
def policies(user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    return service.list_policy_versions()


@app.delete("/policies/{policy}")
def delete_policy(policy: str, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    service.delete_policy(policy)
    return {"deleted": True, "policy": policy}


@app.get("/policies/compare")
def compare_policy(policy: str, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    try:
        return service.compare_policy_versions(policy)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/policies/view")
def view_policy(policy: str, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    try:
        return service.get_policy_view(policy)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/policies/file")
def policy_file(policy: str, version: int | None = None, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    try:
        file_path, filename, mime_type = service.get_policy_file(policy, version)
        return FileResponse(
            path=file_path,
            media_type=mime_type,
            filename=filename,
            content_disposition_type="inline",
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/policies/{reference_id}")
def toggle_policy(reference_id: str, payload: PolicyToggle, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    try:
        return service.toggle_policy(reference_id, payload.enabled)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/employees")
def employees(user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    return service.list_employees()


@app.post("/employees")
def invite_employee(payload: EmployeeInvite, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    return service.invite_employee(payload)


@app.patch("/employees/{employee_id}/status")
def update_employee_status(employee_id: str, status: str, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    try:
        return service.update_employee_status(employee_id, status)
    except ValueError as exc:
        detail = str(exc)
        status_code = 400 if detail == "Invalid status" else 404
        raise HTTPException(status_code=status_code, detail=detail) from exc


@app.get("/sessions")
def sessions(department: str | None = None, user: dict = Depends(get_current_user), service: ComplianceService = Depends(get_service)):
    is_admin = user.get("db_role") == "admin"
    employee_id = user.get("db_id") if not is_admin else None
    
    user_dept = user.get("department", "General")
    if is_admin and user_dept not in ("Compliance", "General"):
        if department is None or department == "All":
            department = user_dept
        elif department != user_dept:
            raise HTTPException(status_code=403, detail=f"Admin access restricted to {user_dept} department.")
            
    return service.list_sessions(department, employee_id=employee_id)


@app.get("/audit-events")
def audit_events(department: str | None = None, user: dict = Depends(get_current_user), service: ComplianceService = Depends(get_service)):
    is_admin = user.get("db_role") == "admin"
    employee_id = user.get("db_id") if not is_admin else None
    
    user_dept = user.get("department", "General")
    if is_admin and user_dept not in ("Compliance", "General"):
        if department is None or department == "All":
            department = user_dept
        elif department != user_dept:
            raise HTTPException(status_code=403, detail=f"Admin access restricted to {user_dept} department.")
            
    return service.list_audit_events(department, employee_id=employee_id)


@app.get("/reports/summary")
def reports_summary(role: str = "admin", department: str | None = None, user: dict = Depends(get_current_user), service: ComplianceService = Depends(get_service)):
    employee_id = user.get("db_id") if user.get("db_role") != "admin" else None
    return service.report_summary(role=role, department=department, employee_id=employee_id)


@app.patch("/audit-events/{event_id}/reviewed")
def mark_audit_reviewed(event_id: str, user: dict = Depends(require_admin), service: ComplianceService = Depends(get_service)):
    try:
        return service.mark_audit_reviewed(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/analyze", response_model=ComplianceReport)
async def analyze(payload: AnalyzeRequest, user: dict = Depends(get_current_user), service: ComplianceService = Depends(get_service)) -> ComplianceReport:
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text is required for analysis.")

    employee_id = user.get("db_id")
    report = service.analyze(payload, employee_id=employee_id)
    logger.info("analysis completed score=%s violations=%s", report.score, report.flaggedSections)
    return report


@app.post("/analyze-upload")
async def analyze_upload(
    file: UploadFile = File(...),
    threshold: float = Form(0.62),
    department: str = Form("General"),
    team: str = Form("Workspace"),
    user: dict = Depends(get_current_user),
    service: ComplianceService = Depends(get_service),
) -> dict[str, Any]:
    try:
        text = await extract_text_from_upload(file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded document did not contain extractable text.")

    payload = AnalyzeRequest(text=text, documentName=file.filename, threshold=threshold, department=department, team=team)
    employee_id = user.get("db_id")
    report = service.analyze(payload, employee_id=employee_id)
    logger.info("upload analysis completed score=%s violations=%s", report.score, report.flaggedSections)
    return {"text": text, "report": report.model_dump()}


@app.post("/rewrite", response_model=RewriteResponse)
async def rewrite(payload: RewriteRequest, user: dict = Depends(get_current_user)) -> RewriteResponse:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required for rewrite.")

    rewrite_text = rewrite_text_for_compliance(text, payload.policyContext)

    return RewriteResponse(rewrite=rewrite_text)
