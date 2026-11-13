import test from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  createGrabClient,
  useQuery,
  useMutation,
  invalidateQueries,
  connectSocketInvalidation,
  GrexSecurityError,
} from "../src/index.js";

function makeJsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test("createGrabClient enforces same-origin defaults, contract checks, CSRF tokens, and exact GrabDecimal strings", async () => {
  const seenCalls = [];
  const contract = {
    routes: [
      { method: "GET", path: "/api/products" },
      { method: "POST", path: "/api/orders" },
    ],
  };

  const client = createGrabClient({
    contract,
    csrfToken: () => "csrf-secret-99",
    fetch: async (url, init) => {
      seenCalls.push({ url, init });
      return makeJsonResponse(200, {
        sku: "BEANIE-01",
        price: "19.95",
        stock: "9007199254740993123456",
      });
    },
  });

  // 1. GET uses credentials: "same-origin" and preserves exact GRAB strings
  const prod = await client.get("/api/products", { query: { category: "wool" } });
  assert.equal(seenCalls[0].url, "/api/products?category=wool");
  assert.equal(seenCalls[0].init.credentials, "same-origin");
  assert.equal(prod.price, "19.95");
  assert.equal(prod.stock, "9007199254740993123456");

  // 2. POST automatically includes X-CSRF-Token
  await client.post("/api/orders", { sku: "BEANIE-01", qty: 1 });
  assert.equal(seenCalls[1].init.headers["X-CSRF-Token"], "csrf-secret-99");

  // 3. Undeclared contract route rejected fail-closed
  await assert.rejects(() => client.get("/api/admin"), GrexSecurityError);

  // 4. Unsafe POST without CSRF token rejected fail-closed
  const noCsrfClient = createGrabClient({
    fetch: async () => makeJsonResponse(200, {}),
  });
  await assert.rejects(() => noCsrfClient.post("/api/orders", {}), GrexSecurityError);
});

test("useQuery aborts stale in-flight requests via AbortController when params change (race-condition safety)", async () => {
  const category = signal("hats");
  const abortedUrls = [];
  const resolvers = new Map();

  const client = createGrabClient({
    fetch: (url, init) =>
      new Promise((resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          abortedUrls.push(url);
          reject(new DOMException("Aborted", "AbortError"));
        });
        resolvers.set(url, resolve);
      }),
  });

  const query = useQuery(
    client,
    () => ({ path: "/api/products", query: { category: category.get() } }),
    { tags: ["products"] }
  );

  assert.equal(query.loading.get(), true);

  // Trigger second request BEFORE first request settles -> first must be aborted
  category.set("scarves");
  assert.deepEqual(abortedUrls, ["/api/products?category=hats"]);

  // Resolve the second request
  resolvers.get("/api/products?category=scarves")(
    makeJsonResponse(200, { items: [{ id: "s1", price: "29.95" }] })
  );
  await new Promise((r) => setTimeout(r, 0));

  assert.equal(query.loading.get(), false);
  assert.equal(query.error.get(), null);
  assert.equal(query.data.get().items[0].price, "29.95");

  query.dispose();
});

test("useMutation and WebSocket connectSocketInvalidation trigger tag-based query refetch", async () => {
  let fetchCount = 0;
  const client = createGrabClient({
    csrfToken: "tok-1",
    fetch: async (url, init) => {
      if (init.method === "GET") {
        fetchCount += 1;
        return makeJsonResponse(200, { count: fetchCount, price: "19.95" });
      }
      return makeJsonResponse(201, { created: true });
    },
  });

  const query = useQuery(client, "/api/cart", { tags: ["cart"] });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(query.data.get().count, 1);

  const mutation = useMutation(client, "/api/cart", { invalidates: ["cart"] });
  await mutation.mutate({ sku: "BEANIE-01" });
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(query.data.get().count, 2);

  // WebSocket invalidation (origin-checked)
  const listeners = new Set();
  const fakeSocket = {
    addEventListener: (_t, fn) => listeners.add(fn),
    removeEventListener: (_t, fn) => listeners.delete(fn),
  };
  const stopSocket = connectSocketInvalidation(fakeSocket, {
    allowedOrigins: ["https://shop.example"],
  });

  // Untrusted origin ignored
  for (const fn of listeners) {
    fn({ origin: "https://evil.example", data: JSON.stringify({ type: "invalidate", tags: ["cart"] }) });
  }
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(query.data.get().count, 2);

  // Trusted origin triggers refetch
  for (const fn of listeners) {
    fn({ origin: "https://shop.example", data: JSON.stringify({ type: "invalidate", tags: ["cart"] }) });
  }
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(query.data.get().count, 3);

  invalidateQueries("cart");
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(query.data.get().count, 4);

  stopSocket();
  assert.equal(listeners.size, 0);
  mutation.dispose();
  query.dispose();
});
