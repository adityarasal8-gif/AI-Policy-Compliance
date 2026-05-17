# SESSION CONTINUITY RULES

At the end of every completed task or implementation session, the AI agent MUST update HANDOFF.md.

The AI must document:

- what was implemented
- what files were modified
- what architecture decisions were made
- what dependencies were added
- what bugs/issues were discovered
- what remains incomplete
- what should happen next

The AI must maintain continuity between sessions so future agents and contributors can immediately understand:
- current system state
- implementation history
- pending work
- technical reasoning
- known constraints

---

# REQUIRED SESSION UPDATE FORMAT

After completing work, AI must append a new entry using this structure:

## Session Update - [DATE]

### Objective
- [What was requested]

### Completed
- [Features/tasks completed]

### Files Modified
- [List modified files]

### Architecture Decisions
- [Important technical decisions]

### Dependencies Added
- [Packages/tools added]

### Issues Found
- [Bugs, risks, edge cases]

### Pending Work
- [What still needs to be done]

### Notes For Next Agent
- [Critical context for future sessions]

---

# PROJECT MEMORY RULE

HANDOFF.md acts as the persistent project memory layer.

AI agents must treat this file as:
- operational memory
- architectural memory
- product continuity memory
- implementation history

The AI should continuously refine and maintain this file throughout the project lifecycle.

Failure to update HANDOFF.md after implementation is considered incomplete task execution.


# HANDOFF.md PURPOSE

## What This File Is

This file acts as the persistent operational memory and project continuity layer for AI agents and human contributors.

Every AI agent working on this project MUST read this file before making changes.

The goal is to:
- preserve architecture consistency
- preserve design quality
- prevent duplicate logic
- maintain project context across sessions
- document current progress
- reduce regressions
- maintain engineering standards

This file represents the current state of the project, ongoing decisions, technical direction, constraints, and implementation expectations.

---

# AI AGENT RESPONSIBILITIES

Before making any code changes, the AI agent MUST:

1. Read HANDOFF.md completely
2. Understand the project goals
3. Inspect existing architecture
4. Reuse existing patterns and components
5. Preserve design consistency
6. Preserve API contracts
7. Avoid duplicate business logic
8. Avoid unnecessary abstractions
9. Avoid unrelated file modifications
10. Explain implementation plan before coding

---

# WHAT THE AI MUST UNDERSTAND

The AI is NOT acting as:
- autocomplete
- rapid prototype generator
- random code generator

The AI IS expected to act like:
- senior engineer
- product-minded architect
- systems thinker
- scalable software contributor

The AI must optimize for:
- maintainability
- scalability
- readability
- consistency
- performance
- accessibility
- production readiness

---

# REQUIRED ENGINEERING BEHAVIOR

## Architecture

AI must:
- preserve folder structure
- preserve module boundaries
- keep logic modular
- separate UI from business logic
- avoid giant components/files
- prefer reusable abstractions

---

## Frontend

AI must:
- follow existing design system
- preserve typography consistency
- preserve spacing consistency
- maintain responsive behavior
- maintain accessibility
- include loading/error/empty states
- use smooth and purposeful animations only

---

## Backend

AI must:
- validate all inputs
- preserve API contracts
- add proper error handling
- add logging where needed
- avoid insecure patterns
- consider scalability implications
- use async/background processing where appropriate

---

## Performance

AI must:
- avoid unnecessary rerenders
- optimize bundle size
- lazy load where appropriate
- optimize database queries
- prevent memory leaks
- preserve smooth UX

---

# BEFORE IMPLEMENTATION

AI must first:
1. Explain understanding of the task
2. Explain affected systems
3. Explain implementation strategy
4. Identify possible risks
5. Identify reusable existing code

Only then should implementation begin.

---

# AFTER IMPLEMENTATION

AI must:
- review code quality
- simplify unnecessary complexity
- remove dead code
- verify responsiveness
- verify accessibility
- verify edge cases
- verify no regressions were introduced

---

# CURRENT PROJECT STATUS

## Active Features
- [List active systems here]

## Pending Features
- [List pending work here]

## Known Issues
- [List known bugs/issues]

## Current Architecture Decisions
- [Document important architecture choices]

## Current Design Decisions
- [Document UI/UX standards]

## Important Constraints
- [Document business/technical constraints]

---

# FINAL RULE

AI should always prioritize:
1. long-term maintainability
2. system consistency
3. production readiness
4. user experience quality
5. architectural clarity

over:
- speed
- shortcuts
- unnecessary complexity
- temporary hacks