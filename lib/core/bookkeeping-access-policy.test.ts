import assert from "node:assert/strict";
import test from "node:test";

import {
  assertBookkeepingPostingAccess,
  effectiveBookkeepingCapabilities,
  READ_ONLY_BOOKKEEPING_CAPABILITIES,
} from "./bookkeeping-access-policy";

test("VIEWER is fail-closed for every bookkeeping mutation capability", () => {
  const effective = effectiveBookkeepingCapabilities({
    accessRole: "VIEWER",
    canPrepareBookkeeping: true,
    canReviewBookkeeping: true,
    canReconcileBookkeeping: true,
    canApproveExpenses: true,
    canBookEntries: true,
    canManageCompanySettings: true,
  });

  assert.deepEqual(effective, READ_ONLY_BOOKKEEPING_CAPABILITIES);
});

test("non-viewer roles preserve explicit granular bookkeeping capabilities", () => {
  const effective = effectiveBookkeepingCapabilities({
    accessRole: "BOOKKEEPER",
    canPrepareBookkeeping: true,
    canReviewBookkeeping: true,
    canReconcileBookkeeping: false,
    canApproveExpenses: false,
    canBookEntries: true,
    canManageCompanySettings: false,
  });

  assert.deepEqual(effective, {
    canPrepareBookkeeping: true,
    canReviewBookkeeping: true,
    canReconcileBookkeeping: false,
    canApproveExpenses: false,
    canBookEntries: true,
    canManageCompanySettings: false,
  });
});

test("booking is allowed only when the explicit capability is enabled", () => {
  const access = {
    accessRole: "BOOKKEEPER",
    canPrepareBookkeeping: true,
    canReviewBookkeeping: true,
    canReconcileBookkeeping: false,
    canApproveExpenses: false,
    canManageCompanySettings: false,
  };
  assert.equal(
    effectiveBookkeepingCapabilities({ ...access, canBookEntries: true }).canBookEntries,
    true,
  );
  assert.equal(
    effectiveBookkeepingCapabilities({ ...access, canBookEntries: false }).canBookEntries,
    false,
  );
});

test("posting access allows authorized members and rejects missing membership or capability", () => {
  assert.doesNotThrow(() =>
    assertBookkeepingPostingAccess({ allowed: true, canBookEntries: true }),
  );
  assert.throws(
    () => assertBookkeepingPostingAccess({ allowed: false, canBookEntries: true }),
    /aðgang/,
  );
  assert.throws(
    () => assertBookkeepingPostingAccess({ allowed: true, canBookEntries: false }),
    /heimild/,
  );
});
