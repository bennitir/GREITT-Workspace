import assert from "node:assert/strict";
import test from "node:test";

import {
  SALES_PERMISSION_FIELDS,
  SALES_PERMISSIONS,
  hasSalesPermission,
  type SalesPermissionAccess,
} from "./sales-permissions";

function deniedAccess(): SalesPermissionAccess {
  return {
    canSaleUse: false,
    canSaleHold: false,
    canSaleDiscount: false,
    canSaleChangePrice: false,
    canSaleInvoice: false,
    canSaleRefund: false,
    canSaleVoid: false,
    canSaleSettlementView: false,
    canSaleSettlementCreate: false,
    canSaleSettlementFinalize: false,
    canSaleCustomerManage: false,
    canSaleSettingsManage: false,
  };
}

test("every sales permission maps to one unique access field", () => {
  assert.equal(SALES_PERMISSIONS.length, 12);

  const fields = SALES_PERMISSIONS.map(
    (permission) => SALES_PERMISSION_FIELDS[permission],
  );

  assert.equal(new Set(fields).size, SALES_PERMISSIONS.length);
});

test("sales permissions are fail-closed", () => {
  const access = deniedAccess();

  for (const permission of SALES_PERMISSIONS) {
    assert.equal(hasSalesPermission(access, permission), false);
  }
});

test("each sales permission reads only its mapped field", () => {
  for (const permission of SALES_PERMISSIONS) {
    const access = deniedAccess();
    const field = SALES_PERMISSION_FIELDS[permission];

    access[field] = true;

    assert.equal(hasSalesPermission(access, permission), true);

    for (const otherPermission of SALES_PERMISSIONS) {
      if (otherPermission === permission) continue;
      assert.equal(hasSalesPermission(access, otherPermission), false);
    }
  }
});
