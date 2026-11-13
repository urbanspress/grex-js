# Grex JS Roadmap

**Grex JS** is the lightweight reactive frontend runtime and zero-wrapper-div native UI element library powering **Grex Builder**, **GrabLab CMS**, and **Groxy AI** on top of **GRAB** and **Grisp**.

---

## `v0.1` — Core Reactive Signals & DOM Engine
**Status:** Draft Specification (`specifications/GREX-JS-SPEC-001.md` — Awaiting Owner Review)

- **Fine-Grained Reactive Signals:** `signal`, `computed`, `effect`, and `batch` primitives with automatic dependency tracking and deterministic cleanup/disposal.
- **Zero-Wrapper-Div DOM Engine:** Direct semantic HTML5 element creation and selective hydration without virtual-DOM overhead or extra wrapper `<div>` tags.
- **Responsive Design Tokens:** CSS custom property (`--grex-*`) token system and breakpoint cascade.
- **Split-Screen Preview Bridge:** Instant browser-side signal and CSS custom property patching with zero Grisp restarts.
- **Grisp Asset Integration:** Compatible with `--read-only` Docker containers, dedicated `/static/grex/` CSS mounts, Grisp `--reload`, and `server.asset` `?v=<hash>` cache busting.

---

## `v0.2` — Zero-Bloat Layout & Typography Elements
**Status:** Planned

- **Semantic Layout Elements:** `Section`, `Container`, `Grid`, `Stack` (Flex), and `Card` rendering clean single-node semantic HTML with CSS Grid/Flexbox tokens.
- **Typography & Media Elements:** `Heading`, `Text`, `RichText`, `Link`, `Button`, `Image` (responsive `srcset`/lazy loading), and `Icon`.
- **Per-Breakpoint Style Overrides:** Desktop, Tablet, Mobile, and custom breakpoint token overrides compiled to `/static/grex/` CSS.

---

## `v0.3` — Forms, Repeaters & `grab.api.json` Data Binding
**Status:** Planned

- **Interactive UI Elements:** `Form`, `Input`, `Select`, `Tabs`, `Accordion`, `Modal`, and `Nav`.
- **Dynamic Repeaters & Query Loops:** Keyed list rendering bound to GRAB `grab.api.json` typed contracts and `use data` / `use cache` JSON endpoints.
- **Instant Publish Content:** Structured element JSON persistence with GRAB `use cache` invalidation and zero Grisp restarts.

---

## `v0.4` — Accessibility, Themes & `v1.0.0` Stable Element Schema
**Status:** Planned

- **Accessibility & Focus Management:** Built-in ARIA state management, keyboard navigation, and contrast/focus-ring guardrails aligned with `GRAB-DESIGN-SYSTEM.md`.
- **Theme & Class Manager:** Reusable design presets and global class tokens.
- **`v1.0.0` Stable Element Schema:** Versioned JSON element schema locked for **Grex Builder** and **Groxy AI** (`grab mcp` composition).
