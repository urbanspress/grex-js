/**
 * Grex JS v0.3 GRAB 1.0 grab.api.json Data Binding Client, Queries & Mutations (ADR-025b, ADR-025c, ADR-025f).
 * - Same-origin credentials default
 * - Bounded timeout (10s default, 60s max) & AbortController race-condition cancellation
 * - Mandatory CSRF token on unsafe mutations (POST/PUT/PATCH/DELETE)
 * - Exact base-10 GrabInteger/GrabDecimal string preservation
 */

import { effect, signal } from "./signals.js";
import { GrexSecurityError, isSafeUrl } from "./security.js";

const UNSAFE_HTTP_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const querySubscribers = new Map();

function subscribeQueryTag(tag, refetchFn) {
  if (!tag) {
    return () => {};
  }
  const key = String(tag);
  if (!querySubscribers.has(key)) {
    querySubscribers.set(key, new Set());
  }
  querySubscribers.get(key).add(refetchFn);
  return () => {
    const set = querySubscribers.get(key);
    if (set) {
      set.delete(refetchFn);
      if (set.size === 0) {
        querySubscribers.delete(key);
      }
    }
  };
}

/**
 * Invalidate and refetch all active queries subscribed to the given tag(s).
 * @param {string | string[]} tags
 */
export function invalidateQueries(tags) {
  const list = Array.isArray(tags) ? tags : [tags];
  const called = new Set();
  for (const tag of list) {
    const set = querySubscribers.get(String(tag));
    if (!set) {
      continue;
    }
    for (const refetchFn of Array.from(set)) {
      if (!called.has(refetchFn)) {
        called.add(refetchFn);
        refetchFn();
      }
    }
  }
}

/**
 * Connect an authorized use-sockets WebSocket or message target to invalidate queries.
 * Message format: { type: "invalidate", tags: ["products", ...] } or JSON string.
 *
 * @param {EventTarget} socketOrTarget
 * @param {{ allowedOrigins?: string[] }} [options]
 * @returns {() => void} dispose callback
 */
export function connectSocketInvalidation(socketOrTarget, options = {}) {
  if (!socketOrTarget || typeof socketOrTarget.addEventListener !== "function") {
    throw new TypeError("connectSocketInvalidation requires a WebSocket or EventTarget.");
  }
  const allowedOrigins = Array.isArray(options.allowedOrigins) ? new Set(options.allowedOrigins) : null;

  const onMessage = (event) => {
    if (allowedOrigins && (!event || !allowedOrigins.has(event.origin))) {
      return;
    }
    let payload = event && event.data;
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        return;
      }
    }
    if (payload && typeof payload === "object" && payload.type === "invalidate" && payload.tags) {
      invalidateQueries(payload.tags);
    }
  };

  socketOrTarget.addEventListener("message", onMessage);
  return () => {
    socketOrTarget.removeEventListener("message", onMessage);
  };
}

function resolveContractEndpoint(contract, method, routePath) {
  if (!contract || typeof contract !== "object") {
    return;
  }
  const routes = contract.routes || contract.endpoints;
  if (!Array.isArray(routes)) {
    return;
  }
  const cleanMethod = method.toUpperCase();
  const found = routes.some(
    (r) => String(r.method || "GET").toUpperCase() === cleanMethod && r.path === routePath
  );
  if (!found) {
    throw new GrexSecurityError(`Endpoint ${cleanMethod} ${routePath} is not declared in grab.api.json contract.`);
  }
}

function buildRequestUrl(baseUrl, reqPath, query) {
  const base = baseUrl ? baseUrl.replace(/\/+$/, "") : "";
  const pathPart = reqPath.startsWith("/") ? reqPath : `/${reqPath}`;
  const fullPath = `${base}${pathPart}`;
  if (!isSafeUrl(fullPath)) {
    throw new GrexSecurityError(`Unsafe request URL blocked: "${fullPath}".`);
  }
  if (!query || typeof query !== "object") {
    return fullPath;
  }
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) {
      search.set(k, String(v));
    }
  }
  const qs = search.toString();
  return qs ? `${fullPath}?${qs}` : fullPath;
}

