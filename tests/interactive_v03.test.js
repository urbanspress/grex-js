import test from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  Form,
  Input,
  Select,
  Tabs,
  Accordion,
  Modal,
  Nav,
  ForEach,
  Card,
  Heading,
  Text,
  GrexSecurityError,
} from "../src/index.js";
import { createTestEnv } from "./helpers/dom-shim.js";

test("Form blocks unsafe action URLs, injects CSRF token, and prevents double-submit", async () => {
  const { document, body } = createTestEnv();

  assert.throws(
    () => Form({ props: { action: "javascript:alert(1)" } }, { document }),
    GrexSecurityError
  );

  const csrf = signal("tok-abc-123");
  let resolvePending;
  let calls = 0;
  let receivedPayload = null;

  const form = Form(
    {
      id: "checkout-form",
      props: {
        action: "/api/orders",
        method: "post",
        csrfToken: csrf,
        csrfField: "_csrf",
        onSubmit: (payload) => {
          calls += 1;
          receivedPayload = payload;
          return new Promise((resolve) => {
            resolvePending = resolve;
          });
        },
      },
      children: [
        Input({ props: { name: "price", label: "Price", value: "19.95", grabType: "GrabDecimal" } }, { document }).element,
      ],
    },
    { document }
  );

  body.appendChild(form.element);
  assert.equal(body.querySelectorAll("div").length, 0);
  assert.equal(form.element.querySelector('input[name="_csrf"]').value, "tok-abc-123");

  // First submit starts async work; second concurrent submit must be ignored
  form.element.dispatchEvent({ type: "submit" });
  assert.equal(form.submitting.get(), true);
  assert.equal(form.element.getAttribute("aria-busy"), "true");

  form.element.dispatchEvent({ type: "submit" });
  assert.equal(calls, 1);

  resolvePending();
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(form.submitting.get(), false);
  assert.equal(form.submitted.get(), true);
  assert.equal(receivedPayload.csrfToken, "tok-abc-123");
  assert.equal(receivedPayload.csrfHeader, "X-CSRF-Token");
  assert.equal(receivedPayload.values.price, "19.95");

  form.dispose();
});

test("Input associates <label>, validates rules with aria-invalid, and preserves exact GrabDecimal strings", () => {
  const { document, body } = createTestEnv();
  const price = signal("19.95");

  const field = Input(
    {
      id: "price-field",
      props: {
        name: "price",
        label: "Unit Price",
        value: price,
        grabType: "GrabDecimal",
        required: true,
      },
    },
    { document }
  );

  body.appendChild(field.element);
  assert.equal(body.querySelectorAll("div").length, 0);
  assert.equal(field.element.localName, "label");
  assert.equal(field.element.getAttribute("for"), field.input.getAttribute("id"));
  assert.equal(field.input.getAttribute("type"), "text");
  assert.equal(field.input.getAttribute("inputmode"), "decimal");
  assert.equal(field.input.value, "19.95");

  // Exact trailing zeros preserved (never coerced to 19.9)
  field.input.value = "19.90";
  field.input.dispatchEvent({ type: "input", target: field.input });
  assert.equal(price.get(), "19.90");
  assert.equal(field.validate(), true);

  // Invalid decimal triggers aria-invalid + role="alert"
  field.input.value = "not-a-decimal";
  field.input.dispatchEvent({ type: "input", target: field.input });
  field.input.dispatchEvent({ type: "blur" });
  assert.equal(field.input.getAttribute("aria-invalid"), "true");
  const alertEl = field.element.querySelector('[role="alert"]');
  assert.equal(alertEl.hasAttribute("hidden"), false);
  assert.match(alertEl.textContent, /base-10 decimal/);

  field.dispose();
});

test("Select renders <option> and <optgroup> and syncs reactive value signal", () => {
  const { document, body } = createTestEnv();
  const category = signal("wool");

  const sel = Select(
    {
      id: "cat-select",
      props: {
        name: "category",
        label: "Category",
        value: category,
        options: [
          { value: "all", label: "All Products" },
          {
            group: "Apparel",
            options: [
              { value: "wool", label: "Merino Wool" },
              { value: "linen", label: "Linen" },
            ],
          },
        ],
      },
    },
    { document }
  );

  body.appendChild(sel.element);
  assert.equal(body.querySelectorAll("div").length, 0);
  assert.equal(sel.select.querySelectorAll("optgroup").length, 1);
  assert.equal(sel.select.querySelectorAll("option").length, 3);
  assert.equal(sel.select.value, "wool");

  sel.select.value = "linen";
  sel.select.dispatchEvent({ type: "change", target: sel.select });
  assert.equal(category.get(), "linen");

  sel.dispose();
});

