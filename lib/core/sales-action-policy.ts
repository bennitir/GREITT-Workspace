import {
  decimalCompare,
  type ExactDecimalInput,
} from "@/lib/core/sales-domain";
import type { SalesPermission } from "@/lib/core/sales-permissions";

export const SALES_ACTIONS = [
  "CREATE_DRAFT",
  "ADD_LINE",
  "UPDATE_LINE",
  "REMOVE_LINE",
  "HOLD",
  "RESUME",
  "RECORD_PAYMENT",
  "FINALIZE",
] as const;

export type SalesAction = (typeof SALES_ACTIONS)[number];

const SALES_ACTION_PERMISSIONS = {
  CREATE_DRAFT: ["SALE_USE"],
  ADD_LINE: ["SALE_USE"],
  UPDATE_LINE: ["SALE_USE"],
  REMOVE_LINE: ["SALE_USE"],
  HOLD: ["SALE_USE", "SALE_HOLD"],
  RESUME: ["SALE_USE", "SALE_HOLD"],
  RECORD_PAYMENT: ["SALE_USE"],
  FINALIZE: ["SALE_USE"],
} as const satisfies Record<SalesAction, readonly SalesPermission[]>;

export function salesPermissionsForAction(
  action: SalesAction,
): readonly SalesPermission[] {
  return SALES_ACTION_PERMISSIONS[action];
}

export function saleLineUsesDiscount(
  discountAmount: ExactDecimalInput,
): boolean {
  return decimalCompare(discountAmount, "0") > 0;
}

/**
 * SALE_CHANGE_PRICE er ekki metið út frá client-sendu flaggi.
 * Þegar canonical verð-/vörulag kemur inn á serverinn á override-heimildin að
 * ráðast af samanburði við það verð, ekki fullyrðingu frá browser/client.
 */
