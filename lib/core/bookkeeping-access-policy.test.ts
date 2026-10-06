import assert from "node:assert/strict";
import test from "node:test";

import {
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
