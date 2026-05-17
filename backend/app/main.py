from __future__ import annotations

import logging
from pathlib import Path
from typing import Any

from dotenv import load_dotenv

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
from .parser import extract_text_from_upload
from .services import ComplianceService

logger = logging.getLogger("complylens")
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")

env_path = Path(__file__).resolve().parents[1] / ".env"
load_dotenv(env_path)

app = FastAPI(title="ComplyLens API", version="0.2.1")


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:5175"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    logger.warning("HTTPException: %s %s %s", request.method, request.url, exc.detail)
    return JSONResponse(status_code=exc.status_code, content={"error": "http_error", "detail": str(exc.detail)})


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    logger.warning("Validation error for request %s %s", request.method, request.url)
    return JSONResponse(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        content={"error": "validation_error", "detail": exc.errors()},
    )


@app.exception_handler(Exception)
async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error for request %s %s", request.method, request.url)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"error": "internal_error", "detail": "An unexpected error occurred."},
    )


@app.get("/health", response_model=HealthResponse)
async def health(service: ComplianceService = Depends(get_service)) -> HealthResponse:
    return HealthResponse(ok=True, service="complylens-api", policy_chunks=service.policy_chunk_count)


@app.post("/settings/company", response_model=CompanySettings)
async def update_company(payload: CompanySettings, service: ComplianceService = Depends(get_service)) -> CompanySettings:
    settings = service.update_settings(payload)
    logger.info("updated company settings organization=%s threshold=%s", payload.organizationId, payload.threshold)
    return settings


@app.post("/upload-policy")
async def upload_policy(
    file: UploadFile = File(...),
    policy_name: str = Form("Uploaded Company Policy"),
    section: str = Form("Company policy"),
    owner: str = Form("Compliance"),
    service: ComplianceService = Depends(get_service),
) -> dict[str, Any]:
    try:
        text = await extract_text_from_upload(file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded policy did not contain extractable text.")

    references = service.upload_policy(text=text, policy_name=policy_name, section=section, owner=owner)
    logger.info("uploaded policy file=%s chunks=%d", file.filename, len(references))
    return {
        "uploaded": True,
        "chunks": len(references),
        "references": [reference.model_dump() for reference in references],
    }


@app.get("/policies")
def policies(service: ComplianceService = Depends(get_service)):
    return service.list_policy_versions()


@app.get("/policies/compare")
def compare_policy(policy: str, service: ComplianceService = Depends(get_service)):
    try:
        return service.compare_policy_versions(policy)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/policies/{reference_id}")
def toggle_policy(reference_id: str, payload: PolicyToggle, service: ComplianceService = Depends(get_service)):
    try:
        return service.toggle_policy(reference_id, payload.enabled)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/employees")
def employees(service: ComplianceService = Depends(get_service)):
    return service.list_employees()


@app.post("/employees")
def invite_employee(payload: EmployeeInvite, service: ComplianceService = Depends(get_service)):
    return service.invite_employee(payload)


@app.patch("/employees/{employee_id}/status")
def update_employee_status(employee_id: str, status: str, service: ComplianceService = Depends(get_service)):
    try:
        return service.update_employee_status(employee_id, status)
    except ValueError as exc:
        detail = str(exc)
        status_code = 400 if detail == "Invalid status" else 404
        raise HTTPException(status_code=status_code, detail=detail) from exc


@app.get("/sessions")
def sessions(department: str | None = None, service: ComplianceService = Depends(get_service)):
    return service.list_sessions(department)


@app.get("/audit-events")
def audit_events(department: str | None = None, service: ComplianceService = Depends(get_service)):
    return service.list_audit_events(department)


@app.get("/reports/summary")
def reports_summary(role: str = "admin", department: str | None = None, service: ComplianceService = Depends(get_service)):
    return service.report_summary(role=role, department=department)


@app.patch("/audit-events/{event_id}/reviewed")
def mark_audit_reviewed(event_id: str, service: ComplianceService = Depends(get_service)):
    try:
        return service.mark_audit_reviewed(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/analyze", response_model=ComplianceReport)
async def analyze(payload: AnalyzeRequest, service: ComplianceService = Depends(get_service)) -> ComplianceReport:
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text is required for analysis.")

    report = service.analyze(payload)
    logger.info("analysis document=%s score=%s violations=%s", payload.documentName or "untitled", report.score, report.flaggedSections)
    return report


@app.post("/analyze-upload")
async def analyze_upload(
    file: UploadFile = File(...),
    threshold: float = Form(0.62),
    department: str = Form("General"),
    team: str = Form("Workspace"),
    service: ComplianceService = Depends(get_service),
) -> dict[str, Any]:
    try:
        text = await extract_text_from_upload(file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded document did not contain extractable text.")

    payload = AnalyzeRequest(text=text, documentName=file.filename, threshold=threshold, department=department, team=team)
    report = service.analyze(payload)
    logger.info("upload analysis document=%s score=%s violations=%s", file.filename, report.score, report.flaggedSections)
    return {"text": text, "report": report.model_dump()}


@app.post("/rewrite", response_model=RewriteResponse)
async def rewrite(payload: RewriteRequest) -> RewriteResponse:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required for rewrite.")

    rewrite_text = rewrite_text_for_compliance(text, payload.policyContext)

    return RewriteResponse(rewrite=rewrite_text)
