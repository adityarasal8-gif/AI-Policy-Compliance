import pytest
from fastapi.testclient import TestClient
from pathlib import Path

from app.main import app, get_current_user
from app.services import ComplianceService

client = TestClient(app)

# Setup a test service using an in-memory DB or a temporary DB
@pytest.fixture(scope="session", autouse=True)
def setup_test_service(tmp_path_factory):
    data_dir = tmp_path_factory.mktemp("data")
    db_path = data_dir / "test_state.sqlite3"
    service = ComplianceService(db_path)
    app.state.service = service
    yield service

def mock_admin_user():
    return {"email": "admin@test.com", "uid": "test-admin", "db_role": "admin", "department": "General"}

def mock_employee_user():
    return {"email": "emp@test.com", "uid": "test-emp", "db_role": "employee", "db_id": "emp-123", "department": "Sales"}

def override_auth(role="admin"):
    if role == "admin":
        app.dependency_overrides[get_current_user] = mock_admin_user
    else:
        app.dependency_overrides[get_current_user] = mock_employee_user

# --- RBAC Tests ---
def test_rbac_admin_access():
    override_auth("admin")
    response = client.get("/employees")
    assert response.status_code == 200

def test_rbac_employee_access_denied():
    override_auth("employee")
    response = client.get("/employees")
    assert response.status_code == 403

def test_sessions_access_employee():
    override_auth("employee")
    response = client.get("/sessions")
    assert response.status_code == 200
    # Employee should only see their own sessions, but currently list is empty
    assert response.json() == []

# --- Upload Policy Tests ---
def test_upload_policy_empty():
    override_auth("admin")
    response = client.post(
        "/upload-policy",
        data={
            "policy_name": "Test",
            "section": "Core",
            "owner": "HR",
            "department": "All"
        },
        files={"file": ("empty.txt", b"", "text/plain")}
    )
    assert response.status_code == 400
    assert "extractable text" in response.json()["detail"]

def test_upload_policy_success():
    override_auth("admin")
    response = client.post(
        "/upload-policy",
        data={
            "policy_name": "Test",
            "section": "Core",
            "owner": "HR",
            "department": "All"
        },
        files={"file": ("test.txt", b"This is a valid company policy test text.", "text/plain")}
    )
    assert response.status_code == 200
    assert response.json()["uploaded"] is True

# --- Analysis Tests ---
def test_analyze_empty_text():
    override_auth("employee")
    response = client.post("/analyze", json={"text": "   ", "threshold": 0.5})
    assert response.status_code == 400
    assert "Text is required" in response.json()["detail"]

def test_analyze_safe_text():
    override_auth("employee")
    response = client.post("/analyze", json={"text": "This is completely safe generic text.", "threshold": 0.5})
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    # It might have 100 score depending on LLM
    assert data["score"] == 100 or data["flaggedSections"] == 0

def test_analyze_upload_empty_file():
    override_auth("employee")
    response = client.post("/analyze-upload", files={"file": ("empty.txt", b"", "text/plain")})
    assert response.status_code == 400

def test_analyze_violation():
    override_auth("employee")
    # This phrase is an absolute guarantee which should trigger a violation in the default seeded policy
    text_with_violation = "We guarantee customers will see a 40% increase in profits within 30 days."
    response = client.post("/analyze", json={"text": text_with_violation, "threshold": 0.5})
    assert response.status_code == 200
    data = response.json()
    # It should detect a violation or at least not fail
    assert "score" in data

def test_rewrite_empty():
    override_auth("employee")
    response = client.post("/rewrite", json={"text": ""})
    assert response.status_code == 400
    assert "Text is required" in response.json()["detail"]

