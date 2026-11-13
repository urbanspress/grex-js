# Grex JS

**Grex JS** is the lightweight reactive frontend runtime and zero-wrapper-div native UI element library for **GRAB** and **Grisp**.

## How Grex JS Fits Into the GRAB Ecosystem

1. **GRAB + Grisp** (`urbanspress/grab.in.the.making` / `urbanspress/grab.stable`) — Core programming language, multi-worker persistent server, and `grab mcp` protocol.
2. **Grex JS (`urbanspress/grex-js`)** — Fine-grained reactive frontend signals, zero-wrapper-div semantic HTML elements, responsive CSS design tokens, and the split-screen preview bridge.
3. **Grex Builder** *(upcoming)* — Responsive-first visual page builder powered by Grex JS.
4. **GrabLab CMS** *(upcoming)* — Savvy CMS with pretty permalinks, content types, and publishing workflows.
5. **Groxy AI** *(upcoming)* — Autonomous design & CMS agent using `grab mcp` and Grex JS elements.
6. **Gashboard + Grabtaculous** *(upcoming)* — Discreet desktop VPS control panel and 1-click app installer.

## Design Principles

- **Zero Wrapper-Div Bloat:** Elements render directly to clean semantic HTML5 tags (`<section>`, `<header>`, `<article>`, `<button>`) without nested wrapper `<div>`s.
- **Fluid Grisp & Docker Sync:**
  - *Split-Screen Live Preview:* Instant browser-side reactive signals and CSS custom properties with zero server restarts.
  - *Instant Publish Content:* Structured element JSON persisted via GRAB `use data` + `use cache` invalidation.
  - *Instant Publish Styles:* Compiled CSS written to a dedicated `/static/grex/` mount (compatible with `--read-only` Docker containers and Grisp `--reload`) and fingerprinted via `server.asset` `?v=<hash>`.
- **CSP-Safe & Dependency-Free:** No `eval()`, no `new Function()`, and no heavy build toolchain required in production.

## Repository Structure

- `AGENTS.md` — Engineering rules, model routing, and Fluid Grisp/Docker Sync rules.
- `HANDOFF.md` — Tandem AI ownership tracker.
- `docs/ROADMAP.md` — Milestone roadmap (`v0.1` through `v1.0.0`).
- `specifications/GREX-JS-SPEC-001.md` — Draft `v0.1` specification (awaiting owner review).
- `LICENSE` — MIT License.

## Current Status

**Drafting `v0.1` Specification:** `specifications/GREX-JS-SPEC-001.md` is ready for owner review before starting `v0.1` implementation.
