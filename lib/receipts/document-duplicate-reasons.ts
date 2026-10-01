import { compareDocumentInstanceIdentity, INSTANCE_COMPARISON as C,
  type ConfirmedDocumentInstanceIdentity } from "./document-instance-identity";

export const DOCUMENT_DUPLICATE_REASON_VERSION = "document-duplicate-reasons-v1" as const;
export const DUPLICATE_REASON = {
  RECEIPT_NUMBER_MATCH: "RECEIPT_NUMBER_MATCH",
  OBLIGATION_REFERENCE_MATCH: "OBLIGATION_REFERENCE_MATCH",
  SAME_DOCUMENT_INSTANCE: "SAME_DOCUMENT_INSTANCE",
  FINGERPRINT_MATCH: "FINGERPRINT_MATCH",
  MERCHANT_DATE_AMOUNT_MATCH: "MERCHANT_DATE_AMOUNT_MATCH",
  MERCHANT_DATE_MATCH: "MERCHANT_DATE_MATCH",
  MERCHANT_AMOUNT_MATCH: "MERCHANT_AMOUNT_MATCH",
  MANUAL_DUPLICATE_MARK: "MANUAL_DUPLICATE_MARK",
} as const;
export type DuplicateReason = typeof DUPLICATE_REASON[keyof typeof DUPLICATE_REASON];
export type ObservedDuplicateReason = Exclude<DuplicateReason,
  "OBLIGATION_REFERENCE_MATCH" | "SAME_DOCUMENT_INSTANCE">;
const reasonOrder = Object.values(DUPLICATE_REASON);

export type DuplicateDocumentFacts = {
  companyId: number; receiptId: number; documentId: number; receiptNumber: string | null;
  /** Future server-side envelope reader must establish freshness, evidence and
   * audit validity under the shared lock. This pure helper does not verify DB state.
   * Discovery may retain stale values, but they cannot affect comparison/classification.
   */
  identity: { state: "CURRENT_CONFIRMED" | "PROPOSED" | "INVALIDATED" | "STALE"; value: unknown } | null;
};
export type DuplicateCandidateFacts = {
  document: DuplicateDocumentFacts;
  // Existing ingestion/booking rules supply their evidence unchanged. No matching
  // or normalization rule is introduced here. Unknown reasons must not be dropped.
  observedReasons: readonly ObservedDuplicateReason[];
};

function currentIdentity(document: DuplicateDocumentFacts): ConfirmedDocumentInstanceIdentity | null {
  const supplied = document.identity;
  if (!supplied || supplied.state !== "CURRENT_CONFIRMED" ||
    compareDocumentInstanceIdentity(supplied.value, supplied.value) !== C.SAME_INSTANCE) return null;
  const identity = supplied.value as ConfirmedDocumentInstanceIdentity;
  return identity.companyId === document.companyId && identity.receiptId === document.receiptId &&
    identity.documentId === document.documentId ? identity : null;
}

/** In v1 confirmation attests both number meaning (reference.role) and instance.
 * Require that attestation on BOTH documents, bound to the actual matched fields.
 * Without it, RECEIPT_NUMBER_MATCH conservatively retains its legacy semantics.
 */
export function evaluateDocumentDuplicatePair(current: DuplicateDocumentFacts, candidate: DuplicateCandidateFacts) {
  const a = currentIdentity(current), b = currentIdentity(candidate.document);
  const comparison = compareDocumentInstanceIdentity(a, b);
  const reasons = new Set<DuplicateReason>();
  for (const reason of candidate.observedReasons) {
    if (!reasonOrder.includes(reason) || reason === (DUPLICATE_REASON.OBLIGATION_REFERENCE_MATCH as string) ||
      reason === (DUPLICATE_REASON.SAME_DOCUMENT_INSTANCE as string)) throw new Error("INVALID_OBSERVED_DUPLICATE_REASON");
    if (reason === DUPLICATE_REASON.RECEIPT_NUMBER_MATCH && a && b && a.companyId === b.companyId &&
      a.reference.value === current.receiptNumber && b.reference.value === candidate.document.receiptNumber) {
      reasons.add(DUPLICATE_REASON.OBLIGATION_REFERENCE_MATCH);
    } else reasons.add(reason);
  }
  if (comparison === C.SAME_INSTANCE) reasons.add(DUPLICATE_REASON.SAME_DOCUMENT_INSTANCE);
  const classifiedReasons = reasonOrder.filter(reason => reasons.has(reason));
  const dismissedReasons = classifiedReasons.filter(reason =>
    reason === DUPLICATE_REASON.OBLIGATION_REFERENCE_MATCH && comparison === C.DISTINCT_INSTANCE);
  const blockingReasons = classifiedReasons.filter(reason => !dismissedReasons.includes(reason));
  return { candidateDocumentId: candidate.document.documentId, comparison, classifiedReasons,
    dismissedReasons, blockingReasons, blocked: blockingReasons.length > 0 };
}

/** Complete, mode-scoped candidate list required. No first-match early return.
 * Duplicate IDs indicate a discovery-union bug; reject rather than lose evidence.
 */
export function evaluateDocumentDuplicateCandidates(current: DuplicateDocumentFacts, candidates: readonly DuplicateCandidateFacts[]) {
  const ids = new Set(candidates.map(candidate => candidate.document.documentId));
  if (ids.size !== candidates.length) throw new Error("DUPLICATE_CANDIDATE_ID");
  const pairs = candidates.map(candidate => evaluateDocumentDuplicatePair(current, candidate))
    .sort((a, b) => a.candidateDocumentId - b.candidateDocumentId);
  return { version: DOCUMENT_DUPLICATE_REASON_VERSION, blocked: pairs.some(pair => pair.blocked), pairs };
}
