import test from "node:test";
import assert from "node:assert/strict";
import {
  signal,
  computed,
  effect,
  batch,
  untrack,
  isExactGrabWireString,
  formatGrabDecimal,
} from "../src/index.js";

test("signal get/set and Object.is equality guard", () => {
  const count = signal(0);
  let runs = 0;
  const dispose = effect(() => {
    count.get();
    runs += 1;
  });

  assert.equal(runs, 1);
  count.set(0); // same value -> no re-run
  assert.equal(runs, 1);
  count.set(1);
  assert.equal(runs, 2);
  count.set((prev) => prev + 4);
  assert.equal(count.peek(), 5);
  assert.equal(runs, 3);
  dispose();
});

test("computed memoizes and prevents diamond-dependency glitches", () => {
  const a = signal(1);
  const b = computed(() => a.get() * 2);
  const c = computed(() => a.get() + 10);
  let dEvaluations = 0;
  const d = computed(() => {
    dEvaluations += 1;
    return b.get() + c.get();
  });

  const observed = [];
  const dispose = effect(() => {
    observed.push(d.get());
  });

  assert.deepEqual(observed, [13]);
  assert.equal(dEvaluations, 1);

  a.set(2);
  assert.deepEqual(observed, [13, 16]);
  assert.equal(dEvaluations, 2);

  // Reading computed repeatedly without upstream change does not recompute
  assert.equal(d.get(), 16);
  assert.equal(dEvaluations, 2);

  dispose();
});

test("computed stability avoids unnecessary downstream effect runs", () => {
  const num = signal(2);
  const isEven = computed(() => num.get() % 2 === 0);
  let effectRuns = 0;

  const dispose = effect(() => {
    isEven.get();
    effectRuns += 1;
  });

  assert.equal(effectRuns, 1);
  num.set(4); // still even -> isEven stays true -> effect must NOT re-run
  assert.equal(effectRuns, 1);
  num.set(5); // odd -> isEven becomes false -> effect runs
  assert.equal(effectRuns, 2);
  dispose();
});

test("batch coalesces multiple updates including nested batches", () => {
  const first = signal("Northbound");
  const last = signal("Goods");
  const snapshots = [];

  const dispose = effect(() => {
    snapshots.push(`${first.get()} ${last.get()}`);
  });

  assert.deepEqual(snapshots, ["Northbound Goods"]);

  batch(() => {
    first.set("GrabLab");
    batch(() => {
      last.set("Store");
    });
    assert.deepEqual(snapshots, ["Northbound Goods"]);
  });

  assert.deepEqual(snapshots, ["Northbound Goods", "GrabLab Store"]);
  dispose();
});

test("dynamic dependency switching unsubscribes stale branches", () => {
  const useA = signal(true);
  const a = signal("A1");
  const b = signal("B1");
  const seen = [];

  const dispose = effect(() => {
    seen.push(useA.get() ? a.get() : b.get());
  });

  assert.deepEqual(seen, ["A1"]);
  b.set("B2"); // b is not tracked while useA is true
  assert.deepEqual(seen, ["A1"]);

  useA.set(false);
  assert.deepEqual(seen, ["A1", "B2"]);

  a.set("A2"); // a is no longer tracked
  assert.deepEqual(seen, ["A1", "B2"]);
  dispose();
});

test("effect cleanup callback runs before re-run and on dispose()", () => {
  const s = signal(1);
  const log = [];

  const dispose = effect(() => {
    const v = s.get();
    log.push(`run:${v}`);
    return () => {
      log.push(`cleanup:${v}`);
    };
  });

  s.set(2);
  dispose();
  dispose(); // idempotent
  s.set(3); // no effect runs after disposal

  assert.deepEqual(log, ["run:1", "cleanup:1", "run:2", "cleanup:2"]);
});

test("untrack reads signals without subscribing", () => {
  const tracked = signal(1);
  const ignored = signal(100);
  let runs = 0;

  const dispose = effect(() => {
    tracked.get();
    untrack(() => ignored.get());
    runs += 1;
  });

  assert.equal(runs, 1);
  ignored.set(200);
  assert.equal(runs, 1);
  tracked.set(2);
  assert.equal(runs, 2);
  dispose();
});

test("preserves exact GRAB GrabInteger/GrabDecimal wire strings without IEEE-754 float coercion", () => {
  // Values that would lose precision or alter formatting under Number() / parseFloat()
  const exactPrice = signal("19.95");
  const bigInteger = signal("9007199254740993123456");
  const zeroSumCase = signal("0.30");

  assert.equal(isExactGrabWireString(exactPrice.get()), true);
  assert.equal(isExactGrabWireString(bigInteger.get()), true);
  assert.equal(isExactGrabWireString("abc"), false);

  assert.equal(exactPrice.get(), "19.95");
  assert.equal(bigInteger.get(), "9007199254740993123456");
  assert.equal(formatGrabDecimal(exactPrice.get(), { prefix: "$", decimals: 2 }), "$19.95");
  assert.equal(formatGrabDecimal("1234567.8", { prefix: "$", decimals: 2 }), "$1,234,567.80");
  assert.equal(formatGrabDecimal(bigInteger.get(), { groupSeparator: "" }), "9007199254740993123456");
  assert.equal(formatGrabDecimal(zeroSumCase.get(), { prefix: "$" }), "$0.30");
  assert.equal(formatGrabDecimal("-42.50", { prefix: "$", decimals: 2 }), "-$42.50");
});
