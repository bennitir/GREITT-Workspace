import assert from "node:assert/strict";
import test from "node:test";
import { buildReconciliationCoverageSnapshot } from "./coverage";

const item = (
  key: string,
  state: "CONFIRMED" | "STRONG_UNCONFIRMED" | "AMBIGUOUS" | "UNRESOLVED" | "EXCLUDED" | "UNKNOWN",
  amount: string | number | null = "100",
  currency = "ISK",
) => ({ key, state, amount, currency });

test("required 1:1 coverage exposes missing counterpart before deep analysis", () => {
  const result = buildReconciliationCoverageSnapshot({
    mode: "REQUIRED",
    cardinality: "ONE_TO_ONE",
    source: [
      item("tx-1", "CONFIRMED", "1000"),
      item("tx-2", "CONFIRMED", "2000"),
      item("tx-3", "UNRESOLVED", "3000"),
    ],
    target: [
      item("doc-1", "CONFIRMED", "1000"),
      item("doc-2", "CONFIRMED", "2000"),
    ],
  });

  assert.equal(result.assessment, "OPEN");
  assert.equal(result.comparison.count.state, "SOURCE_EXCESS");
  assert.equal(result.comparison.count.targetPerSourcePercent, 66.7);
  assert.equal(result.openWork.sourceUnresolvedCount, 1);
  assert.deepEqual(result.comparison.amountByCurrency.ISK, {
    sourceAbsoluteAmount: "6000",
    targetAbsoluteAmount: "3000",
    targetMinusSource: "-3000",
    targetPerSourcePercent: 50,
    completeness: "COMPLETE",
  });
});

test("excluded mixed-use context never becomes a missing-document alarm", () => {
  const result = buildReconciliationCoverageSnapshot({
    mode: "EXCLUDED",
    cardinality: "ONE_TO_ONE",
    source: [item("private-or-business", "UNRESOLVED", "8144")],
    target: [],
  });

  assert.equal(result.assessment, "EXCLUDED");
  assert.equal(result.comparison.count.state, "SOURCE_EXCESS");
  assert.equal(result.openWork.sourceUnresolvedCount, 1);
});

test("informational coverage reports ratios without asserting completeness", () => {
  const result = buildReconciliationCoverageSnapshot({
    mode: "INFORMATIONAL",
    cardinality: "ONE_TO_ONE",
    source: [item("a", "CONFIRMED"), item("b", "UNRESOLVED")],
    target: [item("x", "CONFIRMED")],
  });

  assert.equal(result.assessment, "INFORMATIONAL");
  assert.equal(result.comparison.count.comparability, "INFORMATIONAL");
  assert.equal(result.comparison.count.targetPerSourcePercent, 50);
});

test("non-1:1 flow does not misuse count equality as a health rule", () => {
  const result = buildReconciliationCoverageSnapshot({
    mode: "REQUIRED",
    cardinality: "ONE_TO_MANY",
    source: [item("payment", "CONFIRMED", "3000")],
    target: [
      item("invoice-1", "CONFIRMED", "1000"),
      item("invoice-2", "CONFIRMED", "2000"),
    ],
  });

  assert.equal(result.comparison.count.state, "NOT_COMPARABLE");
  assert.equal(result.comparison.count.targetPerSourcePercent, null);
  assert.equal(result.assessment, "COMPLETE");
  assert.equal(result.comparison.amountByCurrency.ISK.targetMinusSource, "0");
});

test("excluded and unknown rows are visible but not silently added to in-scope denominator", () => {
  const result = buildReconciliationCoverageSnapshot({
    mode: "REQUIRED",
    cardinality: "ONE_TO_ONE",
    source: [
      item("purchase", "CONFIRMED", "1000"),
      item("cash-withdrawal", "EXCLUDED", "5000"),
      item("not-classified", "UNKNOWN", "7000"),
    ],
    target: [item("receipt", "CONFIRMED", "1000")],
  });

  assert.equal(result.source.total.count, 3);
  assert.equal(result.source.inScope.count, 1);
  assert.equal(result.source.excluded.count, 1);
  assert.equal(result.source.unknown.count, 1);
  assert.equal(result.assessment, "NOT_EVALUATED");
});

test("amount aggregation is absolute, exact and currency-separated", () => {
  const result = buildReconciliationCoverageSnapshot({
    mode: "REQUIRED",
    cardinality: "ONE_TO_ONE",
    source: [
      item("isk-1", "CONFIRMED", "-0.10", "ISK"),
      item("isk-2", "CONFIRMED", "0.20", "ISK"),
      item("eur", "CONFIRMED", "12.34", "EUR"),
    ],
    target: [
      item("isk-a", "CONFIRMED", "0.30", "ISK"),
      item("eur-a", "CONFIRMED", "12.34", "EUR"),
      item("extra", "EXCLUDED", "999", "ISK"),
    ],
  });

  assert.equal(result.source.inScope.absoluteAmountByCurrency.ISK, "0.3");
  assert.equal(result.source.inScope.absoluteAmountByCurrency.EUR, "12.34");
  assert.equal(result.target.inScope.absoluteAmountByCurrency.ISK, "0.3");
  assert.equal(result.comparison.amountByCurrency.ISK.targetMinusSource, "0");
  assert.equal(result.target.excluded.absoluteAmountByCurrency.ISK, "999");
});

test("invalid or missing amounts make amount coverage partial without inventing zero", () => {
  const result = buildReconciliationCoverageSnapshot({
    mode: "REQUIRED",
    cardinality: "ONE_TO_ONE",
    source: [item("known", "CONFIRMED", "100"), item("missing", "UNRESOLVED", null)],
    target: [item("target", "CONFIRMED", "100")],
  });

  assert.equal(result.source.inScope.amountCompleteness, "PARTIAL");
  assert.equal(result.source.inScope.unknownAmountCount, 1);
  assert.equal(result.comparison.amountByCurrency.ISK.completeness, "PARTIAL");
});
