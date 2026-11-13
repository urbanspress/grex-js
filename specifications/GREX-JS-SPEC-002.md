# GREX-JS-SPEC-002: Grex JS v0.2 Zero-Bloat Layout, Typography & Media Elements

**Status:** Complete (Approved & Implemented 2026-11-13)
**Version:** `0.2.0`
**Date:** 2026-11-13
**Aligned GRAB ADRs:** `ADR-014`, `ADR-017`, `ADR-018`, `ADR-025c`, `ADR-027a`, `ADR-027b`

---

## 1. Purpose & Goals

**Grex JS `v0.2`** builds on the `v0.1` reactive core, security guards, and `--grex-*` token engine to provide **12 native, zero-wrapper-div semantic HTML5 elements** covering layout, typography, actions, and media. Every element renders directly to its single semantic HTML5 tag with built-in accessibility defaults, strict XSS safety, and deterministic `/static/grex/` responsive CSS compilation.

### Non-Goals for `v0.2`
- No interactive stateful widgets (`Form`, `Input`, `Select`, `Tabs`, `Accordion`, `Modal`, `Nav`) or keyed `grab.api.json` repeaters (those belong to `v0.3`).
- No visual drag-and-drop editor UI (that belongs to **Grex Builder**).
- No raw `innerHTML` parsing or `eval()`/`new Function()` template evaluation.

---

## 2. Unified Element JSON Schema (`GrexElementNode v0.2`)

Every `v0.2` element can be constructed via its dedicated factory (e.g., `Section(...)`, `Heading(...)`, `Image(...)`) or rendered from a declarative JSON node:

```json
{
  "id": "hero-section",
  "type": "Section",
  "tag": "section",
  "props": {},
  "styles": {
    "base": { "paddingBlock": "48px", "background": "var(--grex-surface)" },
    "tablet": { "paddingBlock": "32px" },
    "mobile": { "paddingBlock": "20px" }
  },
  "tokens": { "--grex-accent": "#0d9488" },
  "attrs": { "aria-label": "Hero" },
  "children": []
}
```

### Structural Rules
1. **Single Semantic Root:** Every element renders **one** root HTML5 element (`<section>`, `<article>`, `<h2>`, `<p>`, `<a>`, `<button>`, `<img>`, `<svg>`). Grex JS MUST NEVER inject `.grex-wrapper`, `.grex-inner`, or `.grex-widget` `<div>` nodes.
2. **Reactive Props:** Any text, URL, attribute, or `--grex-*` token prop may be a static value, a `signal`, or a `computed`.
3. **Exact GRAB Value Integrity (`ADR-025c`):** Typography elements (`Heading`, `Text`) preserve GRAB `GrabInteger` / `GrabDecimal` base-10 wire strings (e.g., `"19.95"`) verbatim without IEEE-754 float coercion.
4. **Fail-Closed Security:** All tags, attributes, URLs, `RichText` inline nodes, and `Icon` SVG descriptors pass strict allowlists before touching the DOM.

---

## 3. The 12 Core Elements

### 3.1 Layout Elements (`5`)

| Element | Default Tag | Allowed Tag Overrides | Key Props | Accessibility & Zero-Bloat Rules |
| :--- | :--- | :--- | :--- | :--- |
| **`Section`** | `<section>` | `section`, `header`, `footer`, `main`, `aside` | `label`, `labelledBy` | Maps `label` → `aria-label`, `labelledBy` → `aria-labelledby`. Full-width semantic landmark. |
| **`Container`** | `<section>` | `section`, `article`, `main`, `header`, `footer` | `maxWidth` | Applies `max-width` and `margin-inline: auto` directly on the single semantic tag (no inner wrapper `<div>`). |
| **`Grid`** | `<section>` | `section`, `ul`, `ol`, `article`, `nav` | `columns`, `gap`, `align`, `justify` | Applies CSS Grid (`display: grid`, `grid-template-columns`) directly on the root node. |
| **`Stack`** | `<section>` | `section`, `header`, `nav`, `footer`, `ul`, `ol`, `article` | `direction` (`"column"` \| `"row"`), `gap`, `wrap`, `align`, `justify` | Applies Flexbox (`display: flex`) directly on the root node. |
| **`Card`** | `<article>` | `article`, `section`, `aside` | `elevated` | Self-contained content surface using `--grex-surface`, `--grex-radius`, and `--grex-space-md` directly on `<article>`. |

### 3.2 Typography & Action Elements (`5`)

| Element | Default Tag | Allowed Tag Overrides | Key Props | Accessibility & Security Rules |
| :--- | :--- | :--- | :--- | :--- |
| **`Heading`** | `<h2>` | `h1`, `h2`, `h3`, `h4`, `h5`, `h6` | `level` (`1`–`6`), `text` | Enforces integer `level` `1`–`6` (rejects out-of-range levels). Binds `text` strictly via `textContent`. |
| **`Text`** | `<p>` | `p`, `span`, `small`, `strong`, `em`, `blockquote`, `time`, `code` | `text`, `dateTime` (for `<time>`) | Binds `text` strictly via `textContent`; preserves exact GRAB decimal wire strings. |
| **`RichText`** | `<p>` | `p`, `article`, `section`, `span` | `nodes` (structured inline array) or `html` (strictly parsed allowlist) | **Never uses `innerHTML`.** Parses/renders only allowlisted inline tags: `strong`, `b`, `em`, `i`, `u`, `s`, `code`, `mark`, `small`, `sup`, `sub`, `br`, `a` (`href` checked via `isSafeUrl()`, external `rel="noopener noreferrer"`). Disallowed tags (`<script>`, `<style>`, `<iframe>`, `<div>`, etc.) and all `on*` attributes are stripped/rejected fail-closed. |
| **`Link`** | `<a>` | `a` | `href`, `text`, `target`, `rel`, `external`, `label` | Validates `href` with `isSafeUrl()` (blocks `javascript:`, `data:`, `vbscript:`, `file:`). Automatically enforces `rel="noopener noreferrer"` whenever `target === "_blank"` or `external === true`. Maps `label` → `aria-label`. |
| **`Button`** | `<button>` | `button` | `text`, `type` (`"button"` \| `"submit"` \| `"reset"`), `disabled`, `pressed`, `expanded`, `label`, `onClick` | Defaults `type="button"` (never accidental `"submit"`). Attaches `onClick` via `addEventListener` (never inline `onclick`). Maps `pressed` → `aria-pressed`, `expanded` → `aria-expanded`, `label` → `aria-label`. |

