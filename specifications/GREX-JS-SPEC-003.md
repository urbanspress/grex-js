# GREX-JS-SPEC-003: Grex JS v0.3 Interactive UI Elements, Forms & `grab.api.json` Data Binding

**Status:** Complete (Approved & Implemented 2026-11-13)
**Version:** `0.3.0`
**Date:** 2026-11-13
**Aligned GRAB ADRs:** `ADR-014`, `ADR-017`, `ADR-018`, `ADR-025b`, `ADR-025c`, `ADR-025f`, `ADR-027b`

---

## 1. Purpose & Goals

**Grex JS `v0.3`** extends the `v0.1` reactive engine and `v0.2` semantic element library with **7 interactive & form components**, **keyed collection repeaters (`ForEach`)**, and **reactive `grab.api.json` data binding** (`createGrabClient`, `useQuery`, `useMutation`). Every component preserves zero-wrapper-div semantic HTML5, strict CSP/XSS safety, WAI-ARIA keyboard accessibility, and exact GRAB base-10 wire string integrity.

### Non-Goals for `v0.3`
- No visual drag-and-drop editor UI (that belongs to **Grex Theme Builder**).
- No global theme/class manager presets (that belongs to `v0.4`).
- No `eval()`, `new Function()`, or unsafe `innerHTML` parsing.

---

## 2. Interactive & Form Elements (`7` Semantic Components)

All 7 components follow the `GrexElementNode` schema (`id`, `type`, `props`, `styles`, `tokens`, `attrs`, `children`), compile `styles` (`base`, `tablet`, `mobile`) to `/static/grex/`, and render **zero wrapper `<div>`s**.

| Component | Semantic HTML5 Root | Accessibility & Keyboard Behavior | Key Props & Security Rules |
| :--- | :--- | :--- | :--- |
| **`Form`** | `<form>` | Submits via `addEventListener("submit")` (`preventDefault()`). Exposes `aria-busy` while submitting. | `action` (validated via `isSafeUrl()`), `method` (`"post"` \| `"get"`), `csrfToken` (string/`signal`/getter), `csrfHeader` (default `"X-CSRF-Token"`), `csrfField` (optional hidden `<input>`), `onSubmit`. Blocks double-submit while `submitting` signal is `true`. |
| **`Input`** | `<label>` wrapping `<span>` + `<input>`/`<textarea>` (or bare `<input>`/`<textarea>` when `bare: true`) | Explicit `for`/`id` association (or `aria-label` when `bare: true`). Sets `aria-invalid="true"` and `aria-describedby` to `<small role="alert">` on validation error. | `name`, `value` (`signal`), `type` (`"text"`, `"email"`, `"password"`, `"search"`, `"tel"`, `"url"`, `"number"`, `"hidden"`, `"textarea"`), `grabType` (`"GrabDecimal"` \| `"GrabInteger"`), `required`, `minLength`, `maxLength`, `pattern`, `validate(val)`. **Exact Base-10 Integrity:** `grabType` / `inputMode="decimal"` keeps values as exact strings (e.g., `"19.95"`), never coercing through `Number()`/`parseFloat()`. |
| **`Select`** | `<label>` wrapping `<span>` + `<select>` (or bare `<select>` when `bare: true`) | Explicit `for`/`id` association; native keyboard selection. | `name`, `value` (`signal`), `options` (`[{ value, label, disabled? }]` or `[{ group, options }]`), `required`, `disabled`. |
| **`Tabs`** | `<section>` containing `<nav role="tablist">` + `<section role="tabpanel">` | `ArrowLeft` / `ArrowRight` (wrapping), `Home`, `End` move focus and active tab. Roving `tabindex` (`0` active, `-1` inactive), `aria-selected`, `aria-controls`, `aria-labelledby`. | `label` (`aria-label` on `tablist`), `activeId` (`signal`), `tabs` (`[{ id, label, content }]`). |
| **`Accordion`** | `<section>` (or single `<details>`) of `<details>` + `<summary>` | **Zero JS required** for native browser expand/collapse; `Enter`/`Space` handled natively by `<summary>`. | `items` (`[{ id, summary, content, open? }]`), `singleOpen` (boolean—closes sibling `<details>` on toggle), `openIds` (`signal`). |
| **`Modal`** | `<dialog>` | Opens via `showModal()`, closes via `close()`. Traps `Tab`/`Shift+Tab` inside focusable descendants, dismisses on `Escape` (`cancel` event), and restores focus to trigger element on close. `aria-modal="true"`, `aria-labelledby`. | `open` (`signal`), `title`, `onClose`, `children`. |
| **`Nav`** | `<nav>` containing optional toggle `<button>` + `<ul>`/`<li>`/`<a>` | Toggle `<button type="button">` sets `aria-expanded` and `aria-controls`. Active route link automatically receives `aria-current="page"`. | `label` (`aria-label`), `items` (`[{ href, text, external? }]`), `activePath` (`signal` or string), `collapsible` (boolean for mobile disclosure). All `href`s validated via `isSafeUrl()`. |

