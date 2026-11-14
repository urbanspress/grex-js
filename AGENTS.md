# Grex JS Engineering Instructions

**Grex JS** is the lightweight reactive frontend runtime and zero-wrapper-div native UI element library powering **Grex Theme Builder**, **GrabLab CMS**, and **Groxy AI** on top of **GRAB** and **Grisp**.

## Architecture & Scope
- **Frontend Layer Only:** `grex-js` owns client-side reactive signals, fine-grained DOM updates, semantic UI elements, responsive `--grex-*` design tokens, and the split-screen `GrexPreviewBridge`. Server-side GRAB language features, Grisp HTTP/worker internals, and `grab mcp` live in `urbanspress/grab.progress` / `urbanspress/grab.stable`.
- **Zero Wrapper-Div Bloat:** Every Grex element renders directly to its clean, semantic HTML5 tag (`<section>`, `<header>`, `<nav>`, `<article>`, `<button>`, etc.) without extra wrapper `<div>` layers.
- **Strict CSP & XSS Safety (`ADR-014`, `ADR-017`):** Never use `eval()`, `new Function()`, or unsafe `innerHTML`. Bind text via `textContent`, block `javascript:`/`data:` URLs, forbid inline `on*` handlers, and validate `postMessage` origins in `GrexPreviewBridge`.
- **Exact GRAB Value Integrity (`ADR-025c`):** Never coerce GRAB base-10 `GrabInteger` / `GrabDecimal` wire strings (e.g., `"19.95"`) into imprecise IEEE-754 floating-point numbers when rendering or formatting values.
- **Zero Build-Step Runtime Core:** Keep the browser runtime dependency-free, tiny, and deterministic so it serves cleanly as static assets via Grisp.

## Fluid Grisp / Docker Sync Rules
All `grex-js` rendering, previewing, and publishing workflows MUST respect these three sync boundaries:
1. **Split-Screen Live Preview:** Instant browser-side `Grex JS` reactive signals & `--grex-*` CSS custom properties with zero Grisp restarts.
2. **Instant Publish Content:** Structured element JSON persisted via GRAB `use data` + `use cache` invalidation (zero Grisp restarts).
3. **Instant Publish Styles:** Compiled CSS written strictly to a dedicated `/static/grex/` mount (compatible with `--read-only` Docker containers and Grisp `--reload`) and fingerprinted via GRAB `server.asset` (`?v=<12-char-sha256>` with smart `Cache-Control` per `ADR-027b`).

## Workflow & User Communication
- **Inspect Before Editing:** Read `GREX-EXPERT.md`, relevant specifications, modules, and tests before making changes.
- **Small, Reviewable Changes:** Keep diffs focused and modular.
- **Plain-English Communication:** The project owner is a non-coder directing development in plain English. Always explain changes, errors, and design choices simply.
- **Direct Execution:** Handle all file edits and terminal commands directly; do not ask the project owner to perform routine coding or command-line work.
- **No Secrets or Infrastructure Details:** Never commit VPS IP addresses, usernames, SSH keys, or production credentials into any file in this repository.
- **No Unapproved Commits/Pushes:** Do not commit, push, or publish releases without explicit owner approval.

## Pre-Implementation Spec Approval & Test Gates
- **Pre-Implementation Specification Gate:** Never write runtime implementation code for a new milestone until its specification in `specifications/` is reviewed and explicitly approved by the project owner.
- **Mandatory Test Completion Gate:** NEVER mark an implementation task complete or ask for release approval until automated unit, DOM, security, and integration tests covering the new feature or bug fix pass 100%.

## Two-Repository Workflow & Release Protection
- **Repository Roles:**
  - `origin` (`https://github.com/urbanspress/grex-js.progress.git`): Active development repository for ongoing work, specifications, and in-progress milestone commits.
  - `stable` (`https://github.com/urbanspress/grex-js.stable.git`): Production release repository for 100% verified milestone releases only.
