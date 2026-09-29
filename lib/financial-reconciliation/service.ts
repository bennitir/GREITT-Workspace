import {
  buildBankBookingCandidateGraph,
  type BankCandidateResolution,
} from "./candidates";
import {
  loadBankBookingReconciliationSource,
  type BankReconciliationSourceFailureCode,
} from "./source";

export type BankBookingReconciliationResult =
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
      transactionCount: number;
      bookingCount: number;
      transactions: import("./candidates").BankCandidateInput[];
      counts: {
        uniqueStrong: number;
        ambiguousStrong: number;
        possible: number;
        none: number;
      };
      resolutions: BankCandidateResolution[];
    };

/**
 * Almenn read-only bankafstemming.
 *
 * Source-loader velur authoritative gögn.
 * Candidate-kjarninn metur deterministic samsvörun.
 * Enginn persistence, enginn UI-texti og engin tungumál hér.
 */
export async function getBankBookingReconciliation(
  bankAccountId: number,
  companyId: number
): Promise<BankBookingReconciliationResult> {
  const source =
    await loadBankBookingReconciliationSource(
      bankAccountId,
      companyId
    );

  if (!source.ok) {
    return source;
  }

  const resolutions = buildBankBookingCandidateGraph(
    source.transactions,
    source.bookings
  );

  const counts = {
    uniqueStrong: 0,
    ambiguousStrong: 0,
    possible: 0,
    none: 0,
  };

  for (const resolution of resolutions) {
    switch (resolution.state) {
      case "UNIQUE_STRONG":
        counts.uniqueStrong += 1;
        break;
      case "AMBIGUOUS_STRONG":
        counts.ambiguousStrong += 1;
        break;
      case "POSSIBLE":
        counts.possible += 1;
        break;
      case "NONE":
        counts.none += 1;
        break;
    }
  }

  return {
    ok: true,
    bankAccountId: source.bankAccountId,
    companyId: source.companyId,
    ledgerAccount: source.ledgerAccount,
    transactionCount: source.transactions.length,
    bookingCount: source.bookings.length,
    transactions: source.transactions,
    counts,
    resolutions,
  };
}