---

## 3. Keyed Repeaters (`ForEach`)

`ForEach` renders dynamic collections (product grids, cart lines, blog posts) into a semantic parent element (`<ul>`, `<ol>`, `<section>`, `<tbody>`) **without wrapper `<div>`s** and **without recreating unchanged DOM nodes**:

```js
ForEach({
  parent: { type: "Grid", id: "product-grid", props: { columns: "repeat(3, 1fr)" } },
  items: productsSignal,
  key: (item) => item.id,
  render: (itemSignal, indexSignal) => Card({ ... }),
  empty: () => Text({ props: { text: "No products found." } }),
})
```

### Reconciliation & Memory Guarantees
1. **Stable Key Identity:** Each rendered item is tracked by `key(item, index)` (must be a non-empty string or number; duplicate keys fail deterministically with an error).
2. **In-Place Updates & Reordering:** When `items` updates:
   - Existing keys reuse the exact same DOM node and update their `itemSignal` / `indexSignal` in place.
   - Reordered keys move existing DOM nodes without tearing down child state or focus.
   - Removed keys immediately invoke their item `dispose()` callback (cleaning up all nested `effect`s and event listeners) before removing the DOM node.
3. **Empty State:** When `items` is empty, renders `empty()` cleanly and disposes it when items arrive.

---

## 4. GRAB 1.0 `grab.api.json` Data Binding (`ADR-025b`, `ADR-025c`, `ADR-025f`)

### 4.1 `createGrabClient(options)`
- **Same-Origin Defaults:** Defaults `credentials` to `"same-origin"` and `timeoutMs` to `10000` (capped at `60000`).
- **Contract Awareness:** Optional `contract` (`grab.api.json` manifest) validates endpoint names, HTTP methods, and route paths before issuing requests.
- **Exact Wire Strings:** Parses JSON responses without coercing `GrabInteger` / `GrabDecimal` string fields (e.g., `"19.95"` stays `"19.95"`).
- **CSRF Safety:** Unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`) require an explicit `csrfToken` (passed per call or via `csrfToken` getter/signal) sent in `X-CSRF-Token` (configurable); the client never stores tokens in global storage.

### 4.2 `useQuery(client, endpointOrFn, options?)`
- Returns `{ data, loading, error, refetch, dispose }`, where `data`, `loading`, and `error` are reactive `signal`s.
- **Race-Condition Cancellation (`AbortController`):** Whenever reactive query params change, `refetch()` is called, or `dispose()` runs, any in-flight `AbortController` is aborted immediately so stale responses never overwrite newer state.
- **Live Cache & Socket Invalidation:** Registers optional `queryKey` / `tags` so `invalidateQueries(tag)` (called after `useMutation` or on an authorized `use sockets` WebSocket message) triggers a clean `refetch()`.

### 4.3 `useMutation(client, endpoint, options?)`
- Returns `{ mutate, data, loading, error, reset }`.
- Enforces CSRF token presence for unsafe methods, supports `AbortSignal` cancellation + timeout, and triggers `invalidates: [...]` query keys on success.

---

## 5. Acceptance & Test Gates (`v0.3`)

Implementation of `v0.3` is complete only when automated tests verify:
1. **Zero-Wrapper-Div DOM Output:** All 7 interactive/form components and `ForEach` render semantic HTML5 tags with zero extra `<div>` nodes.
2. **Keyboard & WAI-ARIA Accessibility:** Automated tests verify `Tabs` `ArrowLeft`/`ArrowRight`/`Home`/`End` + `aria-selected`, `Accordion` `<details>`/`<summary>`, `Modal` `showModal()`/`Escape`/focus-trap/focus-restore, `Nav` `aria-current="page"` + `aria-expanded`, and `Input`/`Select` `<label>` + `aria-invalid`.
3. **Exact Base-10 Decimal Inputs:** `Input` with `grabType: "GrabDecimal"` preserves `"19.95"` / `"0.30"` without float coercion.
4. **Keyed Repeater Identity & Disposal:** `ForEach` retains exact DOM node references on reorder/update and runs `dispose()` on removed items.
5. **Data Binding & Security:** `createGrabClient`, `useQuery`, and `useMutation` tests verify `AbortController` cancellation of stale requests, CSRF token enforcement on `POST`/`PUT`/`DELETE`, same-origin defaults, and zero `eval()`/`innerHTML`.
6. **100% Test Pass & Release Assets:** Full `npm test` suite passes 100%, `dist/` `v0.3.0` bundles and `docs/releases/pdf/GREX-JS-v0.3.0-Guide.pdf` are generated cleanly.
