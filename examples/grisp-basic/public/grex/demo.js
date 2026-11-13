import {
  signal,
  computed,
  hydrate,
  formatGrabDecimal,
  createPreviewBridge,
  Card,
  Stack,
  Heading,
  Text,
  RichText,
  Icon,
  Form,
  Input,
  Button,
  ForEach,
  createGrabClient,
  useQuery,
  useMutation,
} from "./grex.js";

const title = signal("Northbound Goods");
const rawPrice = signal("19.95");
const quantity = signal(1);
const customPrice = signal("19.95");

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

// GRAB 1.0 grab.api.json-style client with same-origin defaults and CSRF token
const apiClient = createGrabClient({
  csrfToken: () => "demo-session-csrf-token",
});

const catalogQuery = useQuery(apiClient, "/api/catalog", {
  tags: ["catalog"],
  initialData: {
    items: [
      { id: "beanie", name: "Merino Wool Beanie", price: "19.95" },
      { id: "scarf", name: "Alpaca Knit Scarf", price: "34.50" },
    ],
  },
});

const orderMutation = useMutation(apiClient, "/api/orders", {
  invalidates: ["catalog"],
});

const grid = document.querySelector('[data-grex-id="catalog-grid"]');
if (grid) {
  const repeater = ForEach({
    parent: grid,
    items: () => (catalogQuery.data.get() && catalogQuery.data.get().items) || [],
    key: (item) => item.id,
    render: (itemSig) =>
      Card({
        id: `catalog-${itemSig.peek().id}`,
        props: { elevated: true },
        children: [
          Stack({
            props: { direction: "column", gap: "12px" },
            children: [
              Icon({
                props: {
                  label: "Verified Grex v0.3 Item",
                  paths: [{ tag: "path", attrs: { d: "M5 13l4 4L19 7", stroke: "#0d9488", "stroke-width": "2" } }],
                },
              }),
              Heading({ props: { level: 3, text: () => itemSig.get().name } }),
              Text({
                props: {
                  text: () => formatGrabDecimal(itemSig.get().price, { prefix: "$", decimals: 2 }),
                },
              }),
              RichText({
                props: {
                  nodes: [
                    "Exact ",
                    { tag: "code", text: "GrabDecimal" },
                    " string without float rounding.",
                  ],
                },
              }),
            ],
          }),
        ],
      }),
  });

  const orderForm = Form({
    id: "quick-order-form",
    props: {
      action: "/api/orders",
      csrfToken: "demo-session-csrf-token",
      csrfField: "_csrf",
      onSubmit: async ({ values }) => {
        await orderMutation.mutate({ item_id: "beanie", price: values.price });
      },
    },
    children: [
      Input({
        id: "custom-price-input",
        props: {
          name: "price",
          label: "Exact Offer Price (USD)",
          value: customPrice,
          grabType: "GrabDecimal",
          required: true,
        },
      }),
      Button({
        props: { type: "submit", text: "Place Order" },
      }),
    ],
  });

  if (grid.parentNode) {
    grid.parentNode.appendChild(orderForm.element);
  }
  void repeater;
}

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
