# Grex JS

**Grex JS** is the lightweight reactive frontend runtime and zero-wrapper-div native UI element library powering **Grex Builder**, **GrabLab CMS**, and **Groxy AI** on top of **GRAB** and **Grisp**.

## How Grex JS Fits Into the GRAB Ecosystem

1. **GRAB + Grisp** (`urbanspress/grab.in.the.making` / `urbanspress/grab.stable`) — Core programming language, multi-worker persistent server, and `grab mcp` protocol.
2. **Grex JS (`urbanspress/grex-js`)** — Fine-grained reactive frontend signals, zero-wrapper-div semantic HTML elements, responsive CSS design tokens, and the split-screen preview bridge.
3. **Grex Builder** *(upcoming)* — Responsive-first visual page builder powered by Grex JS.
4. **GrabLab CMS** *(upcoming)* — Savvy CMS with pretty permalinks, content types, and publishing workflows.
5. **Groxy AI** *(upcoming)* — Autonomous design & CMS agent using `grab mcp` and Grex JS elements.
6. **Gashboard + Grabtaculous** *(upcoming)* — Discreet desktop VPS control panel and 1-click app installer.

## Design Principles

- **Zero Wrapper-Div Bloat:** Elements render directly to clean semantic HTML5 tags (`<section>`, `<header>`, `<article>`, `<form>`, `<dialog>`, `<details>`, `<nav>`, `<button>`, `<img>`, `<svg>`) without nested wrapper `<div>`s.
- **Fluid Grisp & Docker Sync (`ADR-027b`):**
  - *Split-Screen Live Preview:* Instant browser-side reactive signals, `--grex-*` CSS custom properties, and allowlisted element styles with zero server restarts.
  - *Instant Publish Content:* Structured element JSON persisted via GRAB `use data` + `use cache` invalidation.
  - *Instant Publish Styles:* Compiled CSS written to a dedicated `/static/grex/` mount (compatible with `--read-only` Docker containers and Grisp `--reload`) and fingerprinted via `server.asset` `?v=<12-char-sha256>`.
- **Exact GRAB Value Integrity (`ADR-025c`):** Preserves GRAB `GrabInteger` and `GrabDecimal` base-10 wire strings (e.g., `"19.95"`) without IEEE-754 float coercion.
- **CSP-Safe & Dependency-Free:** No `eval()`, no `new Function()`, no unsafe `innerHTML`, and no heavy build toolchain required in production.

## Repository Structure

- `src/` — Zero-dependency ES modules (`signals.js`, `security.js`, `tokens.js`, `dom.js`, `elements.js`, `interactive.js`, `data.js`, `bridge.js`, `index.js`).
- `tests/` — Automated unit, DOM, XSS/CSP security, element, interactive/keyboard, data-client, token, bridge, and release bundle tests (`npm test`).
- `examples/grisp-basic/` — Runnable GRAB 1.0 + Grisp `server.asset`, `--reload`, `ForEach`, `Form`, and `createGrabClient` example.
- `scripts/build-release-assets.mjs` — Builds clean browser-ready bundles in `dist/`.
- `docs/releases/` — Plain-English milestone walkthrough PDF generator (`generate_release_guides.py`) and PDFs.
- `GREX-EXPERT.md` — Non-negotiable engineering invariants checklist.
- `AGENTS.md` — Engineering rules, Two-Tier Model Routing, and Tandem Handoff Protocol.
- `HANDOFF.md` — Tandem AI ownership tracker.
- `docs/ROADMAP.md` — Milestone roadmap (`v0.1` through `v1.0.0`).
- `specifications/` — Approved technical specifications (`GREX-JS-SPEC-001.md`–`003.md`).
- `LICENSE` — MIT License.

## Quick Verification

```sh
npm test
node scripts/build-release-assets.mjs
```

## Current Status

**`v0.3.0` Released (Complete):** All 7 zero-wrapper-div interactive & form components (`Form`, `Input`, `Select`, `Tabs`, `Accordion`, `Modal`, `Nav`), keyed `ForEach` repeaters, and `grab.api.json` reactive data binding (`createGrabClient`, `useQuery`, `useMutation`, `AbortController`, CSRF safety, exact `GrabDecimal` strings) verified with 38/38 passing tests. Next milestone: `v0.4` specification planning.