### 3.3 Media Elements (`2`)

| Element | Default Tag | Allowed Tag Overrides | Key Props | Accessibility, CLS & Security Rules |
| :--- | :--- | :--- | :--- | :--- |
| **`Image`** | `<img>` | `img` | `src`, `alt`, `width`, `height`, `srcset`, `sizes`, `loading`, `decoding`, `decorative` | Validates `src` and every URL in `srcset` via `isSafeUrl()`. Defaults `loading="lazy"` and `decoding="async"`. Requires `alt` string (or `decorative: true` → `alt=""` + `aria-hidden="true"`). Emits `width` and `height` attributes to prevent Cumulative Layout Shift (CLS). |
| **`Icon`** | `<svg>` | `svg` | `viewBox`, `paths` (safe shape descriptors) or `symbolId` (`#name`), `size`, `label`, `decorative` | **Never uses `innerHTML`.** Builds SVG strictly via `createElementNS("http://www.w3.org/2000/svg", ...)` from allowlisted geometry tags (`path`, `circle`, `rect`, `line`, `polyline`, `polygon`) and allowlisted geometry/presentation attributes (`d`, `cx`, `cy`, `r`, `x`, `y`, `width`, `height`, `x1`, `y1`, `x2`, `y2`, `points`, `fill`, `stroke`, `stroke-width`, `stroke-linecap`, `stroke-linejoin`), OR a safe `#id` `<use>` reference (`/^#[a-z0-9_-]+$/i`). Defaults `aria-hidden="true"` when decorative, or `role="img"` + `aria-label` when `label` is provided. |

---

## 4. Per-Breakpoint Style Overrides & `/static/grex/` CSS Compilation (`ADR-027b`)

1. **Deterministic Class & Style Compilation:**
   - Each element's `styles` object (`{ base, tablet, mobile }`) maps allowlisted CSS layout/typography properties (e.g., `paddingBlock`, `paddingInline`, `marginInline`, `maxWidth`, `display`, `gridTemplateColumns`, `flexDirection`, `flexWrap`, `gap`, `alignItems`, `justifyContent`, `fontSize`, `fontWeight`, `lineHeight`, `textAlign`, `color`, `background`, `borderRadius`, `border`) into deterministic CSS rules under a stable class selector (e.g., `.grex-el-<id>`).
   - Values are validated against CSS injection patterns (`;`, `{`, `}`, `</style`, `expression(`, `javascript:`) and may reference `--grex-*` custom properties (e.g., `var(--grex-space-md)`).
2. **Breakpoint Media Queries:**
   - `base`: top-level rule (no media query).
   - `tablet`: `@media (max-width: 1024px)`.
   - `mobile`: `@media (max-width: 640px)`.
3. **Grisp & `--read-only` Docker Compatibility:**
   - Compiled CSS writes strictly to `/static/grex/` (e.g., `/static/grex/elements.css`).
   - Served via GRAB's `server.asset("/static/grex/elements.css")` (`?v=<12-char-sha256>`) with `Cache-Control: public, max-age=31536000, immutable` on hash match and `no-cache` fallback on rolling reload mismatch.
4. **Live Split-Screen Preview (`GrexPreviewBridge`):**
   - In-browser editing updates `--grex-*` CSS custom properties and safe element styles/signals immediately in memory with zero Grisp restarts.

---

## 5. Acceptance & Test Gates (`v0.2`)

Implementation of `v0.2` is complete only when automated tests verify:
1. **Zero-Wrapper-Div DOM Output:** All 12 elements render their exact semantic HTML5 root tags with zero extra `<div>` wrapper nodes.
2. **Accessibility Defaults:** `Heading` enforces `h1`–`h6`; `Button` defaults `type="button"`; external/blank `Link` enforces `rel="noopener noreferrer"`; `Image` enforces `alt`, `loading="lazy"`, and `width`/`height`; `Icon` sets `aria-hidden="true"` or `role="img"` + `aria-label`.
3. **XSS & Sanitization:** `RichText` blocks/strips `<script>`, `<iframe>`, `<img>`, `<div>`, `on*`, and `javascript:`/`data:` links without ever calling `innerHTML`; `Icon` rejects non-allowlisted SVG tags/attributes and unsafe `<use>` references; `Image` validates both `src` and `srcset` URLs.
4. **Responsive CSS Compiler & Bridge Parity:** Per-breakpoint `base`/`tablet`/`mobile` style overrides compile deterministically for `/static/grex/`, reject CSS injection, and patch live via `GrexPreviewBridge`.
5. **100% Test Suite Pass:** All `v0.1` + `v0.2` tests pass via `npm test`, and the release bundle + plain-English `v0.2.0` PDF guide are generated cleanly.
