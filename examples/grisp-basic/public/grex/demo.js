import {
  signal,
  computed,
  hydrate,
  formatGrabDecimal,
  createPreviewBridge,
  Card,
  Stack,
  Heading,
  RichText,
  Icon,
} from "./grex.js";

const title = signal("Northbound Goods");
const rawPrice = signal("19.95");
const quantity = signal(1);

// Preserves exact GRAB decimal wire string without IEEE-754 float coercion
const formattedPrice = computed(() =>
  formatGrabDecimal(rawPrice.get(), { prefix: "$", decimals: 2 })
);

const ctx = hydrate(document, {
  signals: {
    title,
    formattedPrice,
    quantity,
  },
  actions: {
    increment() {
      quantity.set((q) => q + 1);
    },
  },
});

// Mount a zero-wrapper-div v0.2 Card + RichText + Icon directly inside the semantic Grid
const grid = document.querySelector('[data-grex-id="catalog-grid"]');
if (grid) {
  const promoCard = Card({
    id: "v02-promo-card",
    props: { elevated: true },
    children: [
      Stack({
        props: { direction: "column", gap: "12px" },
        children: [
          Icon({
            props: {
              label: "Verified Grex v0.2 Semantic Card",
              paths: [{ tag: "path", attrs: { d: "M5 13l4 4L19 7", stroke: "#0d9488", "stroke-width": "2" } }],
            },
          }),
          Heading({ props: { level: 2, text: "Zero-Bloat v0.2 Element" } }),
          RichText({
            props: {
              nodes: [
                "Rendered cleanly as ",
                { tag: "code", text: "<article>" },
                " with ",
                { tag: "strong", text: "zero wrapper <div>s" },
                ".",
              ],
            },
          }),
        ],
      }),
    ],
  });
  grid.appendChild(promoCard.element);
}

// Origin-checked live split-screen preview bridge (same-origin by default)
const bridge = createPreviewBridge({
  allowedOrigins: [window.location.origin],
  targetWindow: window,
  root: document,
  signals: {
    title,
    rawPrice,
    quantity,
  },
  elements: ctx.elements,
});
bridge.start();
