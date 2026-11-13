import {
  signal,
  computed,
  hydrate,
  formatGrabDecimal,
  createPreviewBridge,
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
