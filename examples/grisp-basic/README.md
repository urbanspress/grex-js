# Grisp + Grex JS v0.1 Integration Example

This example demonstrates **Fluid Grisp Sync** (`ADR-027b`) with **Grex JS v0.1**:
1. `app.grab` fingerprints static assets under `/static/grex/` via `server.asset` (`?v=<12-char-sha256>`).
2. `page.grab.html` renders clean semantic HTML5 tags (`<main>`, `<header>`, `<section>`, `<article>`, `<button>`) with **zero wrapper `<div>`s** and `data-grex-*` selective hydration attributes.
3. `public/grex/demo.js` hydrates the page in place, preserves exact GRAB decimal wire strings (`"19.95"`), and connects an origin-checked `GrexPreviewBridge` for zero-restart live previews.

## Run with Grisp

From the `C:\Development\GRAB` (or installed `grab` binary) directory:

```sh
grab serve --static C:\Development\grex-js\examples\grisp-basic\public --reload C:\Development\grex-js\examples\grisp-basic\app.grab
```

Then open `http://127.0.0.1:8080/` in your browser. Editing `public/grex/tokens.css` or `public/grex/app.css` triggers Grisp's `--reload` watcher and updates `server.asset`'s `?v=<hash>` query string automatically with zero container restarts.
