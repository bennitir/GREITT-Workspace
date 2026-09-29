import { prisma } from "../prisma";
import type {
  BankCandidateInput,
  BookingCandidateInput,
} from "./candidates";

export type BankReconciliationSourceFailureCode =
  | "BANK_ACCOUNT_NOT_FOUND"
  | "LEDGER_ACCOUNT_NOT_LINKED"
  | "LEDGER_ACCOUNT_COMPANY_MISMATCH";

export type BankReconciliationSourceResult =
  | {
      ok: false;
      code: BankReconciliationSourceFailureCode;
      bankAccountId: number;
    }
  | {
      ok: true;
      bankAccountId: number;
      companyId: number;
      ledgerAccount: {
        id: number;
        number: string;
        name: string;
      };
      transactions: BankCandidateInput[];
      bookings: BookingCandidateInput[];
    };

/**
 * Velur authoritative source-gögn fyrir bankafærslu ↔ bókunarlínu afstemmingu.
 *
 * Reglur:
 * - BankAccount verður að hafa explicit ledgerAccountId.
 * - Ledger account verður að tilheyra sama fyrirtæki.
 * - Engin ágiskun út frá account type / entryRole.
 * - Aðeins APPROVED receipts teljast authoritative hér.
 * - voucherNumber má vera null og útilokar ekki bókun.
 *
 * Canonical source-selection only. Enginn UI-texti eða tungumál hér.
 */
export async function loadBankBookingReconciliationSource(
  bankAccountId: number,
  companyId: number
): Promise<BankReconciliationSourceResult> {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      companyId,
    },
    select: {
      id: true,
      companyId: true,
      ledgerAccountId: true,
      ledgerAccount: {
        select: {
          id: true,
          companyId: true,
          number: true,
          name: true,
        },
      },
    },
  });

  if (!bankAccount) {
    return {
      ok: false,
      code: "BANK_ACCOUNT_NOT_FOUND",
      bankAccountId,
    };
  }

  if (!bankAccount.ledgerAccountId || !bankAccount.ledgerAccount) {
    return {
      ok: false,
      code: "LEDGER_ACCOUNT_NOT_LINKED",
      bankAccountId,
    };
  }

  if (bankAccount.ledgerAccount.companyId !== bankAccount.companyId) {
    return {
      ok: false,
      code: "LEDGER_ACCOUNT_COMPANY_MISMATCH",
      bankAccountId,
    };
  }

  const [transactions, entries] = await Promise.all([
    prisma.bankTransaction.findMany({
      where: {
        bankAccountId: bankAccount.id,
      },
      orderBy: [{ date: "asc" }, { id: "asc" }],
    }),

    prisma.receiptEntry.findMany({
      where: {
        account: bankAccount.ledgerAccount.number,
        receipt: {
          companyId: bankAccount.companyId,
          status: "APPROVED",
        },
      },
      include: {
        receipt: true,
      },
      orderBy: { id: "asc" },
    }),
  ]);

  return {
    ok: true,
    bankAccountId: bankAccount.id,
    companyId: bankAccount.companyId,
    ledgerAccount: {
      id: bankAccount.ledgerAccount.id,
      number: bankAccount.ledgerAccount.number,
      name: bankAccount.ledgerAccount.name,
    },
    transactions: transactions.map((tx) => ({
      id: tx.id,
      date: tx.date,
      text: tx.text,
      amount: Number(tx.amount),
    })),
    bookings: entries.map((entry) => ({
      entryId: entry.id,
      receiptId: entry.receiptId,
      voucherNumber: entry.receipt.voucherNumber,
      date: entry.receipt.aiDate ?? entry.receipt.date,
      partyText:
        entry.receipt.merchantName ??
        entry.receipt.description,
      description: entry.receipt.description,
      account: entry.account,
      entryText: entry.text,
      debit: entry.debit,
      credit: entry.credit,
    })),
  };
}