- **Strict `stable` Protection:** All AI agents and models MUST push work-in-progress commits, drafts, and specs ONLY to `origin` (`urbanspress/grex-js.progress`). Pushing to `stable` (`urbanspress/grex-js.stable`) is strictly forbidden unless the milestone is 100% `Complete` in `docs/ROADMAP.md`, all automated unit/DOM/security/integration tests pass 100%, and `HANDOFF.md` records no pending milestone tasks.
- **Synchronized Releases & Assets:** Whenever a completed milestone is promoted to `stable`, push `main` and annotated version tags in ascending chronological order to both `origin` and `stable`, generate the plain-English walkthrough PDF (`docs/releases/pdf/GREX-JS-<tag>-Guide.pdf`) alongside the clean browser-ready static runtime bundle (`grex-js-<tag>.min.js` / `grex-tokens-<tag>.css` as applicable), and publish/attach matching GitHub Releases and assets to **both** repositories (`urbanspress/grex-js.progress` and `urbanspress/grex-js.stable`).

## Tandem Handoff Protocol
- **Google Antigravity -> OpenAI Codex:** If Google Antigravity fails to resolve an issue or pass tests after 2 attempts, or encounters complex spec/architecture work, it must stop editing and revert only the specific files it edited during that failed attempt (stopping to ask the owner if pre-existing uncommitted work would be affected), log what it tried in `HANDOFF.md`, update `Current Owner: OpenAI Codex`, and say: `"Ready to hand off to Codex. Type use-codex to continue."`
- **OpenAI Codex -> Google Antigravity:** When Codex finishes a task, it must update `HANDOFF.md`, set `Current Owner: Google Antigravity`, and say: `"Core task complete—ready to hand off to Google Antigravity. Type use-antigravity to continue."`
- **Automatic Pickup:** Whenever either agent starts via `use-antigravity` or `use-codex`, it must immediately read `AGENTS.md`, `GREX-EXPERT.md`, and `HANDOFF.md`, run the test suite to confirm a clean baseline, and begin the next pending task without unnecessary setup questions.

### Internal Antigravity Model Guidance
- Before ending a turn or starting a new phase, advise the project owner which Antigravity model and effort level to select for the next step so AI Pro quota is used efficiently:
  - **`Google Hydrogen (Medium)`:** Pre-implementation specifications (`*-SPEC-*.md`), documentation, governance updates, and single-module edits.
  - **`Google Hydrogen (High)`:** Standard feature milestone implementations (`v0.4.0`, `v1.0.0` build & release).
  - **`Orchestrator (Argon)`:** Second-opinion pre-`v1.0.0` security/DOM/contract audits, multi-repo cross-layer integrations, and complex refactors where Argon-level planning + automated delegation saves tokens.
  - **`Google Hydrogen (Extra)`:** Reserved for autonomous AI engines (`Groxy AI`), multi-server orchestration (`Gashboard + Grabtaculous + grabman`), and stubborn cross-layer bugs.
- **Mandatory Pause & Swap Prompt Rule:** Every active AI agent MUST pause at milestone boundaries or before high-risk cross-layer/pre-`v1.0.0` audits and explicitly tell the user when to switch to `Orchestrator (Argon)`, including a clear 1-sentence reason why `Orchestrator (Argon)` is recommended next.
- If an issue remains unresolved after 2 attempts on `Google Hydrogen (Extra)` or `Orchestrator (Argon)`, trigger the **Tandem Handoff Protocol** and hand off to **OpenAI Codex**.

## Tiered Model Routing
- **Tier 1 — Frontier Models (`Google Hydrogen`, `Gemini 4 Argon`, `GPT-6.1 Sol`, `Claude Opus/Sonnet`):**
  - Authorized to draft specifications, design reactive primitives, and execute multi-module refactors across `grex-js` using `GREX-EXPERT.md`, spec approval gates, and full test verification.
- **Tier 2 — Fast Workhorse & Backup Models (`Gemini 3.8 Flash`, `OpenCode`, `Cline`, `Kilo Code`):**
  - Must operate in **Strict Single-Module Mode** for all code changes:
    1. **Read `GREX-EXPERT.md` first** before making any code edit.
    2. **Scope edits to one module or UI element at a time** instead of multi-module mega-edits.
    3. **Verify immediately after every edit:** run the module's test suite immediately after each edit before moving to the next module.
