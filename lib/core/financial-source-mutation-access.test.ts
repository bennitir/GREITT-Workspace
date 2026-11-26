import assert from "node:assert/strict";
import test from "node:test";
import { requireFinancialSourcePrepareAccess } from "./financial-source-mutation-access";

for (const role of ["OWNER", "MANAGER", "BOOKKEEPER", "ADMIN"]) {
  test(`active ${role} with explicit prepare permission may prepare sources`, () => {
    assert.doesNotThrow(() => requireFinancialSourcePrepareAccess({
      allowed: true, role, canPrepareBookkeeping: true,
    }));
  });
}

test("no membership is denied even if capability is true", () => {
  assert.throws(() => requireFinancialSourcePrepareAccess({
    allowed: false, role: "BOOKKEEPER", canPrepareBookkeeping: true,
  }), /heimild/);
});

test("VIEWER is denied despite stale true prepare permission", () => {
  assert.throws(() => requireFinancialSourcePrepareAccess({
    allowed: true, role: "VIEWER", canPrepareBookkeeping: true,
  }), /heimild/);
});

test("active membership without prepare permission is denied", () => {
  assert.throws(() => requireFinancialSourcePrepareAccess({
    allowed: true, role: "MANAGER", canPrepareBookkeeping: false,
  }), /heimild/);
});

test("unknown/null role fails without a prepare permission", () => {
  assert.throws(() => requireFinancialSourcePrepareAccess({
    allowed: true, role: null, canPrepareBookkeeping: false,
  }), /heimild/);
});
