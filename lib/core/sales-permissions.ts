export const SALES_PERMISSIONS = [
  "SALE_USE",
  "SALE_HOLD",
  "SALE_DISCOUNT",
  "SALE_CHANGE_PRICE",
  "SALE_INVOICE",
  "SALE_REFUND",
  "SALE_VOID",
  "SALE_SETTLEMENT_VIEW",
  "SALE_SETTLEMENT_CREATE",
  "SALE_SETTLEMENT_FINALIZE",
  "SALE_CUSTOMER_MANAGE",
  "SALE_SETTINGS_MANAGE",
] as const;

export type SalesPermission = (typeof SALES_PERMISSIONS)[number];

export type SalesPermissionAccess = {
  canSaleUse: boolean;
  canSaleHold: boolean;
  canSaleDiscount: boolean;
  canSaleChangePrice: boolean;
  canSaleInvoice: boolean;
  canSaleRefund: boolean;
  canSaleVoid: boolean;
  canSaleSettlementView: boolean;
  canSaleSettlementCreate: boolean;
  canSaleSettlementFinalize: boolean;
  canSaleCustomerManage: boolean;
  canSaleSettingsManage: boolean;
};

export const SALES_PERMISSION_FIELDS = {
  SALE_USE: "canSaleUse",
  SALE_HOLD: "canSaleHold",
  SALE_DISCOUNT: "canSaleDiscount",
  SALE_CHANGE_PRICE: "canSaleChangePrice",
  SALE_INVOICE: "canSaleInvoice",
  SALE_REFUND: "canSaleRefund",
  SALE_VOID: "canSaleVoid",
  SALE_SETTLEMENT_VIEW: "canSaleSettlementView",
  SALE_SETTLEMENT_CREATE: "canSaleSettlementCreate",
  SALE_SETTLEMENT_FINALIZE: "canSaleSettlementFinalize",
  SALE_CUSTOMER_MANAGE: "canSaleCustomerManage",
  SALE_SETTINGS_MANAGE: "canSaleSettingsManage",
} as const satisfies Record<SalesPermission, keyof SalesPermissionAccess>;

export function hasSalesPermission(
  access: SalesPermissionAccess,
  permission: SalesPermission,
): boolean {
  return access[SALES_PERMISSION_FIELDS[permission]];
}
