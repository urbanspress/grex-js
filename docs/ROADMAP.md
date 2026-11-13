# Grex JS Roadmap

**Grex JS** is the lightweight reactive frontend runtime and zero-wrapper-div native UI element library powering **Grex Builder**, **GrabLab CMS**, and **Groxy AI** on top of **GRAB** and **Grisp**.

---

## `v0.1` — Core Reactive Signals, Semantic DOM Engine & Preview Bridge
**Status:** Complete (`v0.1.0` Released 2026-11-13 — [`specifications/GREX-JS-SPEC-001.md`](../specifications/GREX-JS-SPEC-001.md))

- **Fine-Grained Reactive Signals:** `signal`, `computed`, `effect`, and `batch` primitives with automatic dependency tracking, glitch-free diamond-dependency consistency, and deterministic `dispose()` cleanup.
- **Zero-Wrapper-Div DOM Engine (`ADR-018`):** Direct semantic HTML5 element creation and selective hydration (`data-grex-*` on `.grab.html`) without virtual-DOM overhead or extra wrapper `<div>` tags.
- **Responsive Design Tokens (`--grex-*`):** CSS custom property token system and `base` / `tablet` / `mobile` breakpoint cascade compiled strictly to `/static/grex/` for `--read-only` Docker containers.
- **Split-Screen Preview Bridge (`GrexPreviewBridge`):** Origin-validated `postMessage` channel patching live `signal` values and `--grex-*` CSS custom properties in browser memory with zero Grisp restarts.
- **GRAB 1.0 Integration Contracts:**
  - `server.asset` (`ADR-027b`): `/static/grex/...?v=<12-char-sha256>` with `Cache-Control: public, max-age=31536000, immutable` on hash match and `no-cache` fallback on rolling reload mismatch.
  - Strict CSP & XSS Boundaries (`ADR-014`, `ADR-017`): Zero `eval()`/`new Function()`, `textContent`-only text sinks, protocol-checked `href`/`src`, no inline `on*` handlers.
  - Exact GRAB Value Integrity (`ADR-025c`): Preserve `GrabInteger` / `GrabDecimal` base-10 wire strings (e.g., `"19.95"`) without IEEE-754 float coercion.
- **Acceptance Criteria:**
  1. 100% passing unit tests for `signal`, `computed`, `effect`, `batch`, diamond dependencies, and leak-free `dispose()`.
  2. DOM tests proving exact semantic tag output with zero wrapper `<div>` elements and clean `data-grex-*` selective hydration.
  3. Security tests blocking XSS payloads (`<script>`, `javascript:`, `data:`, `on*` attributes) and untrusted `GrexPreviewBridge` origins.
  4. Working example served by Grisp using `server.asset` `?v=<hash>` from `/static/grex/`.

---

## `v0.2` — Zero-Bloat Layout, Typography & Media Elements
**Status:** Complete (`v0.2.0` Released 2026-11-13 — [`specifications/GREX-JS-SPEC-002.md`](../specifications/GREX-JS-SPEC-002.md))

- **Semantic Layout Elements (`5`):** `Section`, `Container`, `Grid`, `Stack` (Flex), and `Card` rendering clean single-node semantic HTML with CSS Grid/Flexbox tokens and zero wrapper `<div>`s.
- **Typography & Action Elements (`5`):** `Heading` (`h1`–`h6`), `Text` (preserving exact GRAB decimal wire strings), `RichText` (strictly allowlisted inline tags, zero `innerHTML`), `Link` (safe URL + `rel="noopener noreferrer"`), and `Button` (safe `type="button"` default + ARIA states).
- **Media Elements (`2`):** `Image` (URL/`srcset` validation, `alt`, `loading="lazy"`, `width`/`height` CLS prevention) and `Icon` (safe SVG/symbol allowlist via `createElementNS`, zero `innerHTML`).
- **Per-Breakpoint Style Overrides:** `base`, `tablet`, and `mobile` style overrides compiled deterministically to `/static/grex/` CSS (`server.asset` `?v=<12-char-sha256>`) and live-patched via `GrexPreviewBridge`.
- **Acceptance Criteria:**
  1. Every element renders a single semantic HTML root node with zero wrapper `<div>` bloat.
  2. Responsive `--grex-*` breakpoint CSS compiles deterministically to `/static/grex/` and passes `server.asset` cache-busting verification.
  3. Accessibility attributes (`alt`, heading hierarchy, button/link semantics) verified by automated DOM tests.

