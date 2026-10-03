"use server";

import { revalidatePath } from "next/cache";

import {
  saleLineUsesDiscount,
  salesPermissionsForAction,
} from "@/lib/core/sales-action-policy";
import { calculateSaleLineAmounts } from "@/lib/core/sales-domain";
import {
  assertSalesPermission,
  requireActiveSalesPermissions,
} from "@/lib/core/sales-access";
import { createPrismaSalesService } from "@/lib/sales/prisma-repository";
import type { SaleLineSource } from "@/lib/sales/service";

type SaleLineActionInput = {
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  subtotalAmount: string;
  discountAmount: string;
  netAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  source: SaleLineSource;
  sourceReference?: string | null;
};

function revalidateSale(saleId?: number) {
  revalidatePath("/sala");
  if (saleId) revalidatePath(`/sala/${saleId}`);
}

async function requireSaleLineWriteAccess(
  action: "ADD_LINE" | "UPDATE_LINE",
  line: SaleLineActionInput,
) {
  const context = await requireActiveSalesPermissions(
    salesPermissionsForAction(action),
  );

  if (saleLineUsesDiscount(line.discountAmount)) {
    assertSalesPermission(context.access, "SALE_DISCOUNT");
  }

  return context;
}

export async function createDraftSaleAction(input: {
  branchId: number;
  terminalId?: number | null;
  currency?: string;
}) {
  const { companyId } = await requireActiveSalesPermissions(
    salesPermissionsForAction("CREATE_DRAFT"),
  );

  const sale = await createPrismaSalesService().createDraftSale({
    companyId,
    branchId: input.branchId,
    terminalId: input.terminalId,
    currency: input.currency,
  });

  revalidateSale(sale.id);
  return sale;
}

export async function addFreeSaleLineAction(input: {
  saleId: number;
  description: string;
  quantity: string;
  unit: string;
  unitPrice: string;
  discountAmount?: string;
  vatRate: string;
}) {
  const context = await requireActiveSalesPermissions(
    salesPermissionsForAction("ADD_LINE"),
  );
  const discountAmount = input.discountAmount?.trim() || "0";

  if (saleLineUsesDiscount(discountAmount)) {
    assertSalesPermission(context.access, "SALE_DISCOUNT");
  }

  const amounts = calculateSaleLineAmounts({
    quantity: input.quantity,
    unitPrice: input.unitPrice,
    discountAmount,
    vatRate: input.vatRate,
  });
  const result = await createPrismaSalesService().addSaleLine({
    companyId: context.companyId,
    saleId: input.saleId,
    line: {
      description: input.description,
      unit: input.unit,
      ...amounts,
      source: "FREE_LINE",
    },
  });

  revalidateSale(input.saleId);
  return result;
}

export async function addSaleLineAction(input: {
  saleId: number;
  line: SaleLineActionInput;
}) {
  const { companyId } = await requireSaleLineWriteAccess("ADD_LINE", input.line);
  const result = await createPrismaSalesService().addSaleLine({
    companyId,
    saleId: input.saleId,
    line: input.line,
  });

  revalidateSale(input.saleId);
  return result;
}

export async function updateSaleLineAction(input: {
  saleId: number;
  lineId: number;
  line: SaleLineActionInput;
}) {
  const { companyId } = await requireSaleLineWriteAccess("UPDATE_LINE", input.line);
  const result = await createPrismaSalesService().updateSaleLine({
    companyId,
    saleId: input.saleId,
    lineId: input.lineId,
    line: input.line,
  });

  revalidateSale(input.saleId);
  return result;
}

export async function removeSaleLineAction(input: {
  saleId: number;
  lineId: number;
}) {
  const { companyId } = await requireActiveSalesPermissions(
    salesPermissionsForAction("REMOVE_LINE"),
  );
  const sale = await createPrismaSalesService().removeSaleLine({
    companyId,
    saleId: input.saleId,
    lineId: input.lineId,
  });

  revalidateSale(input.saleId);
  return sale;
}

export async function holdSaleAction(input: { saleId: number }) {
  const { companyId } = await requireActiveSalesPermissions(
    salesPermissionsForAction("HOLD"),
  );
  const sale = await createPrismaSalesService().holdSale({
    companyId,
    saleId: input.saleId,
  });

  revalidateSale(input.saleId);
  return sale;
}

export async function resumeSaleAction(input: { saleId: number }) {
  const { companyId } = await requireActiveSalesPermissions(
    salesPermissionsForAction("RESUME"),
  );
  const sale = await createPrismaSalesService().resumeSale({
    companyId,
    saleId: input.saleId,
  });

  revalidateSale(input.saleId);
  return sale;
}

export async function voidSaleAction(input: { saleId: number }) {
  const { companyId } = await requireActiveSalesPermissions(
    salesPermissionsForAction("VOID"),
  );
  const sale = await createPrismaSalesService().voidSale({
    companyId,
    saleId: input.saleId,
  });

  revalidateSale(input.saleId);
  return sale;
}

export async function recordPaymentAction(input: {
  saleId: number;
  methodCode: string;
  amount: string;
  currency?: string;
  reference?: string | null;
  authorizationReference?: string | null;
}) {
  const { companyId } = await requireActiveSalesPermissions(
    salesPermissionsForAction("RECORD_PAYMENT"),
  );
  const payment = await createPrismaSalesService().recordPayment({
    companyId,
    saleId: input.saleId,
    methodCode: input.methodCode,
    amount: input.amount,
    currency: input.currency,
    reference: input.reference,
    authorizationReference: input.authorizationReference,
  });

  revalidateSale(input.saleId);
  return payment;
}

/**
 * Ekki exporta almennu client-kallanlegu payment status transition actioni hér.
 * AUTHORIZED/CONFIRMED/FAILED eiga síðar að koma frá traustu greiðsluflæði eða
 * afmörkuðu manual ferli, ekki frjálsu status-gildi frá browser.
 */

export async function finalizeSaleAction(input: { saleId: number }) {
  const { companyId } = await requireActiveSalesPermissions(
    salesPermissionsForAction("FINALIZE"),
  );
  const sale = await createPrismaSalesService().finalizeSale({
    companyId,
    saleId: input.saleId,
  });

  revalidateSale(input.saleId);
  return sale;
}
