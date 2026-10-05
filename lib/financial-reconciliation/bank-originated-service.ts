import { prisma } from "../prisma";
import {
  buildBankOriginatedFlowCandidate,
  type BankOriginatedFlowCandidate,
} from "./bank-originated-provider";

export type BankOriginatedFlowCandidateResult =
  | {
      ok: false;
      code: "BANK_ACCOUNT_NOT_FOUND";
      bankAccountId: number;
    }
  | {
      ok: true;
      bankAccountId: number;
      companyId: number;
      candidateCount: number;
      counts: {
        bankFee: number;
        interest: number;
      };
      candidates: BankOriginatedFlowCandidate[];
    };

/**
 * Read-only source adapter for bank-originated flow providers.
 *
 * This service creates no FinancialEvent, reconciliation, posting or audit
 * record. It only projects deterministic provider candidates from authoritative
 * bank transactions belonging to the requested company/account.
 */
export async function getBankOriginatedFlowCandidates(
  bankAccountId: number,
  companyId: number,
): Promise<BankOriginatedFlowCandidateResult> {
  const bankAccount = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, companyId },
    select: { id: true, companyId: true },
  });

  if (!bankAccount) {
    return {
      ok: false,
      code: "BANK_ACCOUNT_NOT_FOUND",
      bankAccountId,
    };
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: { bankAccountId: bankAccount.id },
    select: {
      id: true,
      bankAccountId: true,
      date: true,
      text: true,
      amount: true,
      reference: true,
      sourceRawData: true,
    },
    orderBy: [{ date: "desc" }, { id: "desc" }],
  });

  const candidates: BankOriginatedFlowCandidate[] = [];
  let bankFee = 0;
  let interest = 0;

  for (const transaction of transactions) {
    const candidate = buildBankOriginatedFlowCandidate({
      id: transaction.id,
      bankAccountId: transaction.bankAccountId,
      date: transaction.date,
      text: transaction.text,
      amount: transaction.amount.toString(),
      reference: transaction.reference,
      sourceRawData: transaction.sourceRawData,
    });

    if (!candidate) continue;

    candidates.push(candidate);
    if (candidate.flowKind === "BANK_FEE") bankFee += 1;
    if (candidate.flowKind === "INTEREST") interest += 1;
  }

  return {
    ok: true,
    bankAccountId: bankAccount.id,
    companyId: bankAccount.companyId,
    candidateCount: candidates.length,
    counts: { bankFee, interest },
    candidates,
  };
}
