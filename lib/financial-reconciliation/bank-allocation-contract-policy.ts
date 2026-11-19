/** Fail-closed, deterministic shared bank-allocation contract. */
export type BankAllocationContractEvidence = {
  tablePresent: boolean;
  rlsEnabled: boolean;
  uniqueBankTransaction: boolean;
  verifierPresent: boolean;
};

export type BankAllocationContractFailure =
  | 'CLAIM_TABLE_MISSING'
  | 'CLAIM_RLS_MISSING'
  | 'CLAIM_UNIQUENESS_MISSING'
  | 'CLAIM_VERIFIER_MISSING'
  | 'CLAIM_VERIFIER_REJECTED';

/** Pure policy: no runtime flags or browser input can waive any evidence. */
export function bankAllocationContractFailure(
  evidence: BankAllocationContractEvidence,
  verifierAccepted: boolean | null,
): BankAllocationContractFailure | null {
  if (!evidence.tablePresent) return 'CLAIM_TABLE_MISSING';
  if (!evidence.rlsEnabled) return 'CLAIM_RLS_MISSING';
  if (!evidence.uniqueBankTransaction) return 'CLAIM_UNIQUENESS_MISSING';
  if (!evidence.verifierPresent) return 'CLAIM_VERIFIER_MISSING';
  return verifierAccepted === true ? null : 'CLAIM_VERIFIER_REJECTED';
}
