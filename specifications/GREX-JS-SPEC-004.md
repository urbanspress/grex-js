# GREX-JS-SPEC-004: Grex JS v0.4 & v1.0.0 — Accessibility, Global Theme/Class Manager, `grex.elements.json` & Stability Freeze

**Status:** Approved Target; Specification in Review (2026-11-13)
**Version:** `0.4.0-draft` → `1.0.0`
**Date:** 2026-11-13
**Aligned GRAB ADRs:** `ADR-014`, `ADR-017`, `ADR-018`, `ADR-025c`, `ADR-027a`, `ADR-027b`, `ADR-027c`, `ADR-027d`

---

## 1. Purpose & Goals

**Grex JS `v0.4` (leading directly into the `v1.0.0` SemVer stability freeze)** completes the core runtime by adding:
1. A **Global Theme & Reusable Class Manager** (`createTheme`, `createClassManager` / `registerClass`) compiling cleanly to `/static/grex/`.
2. **Built-In Accessibility Audit Helpers** (`auditAccessibility`, `auditDom`) enforcing WCAG AA contrast, `alt` text, form `<label>` associations, heading hierarchy, and keyboard focus indicators.
3. A **Machine-Readable Element Catalog (`grex.elements.json`)** describing all 20 Grex JS elements for **Grex Builder**, **GrabLab CMS**, and **Groxy AI** (`grab mcp` + `GRAB-DESIGN-SYSTEM.md`).
4. **The `v1.0.0` SemVer Stability Freeze & Production Release Gates.**

### Non-Goals
- No drag-and-drop visual editor UI (lives in `grex-builder`).
- No server-side CMS routing or database schema management (lives in `grablab-cms`).

---

## 2. Global Theme & Reusable Class Manager

### 2.1 `createTheme(config)`
Defines global `--grex-*` design tokens and optional theme modes (`light`, `dark`) without wrapper `<div>`s:
- **Token Categories:** `colors`, `typography`, `spacing`, `radii`, `shadows`, `focusRing`.
- **Theme Modes:** Compiles base `:root` tokens plus optional `[data-grex-theme="dark"]` (or `@media (prefers-color-scheme: dark)`) overrides.
- **Built-In Focus-Ring Guardrail:** Always emits `:focus-visible { outline: var(--grex-focus-ring, 2px solid #0284c7); outline-offset: 2px; }` so keyboard users always see clear focus indicators.
- **Fluid Grisp Sync (`ADR-027b`):** `theme.compileCss()` produces deterministic CSS for `/static/grex/theme.css` (`--read-only` Docker compatible, fingerprinted by `server.asset` `?v=<12-char-sha256>`), while `theme.applyTo(element)` / `GrexPreviewBridge` patches `--grex-*` tokens live in browser memory with zero Grisp restarts.

### 2.2 `createClassManager()` (`registerClass` / `compileCss`)
Provides reusable Bricks-style classes (e.g., `"btn-primary"`, `"card-surface"`):
- **Validation:** Class names MUST match `/^[a-z][a-z0-9_-]*$/i` (sanitized to `.grex-c-<name>` or validated class selector). All style properties and values pass `normalizeStyleProperty()` and `validateTokenValue()`—blocking CSS injection and disallowed properties fail-closed.
- **Responsive Breakpoints:** Each registered class supports `base`, `tablet` (`@media (max-width: 1024px)`), and `mobile` (`@media (max-width: 640px)`) overrides compiled deterministically to `/static/grex/`.

---

## 3. Built-In Accessibility Audit (`auditAccessibility` & `auditDom`)

Zero-dependency validation helpers returning `{ ok: boolean, issues: Array<{ severity, code, nodeId?, message }> }`:

1. **WCAG AA Color Contrast (`GREX-A11Y-001`):**
   - `computeContrastRatio(fgHex, bgHex)` calculates exact WCAG 2.1 relative luminance and contrast ratio.
   - Enforces `>= 4.5:1` for normal text and `>= 3.0:1` for large text (`>= 24px` or bold `>= 18.66px`).
