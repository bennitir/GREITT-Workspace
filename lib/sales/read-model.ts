import "server-only";

import { prisma } from "@/lib/prisma";

function decimalText(value: { toString(): string }): string {
  return value.toString();
}

export async function getSalesHomeReadModel(companyId: number) {
  const [branches, openSales] = await Promise.all([
    prisma.salesBranch.findMany({
      where: { companyId, isActive: true, operationalLocation: { isActive: true } },
      orderBy: [{ operationalLocation: { name: "asc" } }, { id: "asc" }],
      select: {
        id: true,
        operationalLocation: {
          select: { code: true, name: true, address: true, city: true },
        },
        terminals: {
          where: { isActive: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
          select: { id: true, code: true, name: true, terminalType: true },
        },
      },
    }),
    prisma.sale.findMany({
      where: { companyId, status: { in: ["DRAFT", "HELD"] } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 30,
      select: {
        id: true,
        status: true,
        currency: true,
        totalAmount: true,
        branch: { select: { operationalLocation: { select: { name: true } } } },
        terminal: { select: { name: true } },
      },
    }),
  ]);

  return {
    branches: branches.map((branch) => ({
      id: branch.id,
      code: branch.operationalLocation.code,
      name: branch.operationalLocation.name,
      address: branch.operationalLocation.address,
      city: branch.operationalLocation.city,
      terminals: branch.terminals,
    })),
    openSales: openSales.map((sale) => ({
      id: sale.id,
      status: sale.status,
      currency: sale.currency,
      totalAmount: decimalText(sale.totalAmount),
      branchName: sale.branch.operationalLocation.name,
      terminalName: sale.terminal?.name ?? null,
    })),
  };
}

export async function getSaleDetailReadModel(companyId: number, saleId: number) {
  const sale = await prisma.sale.findFirst({
    where: { id: saleId, companyId },
    select: {
      id: true,
      companyId: true,
      status: true,
      currency: true,
      subtotalAmount: true,
      discountAmount: true,
      netAmount: true,
      vatAmount: true,
      totalAmount: true,
      heldAt: true,
      finalizedAt: true,
      branch: {
        select: {
          id: true,
          operationalLocation: { select: { code: true, name: true } },
        },
      },
      terminal: { select: { id: true, code: true, name: true } },
      lines: {
        orderBy: [{ position: "asc" }, { id: "asc" }],
        select: {
          id: true,
          position: true,
          description: true,
          quantity: true,
          unit: true,
          unitPrice: true,
          subtotalAmount: true,
          discountAmount: true,
          netAmount: true,
          vatRate: true,
          vatAmount: true,
          totalAmount: true,
          source: true,
          sourceReference: true,
        },
      },
    },
  });

  if (!sale) return null;

  return {
    id: sale.id,
    companyId: sale.companyId,
    status: sale.status,
    currency: sale.currency,
    subtotalAmount: decimalText(sale.subtotalAmount),
    discountAmount: decimalText(sale.discountAmount),
    netAmount: decimalText(sale.netAmount),
    vatAmount: decimalText(sale.vatAmount),
    totalAmount: decimalText(sale.totalAmount),
    heldAt: sale.heldAt?.toISOString() ?? null,
    finalizedAt: sale.finalizedAt?.toISOString() ?? null,
    branch: {
      id: sale.branch.id,
      code: sale.branch.operationalLocation.code,
      name: sale.branch.operationalLocation.name,
    },
    terminal: sale.terminal,
    lines: sale.lines.map((line) => ({
      ...line,
      quantity: decimalText(line.quantity),
      unitPrice: decimalText(line.unitPrice),
      subtotalAmount: decimalText(line.subtotalAmount),
      discountAmount: decimalText(line.discountAmount),
      netAmount: decimalText(line.netAmount),
      vatRate: decimalText(line.vatRate),
      vatAmount: decimalText(line.vatAmount),
      totalAmount: decimalText(line.totalAmount),
    })),
  };
}