/**
 * Create a GRAB 1.0 grab.api.json typed fetch client.
 *
 * @param {{
 *   baseUrl?: string,
 *   contract?: object,
 *   credentials?: RequestCredentials,
 *   timeoutMs?: number,
 *   csrfToken?: string | (() => string) | { get(): string },
 *   csrfHeader?: string,
 *   fetch?: typeof globalThis.fetch
 * }} [options]
 */
export function createGrabClient(options = {}) {
  const baseUrl = options.baseUrl || "";
  const contract = options.contract || null;
  const credentials = options.credentials || "same-origin";
  const timeoutMs = options.timeoutMs === undefined ? 10000 : Number(options.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 60000) {
    throw new RangeError("createGrabClient timeoutMs must be between 1 and 60000 ms.");
  }

  const csrfHeader = options.csrfHeader || "X-CSRF-Token";
  const fetchImpl = options.fetch || globalThis.fetch;

  const resolveCsrf = (callToken) => {
    if (callToken !== undefined) {
      return typeof callToken === "function" ? callToken() : callToken;
    }
    if (options.csrfToken && typeof options.csrfToken === "object" && typeof options.csrfToken.get === "function") {
      return options.csrfToken.get();
    }
    if (typeof options.csrfToken === "function") {
      return options.csrfToken();
    }
    return options.csrfToken;
  };

  async function request(req) {
    if (typeof fetchImpl !== "function") {
      throw new Error("createGrabClient requires fetch() implementation.");
    }
    const method = String(req.method || "GET").toUpperCase();
    const pathStr = String(req.path || "");
    resolveContractEndpoint(contract, method, pathStr);

    const url = buildRequestUrl(baseUrl, pathStr, req.query);
    const headers = {
      Accept: "application/json",
      ...(req.headers || {}),
    };

    if (UNSAFE_HTTP_METHODS.has(method)) {
      const token = resolveCsrf(req.csrfToken);
      if (!token || String(token).trim() === "") {
        throw new GrexSecurityError(`Unsafe ${method} request to "${pathStr}" requires an explicit CSRF token.`);
      }
      headers[csrfHeader] = String(token);
    }

    let bodyPayload;
    if (req.body !== undefined) {
      headers["Content-Type"] = "application/json";
      bodyPayload = JSON.stringify(req.body);
    }

    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(new Error("GRAB request timeout exceeded.")), timeoutMs);

    const onExternalAbort = () => timeoutController.abort(req.signal.reason);
    if (req.signal) {
      if (req.signal.aborted) {
        clearTimeout(timer);
        throw req.signal.reason || new DOMException("Aborted", "AbortError");
      }
      req.signal.addEventListener("abort", onExternalAbort, { once: true });
    }

    try {
      const res = await fetchImpl(url, {
        method,
        credentials,
        headers,
        body: bodyPayload,
        signal: timeoutController.signal,
      });

      const rawText = await res.text();
      const parsed = rawText ? JSON.parse(rawText) : null;
      if (!res.ok) {
        const msg = parsed && parsed.error ? parsed.error : `HTTP ${res.status}`;
        const err = new Error(msg);
        err.status = res.status;
        err.payload = parsed;
        throw err;
      }
      return parsed;
    } finally {
      clearTimeout(timer);
      if (req.signal) {
        req.signal.removeEventListener("abort", onExternalAbort);
      }
    }
  }

  return {
    request,
    get: (pathStr, opts = {}) => request({ ...opts, method: "GET", path: pathStr }),
    post: (pathStr, body, opts = {}) => request({ ...opts, method: "POST", path: pathStr, body }),
    put: (pathStr, body, opts = {}) => request({ ...opts, method: "PUT", path: pathStr, body }),
    patch: (pathStr, body, opts = {}) => request({ ...opts, method: "PATCH", path: pathStr, body }),
    delete: (pathStr, opts = {}) => request({ ...opts, method: "DELETE", path: pathStr }),
  };
}

