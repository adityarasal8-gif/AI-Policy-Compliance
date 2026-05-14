from __future__ import annotations

import logging
from pathlib import Path

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware

from .models import AnalyzeRequest, CompanySettings, EmployeeInvite, HealthResponse, PolicyToggle, RewriteRequest, RewriteResponse
from .parser import extract_text_from_upload
from .services import ComplianceService


logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("complylens")

app = FastAPI(title="ComplyLens API", version="0.1.0")
service = ComplianceService(Path(__file__).resolve().parents[1] / "data" / "complylens.db")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "chrome-extension://*"],
    allow_origin_regex=r"chrome-extension://.*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    return HealthResponse(ok=True, service="complylens-api", policy_chunks=service.policy_chunk_count)


@app.post("/settings/company", response_model=CompanySettings)
def update_company(payload: CompanySettings) -> CompanySettings:
    settings = service.update_settings(payload)
    logger.info("updated company settings organization=%s threshold=%s", payload.organizationId, payload.threshold)
    return settings


@app.post("/upload-policy")
async def upload_policy(
    file: UploadFile = File(...),
    policy_name: str = Form("Uploaded Company Policy"),
    section: str = Form("Company policy"),
    owner: str = Form("Compliance"),
):
    try:
        text = await extract_text_from_upload(file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded policy did not contain extractable text.")

    references = service.upload_policy(text=text, policy_name=policy_name, section=section, owner=owner)
    logger.info("uploaded policy file=%s chunks=%s total=%s", file.filename, len(references), service.policy_chunk_count)
    return {"uploaded": True, "chunks": len(references), "references": references}


@app.get("/policies")
def policies():
    return service.list_policy_versions()


@app.get("/policies/compare")
def compare_policy(policy: str):
    try:
        return service.compare_policy_versions(policy)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.patch("/policies/{reference_id}")
def toggle_policy(reference_id: str, payload: PolicyToggle):
    try:
        return service.toggle_policy(reference_id, payload.enabled)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/employees")
def employees():
    return service.list_employees()


@app.post("/employees")
def invite_employee(payload: EmployeeInvite):
    return service.invite_employee(payload)


@app.patch("/employees/{employee_id}/status")
def update_employee_status(employee_id: str, status: str):
    try:
        return service.update_employee_status(employee_id, status)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.get("/sessions")
def sessions(department: str | None = None):
    return service.list_sessions(department)


@app.get("/audit-events")
def audit_events(department: str | None = None):
    return service.list_audit_events(department)


@app.get("/reports/summary")
def reports_summary(role: str = "admin", department: str | None = None):
    return service.report_summary(role=role, department=department)


@app.patch("/audit-events/{event_id}/reviewed")
def mark_audit_reviewed(event_id: str):
    try:
        return service.mark_audit_reviewed(event_id)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc


@app.post("/analyze")
def analyze(payload: AnalyzeRequest):
    if not payload.text.strip():
        raise HTTPException(status_code=400, detail="Text is required for analysis.")
    report = service.analyze(payload)
    logger.info(
        "analysis document=%s score=%s violations=%s",
        payload.documentName or "untitled",
        report.score,
        report.flaggedSections,
    )
    return report


@app.post("/analyze-upload")
async def analyze_upload(
    file: UploadFile = File(...),
    threshold: float = Form(0.62),
    department: str = Form("General"),
    team: str = Form("Workspace"),
):
    try:
        text = await extract_text_from_upload(file)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if not text.strip():
        raise HTTPException(status_code=400, detail="Uploaded document did not contain extractable text.")

    report = service.analyze(AnalyzeRequest(text=text, documentName=file.filename, threshold=threshold, department=department, team=team))
    logger.info("upload analysis document=%s score=%s violations=%s", file.filename, report.score, report.flaggedSections)
    return {"text": text, "report": report}


@app.post("/rewrite", response_model=RewriteResponse)
def rewrite(payload: RewriteRequest) -> RewriteResponse:
    text = payload.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text is required for rewrite.")

    context = (payload.policyContext or "").strip()
    if "customer" in text.lower() or "account" in text.lower():
        rewrite_text = "Please use the approved secure transfer workflow once the recipient is authorized."
    elif "salary" in text.lower() or "compensation" in text.lower():
        rewrite_text = "Please review compensation information only in the approved HR system."
    elif "guarantee" in text.lower() or "promise" in text.lower() or "refund" in text.lower():
        rewrite_text = "Our current target remains subject to final confirmation and approved commercial terms."
    else:
        rewrite_text = f"Rewritten for compliance: {text}"

    if context:
        rewrite_text = f"{rewrite_text} Policy basis: {context[:140]}"

    return RewriteResponse(rewrite=rewrite_text)