test("Tabs supports WAI-ARIA roles and ArrowLeft/ArrowRight/Home/End keyboard navigation", () => {
  const { document, body } = createTestEnv();

  const tabs = Tabs(
    {
      id: "product-tabs",
      props: {
        label: "Product Details",
        tabs: [
          { id: "desc", label: "Description", content: "Soft merino wool." },
          { id: "care", label: "Care", content: "Hand wash cold." },
          { id: "ship", label: "Shipping", content: "Ships in 24h." },
        ],
      },
    },
    { document }
  );

  body.appendChild(tabs.element);
  assert.equal(body.querySelectorAll("div").length, 0);

  const tablist = tabs.element.querySelector('[role="tablist"]');
  const tabBtns = tabs.element.querySelectorAll('[role="tab"]');
  const panels = tabs.element.querySelectorAll('[role="tabpanel"]');
  assert.equal(tabBtns.length, 3);
  assert.equal(panels.length, 3);
  assert.equal(tabBtns[0].getAttribute("aria-selected"), "true");
  assert.equal(tabBtns[0].getAttribute("tabindex"), "0");
  assert.equal(tabBtns[1].getAttribute("tabindex"), "-1");
  assert.equal(panels[1].hasAttribute("hidden"), true);

  // ArrowRight -> moves to Care & focuses button
  tablist.dispatchEvent({ type: "keydown", key: "ArrowRight" });
  assert.equal(tabs.activeId.get(), "care");
  assert.equal(document.activeElement, tabBtns[1]);
  assert.equal(panels[1].hasAttribute("hidden"), false);

  // End -> moves to Shipping
  tablist.dispatchEvent({ type: "keydown", key: "End" });
  assert.equal(tabs.activeId.get(), "ship");
  assert.equal(document.activeElement, tabBtns[2]);

  // ArrowRight wraps to Description
  tablist.dispatchEvent({ type: "keydown", key: "ArrowRight" });
  assert.equal(tabs.activeId.get(), "desc");
  assert.equal(document.activeElement, tabBtns[0]);

  // ArrowLeft wraps to Shipping
  tablist.dispatchEvent({ type: "keydown", key: "ArrowLeft" });
  assert.equal(tabs.activeId.get(), "ship");

  // Home -> moves to Description
  tablist.dispatchEvent({ type: "keydown", key: "Home" });
  assert.equal(tabs.activeId.get(), "desc");

  tabs.dispose();
});

test("Accordion renders native <details>/<summary> and enforces singleOpen mode", () => {
  const { document, body } = createTestEnv();

  const acc = Accordion(
    {
      props: {
        singleOpen: true,
        items: [
          { id: "q1", summary: "Return policy?", content: "30-day returns.", open: true },
          { id: "q2", summary: "Warranty?", content: "2-year warranty." },
        ],
      },
    },
    { document }
  );

  body.appendChild(acc.element);
  assert.equal(body.querySelectorAll("div").length, 0);
  const details = acc.element.querySelectorAll("details");
  assert.equal(details.length, 2);
  assert.equal(details[0].open, true);
  assert.equal(details[1].open, false);

  details[1].open = true;
  details[1].dispatchEvent({ type: "toggle" });
  assert.equal(details[0].open, false);
  assert.equal(details[1].open, true);
  assert.deepEqual(acc.openIds.get(), ["q2"]);

  acc.dispose();
});

test("Modal uses native <dialog>, traps Tab focus, closes on Escape, and restores trigger focus", () => {
  const { document, body } = createTestEnv();
  const triggerBtn = document.createElement("button");
  triggerBtn.textContent = "Open Cart";
  body.appendChild(triggerBtn);
  triggerBtn.focus();

  const open = signal(false);
  const firstBtn = document.createElement("button");
  firstBtn.textContent = "Keep Shopping";
  const secondBtn = document.createElement("button");
  secondBtn.textContent = "Checkout";

  const modal = Modal(
    {
      id: "cart-modal",
      props: { open, title: "Your Cart" },
      children: [firstBtn, secondBtn],
    },
    { document }
  );
  body.appendChild(modal.element);
  assert.equal(body.querySelectorAll("div").length, 0);
  assert.equal(modal.element.localName, "dialog");
  assert.equal(modal.element.getAttribute("aria-modal"), "true");

  // Opening calls showModal() and moves focus inside dialog
  open.set(true);
  assert.equal(modal.element.showModalCount, 1);
  assert.equal(modal.element.open, true);
  assert.equal(document.activeElement, firstBtn);

  // Shift+Tab from first button wraps to last button
  modal.element.dispatchEvent({ type: "keydown", key: "Tab", shiftKey: true });
  assert.equal(document.activeElement, secondBtn);

  // Tab from last button wraps to first button
  modal.element.dispatchEvent({ type: "keydown", key: "Tab", shiftKey: false });
  assert.equal(document.activeElement, firstBtn);

  // Escape closes dialog and restores focus to triggerBtn
  modal.element.dispatchEvent({ type: "keydown", key: "Escape" });
  assert.equal(open.get(), false);
  assert.equal(modal.element.open, false);
  assert.equal(modal.element.closeCount, 1);
  assert.equal(document.activeElement, triggerBtn);

  modal.dispose();
});

