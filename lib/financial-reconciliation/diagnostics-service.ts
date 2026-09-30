import { buildBankDiagnostics } from "./diagnostics";
import { REASONS, type DiagnosticSnapshot, type Reason } from "./diagnostics-contract";
import type { BankDiagnosticSource } from "./diagnostics-source";

export type AccountDiagnosticSnapshot = DiagnosticSnapshot & {
  source: Pick<BankDiagnosticSource, "readConsistency" | "issues" | "confirmationRecords" | "allocations" | "eventStatuses">;
};

/** Pure orchestration. Overall states and all totals belong exclusively to v3. */
export function buildBankDiagnosticSnapshotFromSource(source: BankDiagnosticSource): AccountDiagnosticSnapshot {
  const snapshot = buildBankDiagnostics(source.input);
  const reasons: Reason[] = [...snapshot.integrity.reasons];
  for (const { code } of source.issues) if (!reasons.some(r => r.code === code)) {
    reasons.push({ code, ...REASONS[code], source: null, target: null });
  }
  return { ...snapshot,
    completeness: source.issues.length ? "PARTIAL" : snapshot.completeness,
    integrity: reasons.length ? { state: "ERROR", reasons } : snapshot.integrity,
    source: { readConsistency: source.readConsistency, issues: source.issues,
      confirmationRecords: source.confirmationRecords, allocations: source.allocations, eventStatuses: source.eventStatuses },
  };
}