2. **Image `alt` Text (`GREX-A11Y-002`):**
   - Flags any `Image` / `<img>` missing `alt` without `decorative: true` + `aria-hidden="true"`.
3. **Form Control Labels (`GREX-A11Y-003`):**
   - Flags any `Input`, `Select`, `<input>` (non-`hidden`), `<select>`, or `<textarea>` missing an associated `<label for="...">`, wrapping `<label>`, or `aria-label`/`aria-labelledby`.
4. **Heading Hierarchy (`GREX-A11Y-004`):**
   - Flags skipped heading levels (e.g., `<h1>` followed directly by `<h3>`) and multiple `<h1>` elements in the same document/tree.
5. **Interactive Labels & Focus Indicators (`GREX-A11Y-005`):**
   - Flags `<button>` / `<a>` elements with empty accessible names (no text and no `aria-label`) and blocks/flags `outline: none` / `outline: 0` without a replacement focus style.

---

## 4. Machine-Readable Element Catalog (`grex.elements.json`)

`exportElementCatalog()` (and checked-in `grex.elements.json` at repository root) provides a deterministic JSON schema (`schemaVersion: "1.0.0"`) for **Grex Builder**, **GrabLab CMS**, and **Groxy AI** (`grab mcp`):

- **Covers all 20 Grex JS elements:**
  - *Layout (`5`):* `Section`, `Container`, `Grid`, `Stack`, `Card`
  - *Typography & Actions (`5`):* `Heading`, `Text`, `RichText`, `Link`, `Button`
  - *Media (`2`):* `Image`, `Icon`
  - *Interactive & Forms (`7`):* `Form`, `Input`, `Select`, `Tabs`, `Accordion`, `Modal`, `Nav`
  - *Repeater (`1`):* `ForEach`
- **Per-Element Metadata:** `name`, `category`, `defaultTag`, `allowedTags`, `acceptsChildren`, `props` (type, required, default, allowedValues), `supportedStyleProps`, `a11yDefaults`, and `securityRules`.
- **Zero-Hallucination Validation:** `validateElementNode(node)` validates a JSON element tree against the catalog, rejecting unknown element types, disallowed tags, or unsafe props before rendering.

---

## 5. `v1.0.0` SemVer Stability Freeze & Release Gates (`ADR-027c`, `ADR-027d`)

Upon passing `v0.4` acceptance, Grex JS locks **`v1.0.0`** (`SemVer 2.0.0`) for the `v1.x` release line:
1. **Frozen Public API:** `signal`, `computed`, `effect`, `batch`, `untrack`, `formatGrabDecimal`, `isExactGrabWireString`, `renderElement`, `bindElement`, `hydrate`, `renderNode`, all 20 elements, `createGrabClient`, `useQuery`, `useMutation`, `invalidateQueries`, `connectSocketInvalidation`, `createTheme`, `createClassManager`, `auditAccessibility`, `auditDom`, `exportElementCatalog`, `validateElementNode`, `createPreviewBridge`, `compileTokenCss`, `compileElementStyles`.
2. **Frozen Protocols & Schemas:** `data-grex-*` hydration attributes, `--grex-*` CSS token conventions, `grex-preview-v1` bridge channel, and `grex.elements.json` v1 schema.
3. **Production Release Gates:**
   - 100% passing unit, DOM, XSS/CSP, keyboard/ARIA accessibility, keyed-repeater, data-client, and Grisp `server.asset` integration tests (`npm test`).
   - Clean zero-dependency browser bundles (`dist/grex-js-v1.0.0.min.js`, `dist/grex-tokens-v1.0.0.css`) + `grex.elements.json` verified.
   - Plain-English Walkthrough PDF (`docs/releases/pdf/GREX-JS-v1.0.0-Guide.pdf`) generated and attached to the `v1.0.0` GitHub Release alongside static bundles.
