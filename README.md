# ComplyLens Policy Compliance Checker

Enterprise AI compliance copilot for scanning documents and Gmail drafts against company policy.

Originally prototyped as the AI-Policy-Compliance-RAG project for the Capgemini Exceller AgenticAI Buildathon, focused on a modular RAG pipeline using LangChain, ChromaDB, and Groq LLM.

## Overview

ComplyLens combines a policy-aware retrieval pipeline with a SaaS dashboard and a Chrome extension. It is designed to surface policy violations, explain why they occur, and suggest safer rewrites while keeping the system usable without external LLM keys.

## Current Scope

- `apps/web`: React/Vite routed SaaS UI with landing page, auth screens, dashboard, policies, extension, and settings.
- `apps/extension`: Manifest V3 Chrome extension popup and Gmail content script that call the backend analysis API.
- `packages/shared`: shared report types, seeded policy data, fallback checker, and rewrite utilities.
- `backend`: FastAPI service for policy upload, document parsing, retrieval-backed analysis, rewrites, settings, and health checks.

## Commands

```bash
npm install
npm run dev:web
npm run build
```

Backend:

```bash
python3 -m pip install -r backend/requirements.txt
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Web auth setup:

- Create a Firebase project with Email/Password auth enabled.
- Set these env vars for `apps/web`: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, and `VITE_FIREBASE_APP_ID`.
- The web app writes user profiles to `users/{uid}` and workspace records to `workspaces/{workspaceId}` in Firestore.

The backend currently uses deterministic local policy retrieval and rule-based analysis so the product works without an external LLM key. Provider embeddings/LLM calls can be added behind the same API contract.
