# ComplyLens Policy Compliance Checker

ComplyLens is an enterprise policy-compliance copilot for scanning documents and Gmail drafts against company policy, explaining violations, and suggesting safer rewrites.

This repository now keeps the project in one place: the main README below is the consolidated summary of the earlier project notes, handoff notes, and auth setup documentation.

## What It Does

- Scans pasted text, uploaded documents, and Gmail drafts for policy risks.
- Highlights problematic language, cites policy references, and proposes rewrites.
- Supports both web and extension workflows against the same backend API.
- Works without an external LLM key using deterministic local retrieval and rule-based analysis.

## Project Layout

- `apps/web`: React + Vite + TypeScript dashboard, auth flow, policies, activity, settings, and admin views.
- `apps/extension`: Manifest V3 Chrome extension popup plus Gmail content script and background worker.
- `backend`: FastAPI service for analysis, rewrites, policy upload, sessions, audit events, and health checks.
- `packages/shared`: shared types, config, and compliance helpers used by the web app and extension.
- `data/policy_files`: policy text files used for local retrieval and testing.

## Tech Stack

- Frontend: React, Vite, TypeScript, React Router.
- Extension: Chrome Extension Manifest V3, content script, background service worker.
- Backend: Python, FastAPI, Pydantic, Uvicorn.
- Auth: Firebase Authentication + Firestore user/workspace profiles.
- Retrieval and parsing: local policy chunking/retrieval, document parsing for PDF/DOCX/HTML/MD/TXT and related formats.
- Shared logic: TypeScript utilities for reports, rewrites, and API contracts.

## Current Behavior

- AuthProvider wraps the router so user state is available everywhere.
- Unauthenticated users are redirected to `/auth`.
- Authenticated users with no profile are signed out and shown a setup message.
- Admin-only routes redirect non-admin users back to the dashboard.
- Backend fetches use plain `fetch()` to `http://localhost:8000` and are not blocked by frontend auth.
- The Chrome extension fetches through its own background worker and remains isolated from the web app auth flow.

## Setup

### Web app

Create `apps/web/.env` with Firebase values:

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your_project_id
VITE_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
VITE_FIREBASE_APP_ID=your_app_id
```

### Backend

```bash
python -m venv .venv
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -r backend/requirements.txt
python -m uvicorn backend.app.main:app --reload --port 8000
```

If you run the command from inside `backend/`, use `python -m uvicorn app.main:app --reload --port 8000` instead.

## Run

```bash
npm install
npm run dev:web
npm run build
```

## Consolidated Notes

The following earlier markdown notes have been summarized here so the workspace stays easier to scan:

- `project_context.md`: project goals, architectural guidance, and operating principles.
- `handoff.md`: development history, feature rollout notes, and product-direction updates.
- `AUTH_INTEGRATION_AUDIT.md`: Firebase auth routing, protected routes, backend/extension isolation, and verification results.
- `AUTH_SETUP_COMPLETE.md`: Firebase setup checklist, validation steps, and quick-start commands.

## Status

- TypeScript typecheck passes.
- Web build passes.
- Extension build passes.
- The backend works with deterministic local analysis and can be extended with provider LLMs behind the same API contract.
