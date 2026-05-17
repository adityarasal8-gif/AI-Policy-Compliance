# Project Context

## Product

ComplyLens is an enterprise AI compliance workspace for communication review.

The product helps organizations:
- upload or paste documents/messages
- detect policy violations
- explain why text is risky
- cite company policy references
- suggest safer rewrites
- keep audit history
- manage policy documents
- support admin and employee workflows
- support a Gmail/Chrome extension workflow

## Product Direction

ComplyLens should feel like:
- an operational AI compliance platform
- a workflow product
- a trust and governance system
- a practical enterprise tool

ComplyLens should not feel like:
- a generic analytics dashboard
- a SaaS template
- a chatbot wrapper
- disconnected panels
- decorative chart theater

The core workflow is:

Upload or write communication
-> analyze against company policy
-> show exact finding
-> explain why it matters
-> cite policy
-> provide rewrite
-> approve/reject/escalate
-> preserve audit evidence

## Architecture

- Frontend: React, Vite, TypeScript
- Backend: FastAPI
- Persistence: local SQLite runtime database
- Shared contracts: `packages/shared`
- Chrome extension output: `dist/extension`

## Active Routes

- `/` landing page
- `/login`
- `/signup`
- `/dashboard`
- `/reports`
- `/audit`
- `/policies` admin only
- `/settings`

## Design Principles

- Workflow-first, not page-first
- Decision-first, not metric-first
- Dense but readable
- Calm enterprise colors
- Minimal decorative motion
- Every card should answer what action matters next
- Mobile must not overflow horizontally

## Current Priorities

1. Inline document review mode
2. Approval workflow for findings
3. Expandable policy reasoning
4. Gmail send interception
5. Organization memory for rewrite style and risk preferences
6. Reports as decision intelligence, not dashboard theater
7. Real auth and invite redemption
8. OpenAI/LLM reasoning layer behind findings

## Known Constraints

- Demo auth currently uses localStorage role switching.
- Backend report metrics contain some inferred/demo estimates.
- Extension adoption is currently approximated by active invited users.
- Rewrite acceptance events are not yet stored as first-class backend events.

## Agent Rules

- Read `handoff.md`, `ai-system/handoff.md`, `ai-system/universal-ai-flow.md`, and this file before meaningful changes.
- Update root `handoff.md` after every implementation session.
- Preserve architecture and route contracts unless the user asks for a larger refactor.
- Prefer improving workflow depth over adding new pages.
- Do not commit `.DS_Store`.