/**
 * Reactive query bound to a GRAB client endpoint with automatic AbortController
 * race-condition cancellation and tag-based cache invalidation.
 *
 * @param {ReturnType<typeof createGrabClient>} client
 * @param {string | (() => { method?: string, path: string, query?: object })} endpointOrFn
 * @param {{ tags?: string[], initialData?: unknown, enabled?: boolean | { get(): boolean } }} [options]
 */
export function useQuery(client, endpointOrFn, options = {}) {
  const data = signal(options.initialData !== undefined ? options.initialData : null);
  const loading = signal(false);
  const error = signal(null);

  let activeController = null;
  let seq = 0;
  let disposed = false;

  const execute = (spec) => {
    if (disposed) {
      return Promise.resolve(null);
    }
    if (activeController) {
      activeController.abort(new Error("Superseded by newer query."));
    }
    const controller = new AbortController();
    activeController = controller;
    const mySeq = ++seq;

    loading.set(true);
    error.set(null);

    const reqSpec = typeof spec === "string" ? { method: "GET", path: spec } : spec;
    return client
      .request({ ...reqSpec, signal: controller.signal })
      .then((res) => {
        if (!disposed && mySeq === seq && !controller.signal.aborted) {
          data.set(res);
          loading.set(false);
        }
        return res;
      })
      .catch((err) => {
        if (!disposed && mySeq === seq && !controller.signal.aborted) {
          error.set(err && err.message ? err.message : String(err));
          loading.set(false);
        }
        return null;
      });
  };

  let lastSpec = null;
  const stopEffect = effect(() => {
    const enabled =
      options.enabled === undefined
        ? true
        : typeof options.enabled === "object" && typeof options.enabled.get === "function"
          ? Boolean(options.enabled.get())
          : Boolean(options.enabled);

    const spec = typeof endpointOrFn === "function" ? endpointOrFn() : endpointOrFn;
    lastSpec = spec;
    if (enabled && spec) {
      execute(spec);
    }
  });

  const unsubTags = [];
  if (Array.isArray(options.tags)) {
    for (const tag of options.tags) {
      unsubTags.push(subscribeQueryTag(tag, () => lastSpec && execute(lastSpec)));
    }
  }

  return {
    data,
    loading,
    error,
    refetch() {
      return lastSpec ? execute(lastSpec) : Promise.resolve(null);
    },
    dispose() {
      disposed = true;
      if (activeController) {
        activeController.abort(new Error("Query disposed."));
        activeController = null;
      }
      stopEffect();
      for (const unsub of unsubTags) {
        unsub();
      }
      unsubTags.length = 0;
    },
  };
}

/**
 * Reactive mutation bound to a GRAB client endpoint with CSRF enforcement and
 * automatic query tag invalidation on success.
 *
 * @param {ReturnType<typeof createGrabClient>} client
 * @param {string} endpoint
 * @param {{ method?: string, invalidates?: string[] }} [options]
 */
export function useMutation(client, endpoint, options = {}) {
  const data = signal(null);
  const loading = signal(false);
  const error = signal(null);
  const method = String(options.method || "POST").toUpperCase();

  let activeController = null;
  let disposed = false;

  async function mutate(body, callOpts = {}) {
    if (disposed) {
      return null;
    }
    if (activeController) {
      activeController.abort(new Error("Superseded by newer mutation."));
    }
    const controller = new AbortController();
    activeController = controller;

    loading.set(true);
    error.set(null);

    try {
      const result = await client.request({
        method,
        path: endpoint,
        body,
        csrfToken: callOpts.csrfToken,
        signal: controller.signal,
      });
      if (!disposed) {
        data.set(result);
        loading.set(false);
        if (Array.isArray(options.invalidates)) {
          invalidateQueries(options.invalidates);
        }
      }
      return result;
    } catch (err) {
      if (!disposed) {
        error.set(err && err.message ? err.message : String(err));
        loading.set(false);
      }
      throw err;
    }
  }

  return {
    mutate,
    data,
    loading,
    error,
    reset() {
      data.set(null);
      error.set(null);
      loading.set(false);
    },
    dispose() {
      disposed = true;
      if (activeController) {
        activeController.abort(new Error("Mutation disposed."));
        activeController = null;
      }
    },
  };
}
