import assert from "node:assert/strict";
import test from "node:test";

import {
  SALES_ACTIONS,
  saleLineUsesDiscount,
  salesPermissionsForAction,
} from "./sales-action-policy";

test("every exposed sales action requires SALE_USE", () => {
  for (const action of SALES_ACTIONS) {
    assert.equal(
      salesPermissionsForAction(action).includes("SALE_USE"),
      true,
      `${action} must require SALE_USE`,
    );
  }
});

test("hold and resume also require SALE_HOLD", () => {
  assert.deepEqual(salesPermissionsForAction("HOLD"), ["SALE_USE", "SALE_HOLD"]);
  assert.deepEqual(salesPermissionsForAction("RESUME"), ["SALE_USE", "SALE_HOLD"]);
});

test("void also requires SALE_VOID", () => {
  assert.deepEqual(salesPermissionsForAction("VOID"), ["SALE_USE", "SALE_VOID"]);
});

test("ordinary sale mutations do not inherit unrelated elevated permissions", () => {
  for (const action of [
    "CREATE_DRAFT",
    "ADD_LINE",
    "UPDATE_LINE",
    "REMOVE_LINE",
    "RECORD_PAYMENT",
    "FINALIZE",
  ] as const) {
    assert.deepEqual(salesPermissionsForAction(action), ["SALE_USE"]);
  }
});

test("positive discount is detected exactly without floating point coercion", () => {
  assert.equal(saleLineUsesDiscount("0"), false);
  assert.equal(saleLineUsesDiscount("0.000"), false);
  assert.equal(saleLineUsesDiscount("0.01"), true);
  assert.equal(saleLineUsesDiscount("1000000000000000000000.0001"), true);
  assert.equal(saleLineUsesDiscount("-0.01"), false);
});
