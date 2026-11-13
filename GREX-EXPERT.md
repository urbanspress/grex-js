# GREX-EXPERT: Non-Negotiable Engineering Invariants

Read this checklist **before** editing any module in `grex-js`. These invariants apply across the reactive core (`src/signals/`), semantic DOM engine (`src/dom/`), design tokens (`src/tokens/`), preview bridge (`src/bridge/`), and Grisp integration examples.

---

## 1. Zero-Bloat Semantic DOM
- **Render directly to native HTML5 elements:** Every Grex element MUST render its own clean semantic tag (`<section>`, `<header>`, `<nav>`, `<main>`, `<article>`, `<aside>`, `<footer>`, `<h1>`–`<h6>`, `<p>`, `<button>`, `<a>`, etc.).
- **Never inject wrapper `<div>`s:** Never wrap elements in `.grex-wrapper`, `.grex-inner`, or `.grex-widget` `<div>` containers for layout, spacing, or styling. Apply classes and `--grex-*` CSS custom properties directly to the semantic root node.
- **Selective hydration (`ADR-018`):** When attaching to server-rendered `.grab.html` markup via `data-grex-*` attributes, bind to existing DOM nodes in place without tearing down or recreating the server-rendered tree.

## 2. Strict CSP & XSS Safety (`ADR-014`, `ADR-017`)
- **Zero `eval()` and zero `new Function()`:** All bindings, expressions, and event wiring MUST work under strict Content-Security-Policy (`script-src 'self'`) with zero dynamic code generation.
- **Safe DOM sinks only:** Always bind text via `node.textContent`—never use unsafe `innerHTML` with untrusted or dynamic data.
- **Strict URL & attribute validation:** Block `javascript:` and `data:` protocols on `href`, `src`, and action attributes; forbid arbitrary inline `on*` event handler attributes.
- **Origin-checked `GrexPreviewBridge`:** Validate `event.origin` against an explicit allowlist and validate payload schemas before patching any signal or `--grex-*` CSS custom property.

## 3. Exact GRAB Value Integrity
- **Never coerce GRAB exact wire strings to IEEE-754 floats:** GRAB `grab.api.json` (`ADR-025c`) and `use data` / `use cache` (`ADR-025b`) transmit `GrabInteger` and `GrabDecimal` values (such as `"19.95"` or large integers) as exact base-10 strings.
- **Preserve string fidelity in display and formatting:** Never run `Number()`, `parseFloat()`, or binary64 floating-point math on GRAB decimal/currency wire strings when rendering or formatting UI values.

## 4. Fluid Grisp / Docker Sync (`ADR-027b`)
- **Compiled CSS lives strictly under `/static/grex/`:** Keep all generated stylesheets inside `/static/grex/` so Grisp Docker containers remain `--read-only` compatible with zero runtime disk writes outside mounted asset paths.
- **Respect `server.asset` & `--reload`:** Reference compiled stylesheets through GRAB's `server.asset` helper (`/static/grex/...?v=<12-char-sha256>`), allowing Grisp to serve `Cache-Control: public, max-age=31536000, immutable` on hash match and `no-cache` fallback during rolling multi-worker reloads.
- **Browser-only live preview:** Keep split-screen visual preview updates (`GrexPreviewBridge` signal & `--grex-*` property patching) purely in browser memory with zero Grisp restarts.

## 5. Zero Build-Step Browser Core & No Secrets
- **Dependency-free browser runtime:** The `grex-js` core runtime MUST run directly in modern browsers as deterministic static ES modules/assets with zero mandatory Node/Webpack/Vite build step.
- **No secrets or infrastructure details:** Never commit VPS IP addresses, usernames, SSH keys, or production credentials into any file in this repository.

---

## Pre-Finish Sanity Gate
Before concluding any task, verify:
1. Changes match this checklist with zero wrapper-div bloat, zero CSP/XSS regressions, and zero float coercion of GRAB decimal strings.
2. Automated unit, DOM, security, and integration tests covering the change pass 100%.
3. Documentation, `HANDOFF.md`, and `docs/ROADMAP.md` accurately reflect the verified state.
