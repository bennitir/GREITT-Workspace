import { prisma } from "../prisma";
import { buildBankFinancialEventCandidates } from "./event-candidates";

/** Internal read-only service. The caller must authorize access to companyId. */
export async function getBankFinancialEventCandidates(bankAccountId: number, companyId: number) {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, companyId },
    select: { id: true, companyId: true },
  });
  if (!bankAccount) {
    return { ok: false as const, code: "BANK_ACCOUNT_NOT_FOUND" as const, bankAccountId };
  }
  const [transactions, events] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: { bankAccountId: bankAccount.id },
      select: { id: true, bankAccountId: true, amount: true, date: true, reference: true },
      orderBy: { id: "asc" },
    }),
    prisma.financialEvent.findMany({
      where: {
        companyId: bankAccount.companyId,
        eventType: { in: ["CHARGE", "CREDIT"] },
        amount: { not: null },
        eventDate: { not: null },
        currency: "ISK",
      },
      select: {
        id: true, companyId: true, eventType: true, amount: true,
        eventDate: true, externalReference: true, currency: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);
  // No status filtering: OPEN does not establish an unpaid balance.
  return {
    ok: true as const,
    kind: "BANK_TO_FINANCIAL_EVENT" as const,
    bankAccountId: bankAccount.id,
    companyId: bankAccount.companyId,
    candidates: buildBankFinancialEventCandidates(
      bankAccount,
      transactions.map((bank) => ({ ...bank, amount: bank.amount.toString() })),
      events.map((event) => ({ ...event, amount: event.amount?.toString() ?? null })),
    ),
  };
}
