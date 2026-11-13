# Grex JS Tandem Handoff Tracker

**Current Owner:** Google Antigravity
**Last Updated:** 2026-11-13
**Current Milestone:** `v0.1` Complete (`v0.1.0` Released); Ready for `v0.2` Specification Planning

## Current Status
- **Grex JS `v0.1.0` Complete & Verified:**
  - Implemented zero-dependency, zero-`eval()` / zero-`new Function()` ES modules in `src/`:
    - `src/signals.js`: `signal`, `computed`, `effect` (with deterministic `dispose()` and cleanup callbacks), `batch`, `untrack`, `isExactGrabWireString`, and `formatGrabDecimal` (preserving exact GRAB `GrabInteger`/`GrabDecimal` wire strings without IEEE-754 float coercion).
    - `src/security.js`: Strict CSP & XSS guards (`assertSafeTag`, `isForbiddenAttribute`, `isSafeUrl` blocking `javascript:`/`data:`/`vbscript:`/`file:`, `sanitizeAttributeValue`, `setSafeText`).
    - `src/tokens.js`: `--grex-*` responsive CSS token helper & `/static/grex/` compiler (`compileTokenCss`, `applyTokens`, `normalizeTokenName`, `validateTokenValue`).
    - `src/dom.js`: Zero-wrapper-div semantic HTML5 renderer (`renderElement`), `bindElement`, and in-place selective hydration (`hydrate` via `data-grex-*` attributes).
    - `src/bridge.js`: Origin-checked split-screen `GrexPreviewBridge` (`createPreviewBridge` with strict `allowedOrigins`, schema checks, and live `patch-signal`/`patch-token`/`patch-attr`/`patch-text`/`batch`).
    - `src/index.js`: Clean public module entrypoint.
  - Added automated unit, DOM, security, bundle, and example tests (`tests/*.test.js` — 22/22 passing via `npm test`).
  - Added runnable Grisp integration example (`examples/grisp-basic/`) verified with `grab check` and live `grab serve --static ... --reload` (`server.asset` `?v=<12-char-sha256>`, `Cache-Control: public, max-age=31536000, immutable` on match, `no-cache` fallback on mismatch).
  - Built browser-ready static release assets (`dist/grex-js-v0.1.0.js`, `dist/grex-js-v0.1.0.min.js`, `dist/grex-tokens-v0.1.0.css`) via `scripts/build-release-assets.mjs` and plain-English walkthrough PDF (`docs/releases/pdf/GREX-JS-v0.1.0-Guide.pdf`) via `docs/releases/generate_release_guides.py`.

## Next Pending Task
1. Draft `specifications/GREX-JS-SPEC-002.md` for **`v0.2` — Zero-Bloat Layout, Typography & Media Elements** (`Section`, `Container`, `Grid`, `Stack`, `Card`, `Heading`, `Text`, `RichText`, `Link`, `Button`, `Image`, `Icon`, and per-breakpoint overrides) for owner review before writing `v0.2` code.

## Recommended Model for Next Step
- **Gemini 4 Argon (Medium)** for drafting `specifications/GREX-JS-SPEC-002.md` and updating the `v0.2` design plan.
