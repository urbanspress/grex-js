# Grex JS Engineering Instructions

**Grex JS** is the lightweight reactive frontend runtime and zero-wrapper-div native UI element library for **GRAB** and **Grisp**.

## Architecture & Scope
- **Frontend Layer Only:** `grex-js` owns client-side reactive signals, fine-grained DOM updates, semantic UI elements, responsive design tokens, and the split-screen preview bridge. Server-side language features, Grisp HTTP/worker internals, and `grab mcp` live in `urbanspress/grab.in.the.making`.
- **Zero Wrapper-Div Bloat:** Every Grex element renders directly to its clean, semantic HTML5 tag (`<section>`, `<header>`, `<nav>`, `<article>`, `<button>`, etc.) without extra wrapper `<div>` layers.
- **Zero-`eval` & CSP-Safe:** Never use `eval()`, `new Function()`, or unsafe `innerHTML` injection with untrusted data. Bind text via `textContent` and sanitize/validate attributes strictly.
- **Zero Build-Step Runtime Core:** Keep the browser runtime dependency-free, tiny, and deterministic so it serves cleanly as static assets via Grisp.

## Fluid Grisp / Docker Sync Rules
All `grex-js` rendering, previewing, and publishing workflows MUST respect these three sync boundaries:
1. **Split-Screen Live Preview:** Instant browser-side `Grex JS` reactive signals & CSS custom properties with zero server restarts.
2. **Instant Publish Content:** Structured element JSON persisted via GRAB `use data` + `use cache` invalidation (zero Grisp restarts).
3. **Instant Publish Styles:** Compiled CSS written strictly to a dedicated `/static/grex/` mount (compatible with `--read-only` Docker containers and Grisp `--reload`) and fingerprinted via GRAB `server.asset` `?v=<hash>`.

## Workflow & Security Hygiene
- **No Secrets or Infrastructure Details:** Never commit VPS IP addresses, usernames, SSH keys, or production credentials into any file in this repository.
- **Inspect Before Editing:** Read existing specifications, modules, and tests before making changes.
- **Small, Reviewable Changes:** Keep diffs focused and modular.
- **Plain-English Communication:** The project owner is a non-coder directing development in plain English. Always explain changes, errors, and design choices simply.
- **No Unapproved Commits/Pushes:** Do not commit, push, or publish releases without explicit owner approval.

## Mandatory Test Completion Gate
- NEVER mark an implementation task complete or ask for release approval until automated unit, DOM, and integration tests covering the new feature or bug fix pass 100%.

## Tiered Model Routing
- **Tier 1 — Frontier Models (`Gemini 4 Hydrogen`, `Gemini 4 Argon`, `Claude Opus/Sonnet`, `GPT-6.1 Sol`):**
  - Authorized to draft specifications, design reactive primitives, and execute multi-module refactors across `grex-js`.
- **Tier 2 — Fast Workhorse Models (`Gemini 3.8 Flash`, `OpenCode`, `Cline`, `Kilo Code`):**
  - Must operate in **Strict Single-Module Mode**: scope edits to one module/element at a time and run the module's test suite immediately after each edit.

## Tandem Handoff Protocol
- **Google Antigravity -> Codex:** If Google Antigravity fails to resolve an issue or pass tests after 2 attempts, revert only its failed edits, log the attempt in `HANDOFF.md`, update `Current Owner: OpenAI Codex`, and say: `"Ready to hand off to Codex. Type use-codex to continue."`
- **Codex -> Google Antigravity:** When Codex finishes a task, update `HANDOFF.md`, set `Current Owner: Google Antigravity`, and say: `"Core task complete—ready to hand off to Google Antigravity. Type use-antigravity to continue."`

### Internal Antigravity Model Guidance
- Recommend **Gemini 3.8 Flash (High)** for straightforward element tests, docs, and small fixes.
- Recommend **Gemini 4 Argon (Medium)** for roadmap updates and specification refinements.
- Recommend **Gemini 4 Hydrogen (Medium/High)** or **Opus 5.5 (High)** for core reactive engine, DOM reconciliation, and security-critical escaping work.