test("Nav validates links, toggles mobile disclosure, and updates aria-current='page'", () => {
  const { document, body } = createTestEnv();
  assert.throws(
    () => Nav({ props: { items: [{ href: "javascript:alert(1)", text: "Evil" }] } }, { document }),
    GrexSecurityError
  );

  const activePath = signal("/");
  const nav = Nav(
    {
      id: "main-nav",
      props: {
        label: "Primary",
        collapsible: true,
        activePath,
        items: [
          { href: "/", text: "Home" },
          { href: "/shop", text: "Shop" },
          { href: "https://grab.dev", text: "Docs", external: true },
        ],
      },
    },
    { document }
  );

  body.appendChild(nav.element);
  assert.equal(body.querySelectorAll("div").length, 0);
  const toggle = nav.element.querySelector("button");
  const links = nav.element.querySelectorAll("a");
  assert.equal(toggle.getAttribute("aria-expanded"), "false");
  assert.equal(links[0].getAttribute("aria-current"), "page");
  assert.equal(links[1].getAttribute("aria-current"), null);
  assert.equal(links[2].getAttribute("rel"), "noopener noreferrer");

  toggle.dispatchEvent({ type: "click" });
  assert.equal(toggle.getAttribute("aria-expanded"), "true");

  activePath.set("/shop");
  assert.equal(links[0].getAttribute("aria-current"), null);
  assert.equal(links[1].getAttribute("aria-current"), "page");

  nav.dispose();
});

test("ForEach keyed repeater reuses DOM nodes on reorder/update and disposes removed items", () => {
  const { document, body } = createTestEnv();
  const items = signal([
    { id: "a", name: "Beanie", price: "19.95" },
    { id: "b", name: "Scarf", price: "29.00" },
    { id: "c", name: "Gloves", price: "24.50" },
  ]);

  let createCount = 0;
  let disposedKeys = [];

  const repeater = ForEach(
    {
      parent: { type: "Grid", id: "shop-grid", props: { columns: "repeat(3, 1fr)" } },
      items,
      key: (item) => item.id,
      render: (itemSig) => {
        createCount += 1;
        const id = itemSig.peek().id;
        const card = Card(
          {
            id: `item-${id}`,
            children: [
              Heading({ props: { level: 3, text: () => itemSig.get().name } }, { document }),
              Text({ props: { text: () => itemSig.get().price } }, { document }),
            ],
          },
          { document }
        );
        return {
          element: card.element,
          dispose() {
            disposedKeys.push(id);
            card.dispose();
          },
        };
      },
      empty: () => Text({ props: { text: "Empty catalog" } }, { document }),
    },
    { document }
  );

  body.appendChild(repeater.element);
  assert.equal(body.querySelectorAll("div").length, 0);
  assert.equal(createCount, 3);

  const origNodeA = repeater.element.children[0];
  const origNodeC = repeater.element.children[2];

  // Reorder C before A, update A's price, and remove B
  items.set([
    { id: "c", name: "Gloves", price: "24.50" },
    { id: "a", name: "Merino Beanie", price: "21.95" },
  ]);

  assert.equal(createCount, 3); // Zero extra DOM elements created
  assert.deepEqual(disposedKeys, ["b"]);
  assert.equal(repeater.element.children.length, 2);
  assert.equal(repeater.element.children[0], origNodeC); // exact node identity preserved
  assert.equal(repeater.element.children[1], origNodeA); // exact node identity preserved
  assert.equal(origNodeA.querySelector("h3").textContent, "Merino Beanie");
  assert.equal(origNodeA.querySelector("p").textContent, "21.95");

  // Empty state renders cleanly and disposes remaining items
  items.set([]);
  assert.deepEqual(disposedKeys, ["b", "c", "a"]);
  assert.equal(repeater.element.textContent, "Empty catalog");

  repeater.dispose();
});
