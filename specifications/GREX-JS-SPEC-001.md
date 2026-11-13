# GREX-JS-SPEC-001: Grex JS v0.1 Core Reactive Runtime & Zero-Wrapper-Div DOM Engine

**Status:** Draft (Awaiting Owner Approval)
**Version:** `0.1.0-draft`
**Date:** 2026-11-13

---

## 1. Purpose & Goals

**Grex JS** provides a tiny, deterministic, zero-build-dependency reactive frontend runtime for **GRAB** and **Grisp** applications. Unlike heavy virtual-DOM frameworks or bloated visual page builders that nest multiple `<div>` wrappers around every component, Grex JS renders **semantic HTML5 elements directly** and updates only the exact text nodes, attributes, or CSS custom properties that change.

### Non-Goals for `v0.1`
- No JSX compiler or mandatory Node/Webpack/Vite build step to run in the browser.
- No drag-and-drop visual editor UI (that belongs to **Grex Builder**).
- No server-side GRAB language changes (Grex JS consumes standard HTML, CSS, and JSON served by Grisp).

---

## 2. Reactivity Model

Grex JS `v0.1` uses fine-grained, synchronous push-pull signals:

1. **`signal(initialValue)`**
   - Returns a reactive getter/setter pair (or callable signal object) holding a value.
   - Reading `.get()` inside an `effect` or `computed` automatically subscribes that observer.
   - Writing `.set(nextValue)` notifies subscribers only when `Object.is(prev, next)` is `false`.
2. **`computed(fn)`**
   - Lazily derives a value from one or more signals and memoizes the result until an upstream dependency changes.
3. **`effect(fn)`**
   - Runs immediately to track dependencies and re-runs whenever a tracked signal changes.
   - Returns a `dispose()` function; if `fn` returns a cleanup callback, that callback runs before each re-execution and on disposal.
4. **`batch(fn)`**
   - Coalesces multiple `.set()` calls inside `fn` so downstream effects run once after the batch completes.

---

## 3. Zero-Wrapper-Div Semantic HTML Rules

Every Grex element MUST follow these structural rules:
1. **Single-Node Root:** An element renders its own semantic HTML tag (`<section>`, `<header>`, `<nav>`, `<main>`, `<article>`, `<aside>`, `<footer>`, `<h1>`–`<h6>`, `<p>`, `<button>`, `<a>`) directly.
2. **No Wrapper `<div>`s:** Grex JS MUST NOT wrap elements in extra `.grex-wrapper`, `.grex-inner`, or `.grex-widget` `<div>` containers for layout or styling. Spacing, alignment, grid/flex placement, and visual styles apply directly to the semantic element via CSS classes and CSS custom properties.
3. **Selective Hydration:** Server-rendered `.grab.html` markup from Grisp can be hydrated in place via `data-grex-*` attributes without tearing down and recreating existing DOM nodes.

---

## 4. Responsive Design Tokens & `/static/grex/` CSS Architecture

1. **CSS Custom Properties (`--grex-*`):**
   - Colors, typography scales, spacing, radii, shadows, and container widths are expressed as CSS custom properties on `:root` or scoped element classes.
2. **Breakpoint Cascade:**
   - Standard responsive breakpoints (`base` / desktop-first or mobile-first configurable tokens, `tablet`, `mobile`) compile into clean CSS media queries.
3. **Grisp & `--read-only` Docker Compatibility:**
   - Compiled stylesheets are written strictly to a dedicated `/static/grex/` directory mount so the Grisp container root filesystem remains `--read-only`.
   - Grisp's `--reload` flag watches `/static/grex/` and templates, automatically updating `server.asset("/static/grex/...")` `?v=<hash>` query strings on save with zero container restarts.

---

## 5. Split-Screen Live Preview Bridge

To support instant visual editing without server round-trips:
1. **In-Memory Signal & Token Patching:**
   - The preview frame listens to a structured `GrexPreviewBridge` channel (`postMessage` with strict origin validation).
   - Updating text, visibility, or attributes patches the active `signal` directly in the browser.
   - Updating spacing, colors, or typography patches CSS custom properties (`element.style.setProperty("--grex-...", value)`) in real time with **zero Grisp restarts**.
2. **Publish Separation:**
   - **Publish Content:** Persists structured element JSON to GRAB `use data` and invalidates `use cache` (zero Grisp restarts).
   - **Publish Styles:** Writes compiled CSS to `/static/grex/` so Grisp `--reload` + `server.asset` `?v=<hash>` serves the updated stylesheet immediately.

---

## 6. Security & XSS Boundaries

- **Zero `eval` / Zero `new Function`:** All bindings and expressions are evaluated without dynamic code generation, compatible with strict `Content-Security-Policy` headers (`script-src 'self'`).
- **Safe DOM Sinks:** Text bindings use `node.textContent`. Attribute bindings block `javascript:`/`data:` URLs on `href`/`src` and disallow arbitrary `on*` inline event attributes.
- **Origin-Checked Preview Bridge:** `GrexPreviewBridge` rejects messages from unexpected origins or malformed payloads.

---

## 7. Acceptance & Verification Criteria (`v0.1`)

Implementation of `v0.1` is complete only when automated tests verify:
1. Signal/computed/effect/batch correctness, diamond-dependency consistency (no glitchy double-renders), and leak-free `dispose()`.
2. Zero-wrapper-div DOM output (exact expected semantic tag count with zero extra wrapper `<div>` nodes).
3. Safe escaping/blocking of XSS payloads in text and attribute bindings.
4. Split-screen preview bridge origin validation and live CSS token + signal updates.
5. Working example served by Grisp using `server.asset` `?v=<hash>` from `/static/grex/`.
