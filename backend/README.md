# ComplyLens Backend

This directory contains the FastAPI backend used by the ComplyLens web app and Chrome extension.

## What it provides

- `GET /health` for readiness checks.
- `POST /analyze` and `POST /analyze-upload` for compliance analysis.
- `POST /rewrite` for safe rewrite suggestions.
- `GET /policies`, `POST /upload-policy` for policy management.
- `GET /sessions`, `GET /audit-events`, and related admin endpoints for activity tracking.

## Setup

Create a virtual environment and install dependencies:

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r requirements.txt
```

Optional LLM configuration:

```env
GROQ_API_KEY=your_groq_api_key_here
```

## Run

From the repository root:

```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

From inside `backend/`:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

If you want to keep the `backend.app.main:app` import path, run the command from the repository root or add `--app-dir ..` while staying in `backend/`.

## Notes

- The backend is designed to work without an external LLM key.
- Deterministic local retrieval and rule-based analysis are the default behavior.
- The root [README](../README.md) contains the consolidated project summary and auth setup notes.