---

## `v0.3` — Interactive UI Elements, Forms & `grab.api.json` Data Binding
**Status:** Complete (`v0.3.0` Released 2026-11-13 — [`specifications/GREX-JS-SPEC-003.md`](../specifications/GREX-JS-SPEC-003.md))

- **Interactive UI Elements (`7`):** `Form` (CSRF + submit state), `Input` (label association + exact `GrabDecimal`/`GrabInteger` string handling), `Select`, `Tabs` (roving tabindex + Left/Right/Home/End keyboard nav), `Accordion` (native `<details>`/`<summary>`), `Modal` (native `<dialog>` + focus trap + Escape), and `Nav` (`aria-current="page"` + mobile toggle).
- **Keyed Repeaters (`ForEach`):** Stable-key collection reconciliation updating items in place and disposing removed item effects without recreating unchanged DOM nodes.
- **GRAB `grab.api.json` Data Binding (`createGrabClient`, `useQuery`, `useMutation`):** Same-origin defaults, per-call CSRF enforcement, `AbortController` race-condition cancellation, exact `GrabInteger`/`GrabDecimal` wire string preservation, and `use cache`/`use sockets` invalidation hooks.
- **Acceptance Criteria:**
  1. Keyed repeaters update, reorder, and dispose item effects cleanly without recreating unchanged DOM nodes.
  2. `grab.api.json` contract binding tests verify exact decimal string preservation (`"19.95"` stays `"19.95"`) and `AbortSignal` cancellation.
  3. Interactive components pass keyboard/DOM state tests under strict `script-src 'self'` CSP.

---

## `v0.4` — Accessibility, Global Theme/Class Manager & `grab mcp` Design Alignment
**Status:** Planned

- **Accessibility & Focus Management:** Built-in ARIA state management (`aria-expanded`, `aria-selected`, `aria-controls`), keyboard navigation (roving tabindex, Escape/focus trap for `Modal`), and focus-ring guardrails aligned with `GRAB-DESIGN-SYSTEM.md`.
- **Global Style & Class Manager:** Reusable design presets and Bricks-style class tokens compiled to `/static/grex/`.
- **AI & CMS Preview Parity:** Clean JSON serialization for **Grex Builder**, **GrabLab CMS**, and **Groxy AI** (`grab mcp`, `ADR-027a`).
- **Acceptance Criteria:**
  1. Automated ARIA and keyboard navigation tests pass across `Nav`, `Tabs`, `Accordion`, and `Modal`.
  2. Global class/token overrides resolve deterministically in both live `GrexPreviewBridge` mode and compiled `/static/grex/` CSS output.

---

## `v1.0.0` — Stable Element Schema, SemVer Freeze & Production Release
**Status:** Planned

- **Stable `v1.0.0` Element Schema:** Versioned JSON element schema locked for **Grex Builder**, **GrabLab CMS**, and **Groxy AI** (`grab mcp`).
- **SemVer `v1.x` Stability Freeze:** Public reactive API (`signal`, `computed`, `effect`, `batch`), `data-grex-*` hydration attributes, `--grex-*` token conventions, and `GrexPreviewBridge` message schema frozen for `v1.x`.
- **Production Release Gates:**
  1. 100% passing unit, DOM, security/CSP, accessibility, and Grisp `--read-only` Docker + `server.asset` integration tests.
  2. Zero-dependency minified browser bundle + `/static/grex/` token stylesheet verified with `server.asset` `?v=<12-char-sha256>`.
  3. Plain-English Walkthrough PDF (`docs/releases/pdf/GREX-JS-v1.0.0-Guide.pdf`) and release assets attached to GitHub Release.
