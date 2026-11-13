# Grisp + Grex JS v0.3 Integration Example

This example demonstrates **Fluid Grisp Sync** (`ADR-027b`) and **GRAB API Data Binding** (`ADR-025c`) with **Grex JS v0.3**:
1. `app.grab` fingerprints static assets under `/static/grex/` via `server.asset` (`?v=<12-char-sha256>`) and exposes `GET /api/catalog` + `POST /api/orders`.
2. `page.grab.html` renders clean semantic HTML5 tags (`<main>`, `<header>`, `<section>`, `<article>`, `<button>`) with **zero wrapper `<div>`s** and `data-grex-*` selective hydration attributes.
3. `public/grex/demo.js` hydrates the page in place, mounts a keyed `ForEach` catalog repeater + CSRF-protected `Form`/`Input` (`GrabDecimal`) bound via `createGrabClient`/`useQuery`/`useMutation`, and connects an origin-checked `GrexPreviewBridge`.

## Run with Grisp

From the `C:\Development\GRAB` (or installed `grab` binary) directory:

```sh
grab serve --addr 127.0.0.1:8080 --static C:\Development\grex-js\examples\grisp-basic\public --reload C:\Development\grex-js\examples\grisp-basic\app.grab
```

Then open `http://127.0.0.1:8080/` in your browser. Editing `public/grex/tokens.css` or `public/grex/app.css` triggers Grisp's `--reload` watcher and updates `server.asset`'s `?v=<hash>` query string automatically with zero container restarts.
