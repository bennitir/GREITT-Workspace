import { randomUUID } from "node:crypto";
import type { Prisma, PrismaClient } from "../../app/generated/prisma/client";
import { loadBankDiagnosticSource, type DiagnosticReadDb, type BankDiagnosticSourceResult } from "./diagnostics-source";
import { buildBankDiagnosticSnapshotFromSource, type AccountDiagnosticSnapshot } from "./diagnostics-service";

type ReadTransaction = Pick<Prisma.TransactionClient, keyof DiagnosticReadDb>;

/** Fresh wrappers prevent write/raw methods on Prisma delegates reaching the loader. */
export function toDiagnosticReadDb(tx: ReadTransaction): DiagnosticReadDb {
  return {
    bankAccount: { findFirst: args => tx.bankAccount.findFirst(args) },
    bankTransaction: { findMany: args => tx.bankTransaction.findMany(args) },
    receiptEntry: { findMany: args => tx.receiptEntry.findMany(args) },
    financialEvent: { findMany: args => tx.financialEvent.findMany(args) },
    aiDetectedDocument: { findMany: args => tx.aiDetectedDocument.findMany(args) },
    documentFinancialEvent: { findMany: args => tx.documentFinancialEvent.findMany(args) },
    financialEventPayment: { findMany: args => tx.financialEventPayment.findMany(args) },
    financialReconciliation: { findMany: args => tx.financialReconciliation.findMany(args) },
  };
}

export type PrismaBankDiagnosticSnapshot = Omit<AccountDiagnosticSnapshot, "source"> & {
  source: Omit<AccountDiagnosticSnapshot["source"], "readConsistency"> & { readConsistency: "REPEATABLE_READ" };
};
export type PrismaBankDiagnosticResult = { ok: true; snapshot: PrismaBankDiagnosticSnapshot }
  | Extract<BankDiagnosticSourceResult, { ok: false }>
  | { ok: false; code: "DIAGNOSTIC_TRANSACTION_FAILED" };

/** Caller authorizes the company and supplies the existing shared Prisma client.
 * No connection is created here, and transaction failures never fall back to root reads. */
export async function buildPrismaBankDiagnosticSnapshot(args: {
  companyId: number; bankAccountId: number; prisma: Pick<PrismaClient, "$transaction">;
  snapshotId?: string; capturedAt?: string;
}): Promise<PrismaBankDiagnosticResult> {
  try {
    const result = await args.prisma.$transaction(async tx => {
      // Constant, parameter-free tagged SQL; must precede every application read.
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const loaded = await loadBankDiagnosticSource({
        companyId: args.companyId, bankAccountId: args.bankAccountId,
        snapshotId: args.snapshotId ?? randomUUID(), capturedAt: args.capturedAt ?? new Date().toISOString(),
        db: toDiagnosticReadDb(tx),
      });
      if (!loaded.ok) return loaded;
      return { ok: true as const, snapshot: buildBankDiagnosticSnapshotFromSource(loaded.source) };
    }, { isolationLevel: "RepeatableRead" });
    if (!result.ok) return result;
    // Publish the stronger consistency claim only after the transaction resolves successfully.
    return { ok: true, snapshot: { ...result.snapshot,
      source: { ...result.snapshot.source, readConsistency: "REPEATABLE_READ" } } };
  } catch {
    // Includes begin/isolation, READ ONLY setup, timeout and transaction completion failures.
    return { ok: false, code: "DIAGNOSTIC_TRANSACTION_FAILED" };
  }
}
