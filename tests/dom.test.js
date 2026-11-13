import test from "node:test";
import assert from "node:assert/strict";
import { signal, renderElement, bindElement, hydrate } from "../src/index.js";
import { createTestEnv } from "./helpers/dom-shim.js";

test("renderElement outputs clean semantic HTML5 nodes with zero wrapper <div> elements", () => {
  const { document, body } = createTestEnv();
  const title = signal("Northbound Goods");
  const price = signal("19.95");
  const accent = signal("#0d9488");
  let clicks = 0;

  const card = renderElement(
    {
      tag: "article",
      attrs: { class: "product-card", "data-grex-id": "card-1" },
      tokens: { "--grex-accent": accent },
      children: [
        { tag: "header", children: [{ tag: "h2", text: title }] },
        { tag: "p", attrs: { class: "price" }, children: ["$", price] },
        {
          tag: "button",
          attrs: { type: "button" },
          text: "Add to Cart",
          on: { click: () => { clicks += 1; } },
        },
      ],
    },
    { document }
  );

  body.appendChild(card.element);

  // Zero wrapper <div> bloat anywhere in the tree
  assert.equal(body.querySelectorAll("div").length, 0);
  assert.equal(card.element.localName, "article");
  assert.equal(card.element.style.getPropertyValue("--grex-accent"), "#0d9488");
  assert.equal(card.element.querySelector("h2").textContent, "Northbound Goods");
  assert.equal(card.element.querySelector("p").textContent, "$19.95");

  // Reactive updates mutate only the targeted text/token nodes
  title.set("Updated Goods");
  price.set("24.00");
  accent.set("#0284c7");
  assert.equal(card.element.querySelector("h2").textContent, "Updated Goods");
  assert.equal(card.element.querySelector("p").textContent, "$24.00");
  assert.equal(card.element.style.getPropertyValue("--grex-accent"), "#0284c7");

  const btn = card.element.querySelector("button");
  btn.dispatchEvent({ type: "click" });
  assert.equal(clicks, 1);

  card.dispose();
  assert.equal(btn.listenerCount("click"), 0);
  title.set("After Dispose");
  assert.equal(card.element.querySelector("h2").textContent, "Updated Goods");
});

test("hydrate attaches reactivity in place on server-rendered .grab.html markup without recreating nodes", () => {
  const { document, body } = createTestEnv();

  const section = document.createElement("section");
  section.setAttribute("data-grex-id", "hero");
  const heading = document.createElement("h1");
  heading.setAttribute("data-grex-id", "hero-title");
  heading.setAttribute("data-grex-text", "heroTitle");
  heading.textContent = "Server Rendered Title";

  const priceEl = document.createElement("p");
  priceEl.setAttribute("data-grex-id", "hero-price");
  priceEl.setAttribute("data-grex-text", "heroPrice");
  priceEl.textContent = "19.95";

  const cta = document.createElement("a");
  cta.setAttribute("data-grex-id", "hero-cta");
  cta.setAttribute("data-grex-attr-href", "ctaHref");
  cta.setAttribute("data-grex-token-cta-bg", "ctaBg");
  cta.setAttribute("data-grex-on-click", "trackClick");
  cta.setAttribute("href", "/shop");
  cta.textContent = "Shop Now";

  section.appendChild(heading);
  section.appendChild(priceEl);
  section.appendChild(cta);
  body.appendChild(section);

  const heroTitle = signal("Hydrated Title");
  const heroPrice = signal("19.95");
  const ctaHref = signal("/catalog/winter");
  const ctaBg = signal("#0f172a");
  let tracked = 0;

  const ctx = hydrate(body, {
    signals: { heroTitle, heroPrice, ctaHref, ctaBg },
    actions: { trackClick: () => { tracked += 1; } },
  });

  // Same exact DOM node references retained (selective in-place hydration, zero wrapper divs)
  assert.equal(ctx.elements["hero"], section);
  assert.equal(ctx.elements["hero-title"], heading);
  assert.equal(ctx.elements["hero-cta"], cta);
  assert.equal(body.querySelectorAll("div").length, 0);

  assert.equal(heading.textContent, "Hydrated Title");
  assert.equal(priceEl.textContent, "19.95");
  assert.equal(cta.getAttribute("href"), "/catalog/winter");
  assert.equal(cta.style.getPropertyValue("--grex-cta-bg"), "#0f172a");

  cta.dispatchEvent({ type: "click" });
  assert.equal(tracked, 1);

  heroPrice.set("29.90");
  assert.equal(priceEl.textContent, "29.90");

  ctx.dispose();
  assert.equal(cta.listenerCount("click"), 0);
});

test("bindElement supports boolean attributes and cleanup", () => {
  const { document } = createTestEnv();
  const btn = document.createElement("button");
  const disabled = signal(true);

  const bound = bindElement(btn, { attrs: { disabled } });
  assert.equal(btn.hasAttribute("disabled"), true);
  disabled.set(false);
  assert.equal(btn.hasAttribute("disabled"), false);
  bound.dispose();
});
