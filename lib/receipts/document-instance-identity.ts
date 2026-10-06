/** Optional, standalone JSON contract. No persistence or production caller yet.
 * A future authorized writer must verify and confirm the source evidence. This
 * helper validates supplied assertions; it cannot authenticate a source document.
 */
export const DOCUMENT_INSTANCE_IDENTITY_VERSION = "document-instance-identity-v1" as const;
export const INSTANCE_COMPARISON = {
  SAME_INSTANCE: "SAME_INSTANCE",
  DISTINCT_INSTANCE: "DISTINCT_INSTANCE",
  INSUFFICIENT_EVIDENCE: "INSUFFICIENT_EVIDENCE",
} as const;
export type InstanceComparison = typeof INSTANCE_COMPARISON[keyof typeof INSTANCE_COMPARISON];

export type ConfirmedDocumentInstanceIdentity = {
  version: typeof DOCUMENT_INSTANCE_IDENTITY_VERSION;
  companyId: number;
  receiptId: number;
  documentId: number;
  obligation: { companyId: number; entityId: number };
  // Explicit classification, never inferred from a number, merchant or suffix.
  reference: { role: "OBLIGATION_REFERENCE"; value: string };
  instance: {
    kind: "PRINTED_INSTALLMENT_SEQUENCE";
    // Literal printed numeric components, not a generated schedule index.
    sequenceText: string;
    totalText: string;
    provenance:
      | {
          origin: "ORIGINAL_DOCUMENT";
          receiptId: number;
          documentId: number;
          pageNumber: number;
          fieldLabel: string;
        }
      | {
          origin: "REVIEWED_CANONICAL_TEXT";
          sourceField: "summary";
          receiptId: number;
          documentId: number;
          pageNumber: number;
          fieldLabel: string;
        };
  };
  // Confirms obligation binding, reference meaning AND this source evidence.
  // reviewedAt or a confirmed liability account alone do not satisfy this. A reviewed canonical source must also be server-reloaded, source-hash bound and digest verified.
  confirmation: { state: "CONFIRMED"; confirmedByUserId: number };
};

type JsonObject = Record<string, unknown>;
const object = (value: unknown): JsonObject | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonObject : null;
const positiveId = (value: unknown): value is number =>
  typeof value === "number" && Number.isSafeInteger(value) && value > 0;
const nonempty = (value: unknown) => typeof value === "string" && value.trim().length > 0;
function printedInteger(value: unknown): number | null {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) return null;
  const number = Number(value);
  return positiveId(number) ? number : null;
}

function validated(value: unknown) {
  const root = object(value);
  if (!root || root.version !== DOCUMENT_INSTANCE_IDENTITY_VERSION ||
    !positiveId(root.companyId) || !positiveId(root.receiptId) || !positiveId(root.documentId)) return null;
  const obligation = object(root.obligation), reference = object(root.reference);
  const instance = object(root.instance), confirmation = object(root.confirmation);
  if (!obligation || obligation.companyId !== root.companyId || !positiveId(obligation.entityId) ||
    !reference || reference.role !== "OBLIGATION_REFERENCE" || !nonempty(reference.value) ||
    !instance || instance.kind !== "PRINTED_INSTALLMENT_SEQUENCE" ||
    !confirmation || confirmation.state !== "CONFIRMED" || !positiveId(confirmation.confirmedByUserId)) return null;
  const provenance = object(instance.provenance);
  if (!provenance ||
    (provenance.origin !== "ORIGINAL_DOCUMENT" && provenance.origin !== "REVIEWED_CANONICAL_TEXT") ||
    provenance.receiptId !== root.receiptId || provenance.documentId !== root.documentId ||
    !positiveId(provenance.pageNumber) || !nonempty(provenance.fieldLabel)) return null;
  if (provenance.origin === "REVIEWED_CANONICAL_TEXT" && provenance.sourceField !== "summary") return null;
  if (provenance.origin === "ORIGINAL_DOCUMENT" && "sourceField" in provenance) return null;
  const sequence = printedInteger(instance.sequenceText), installmentTotal = printedInteger(instance.totalText);
  if (sequence === null || installmentTotal === null || sequence > installmentTotal) return null;
  return { companyId: root.companyId, obligationId: obligation.entityId, sequence, installmentTotal };
}

/** Compare only confirmed obligation instances. INSUFFICIENT_EVIDENCE never
 * authorizes a duplicate override; ordinary invoice guards must remain intact.
 * A changed installment total may indicate a revised schedule: v1 cannot disambiguate it.
 * Dates, amounts, DB document IDs and reference strings are not instance keys.
 */
export function compareDocumentInstanceIdentity(left: unknown, right: unknown): InstanceComparison {
  const a = validated(left), b = validated(right);
  if (!a || !b || a.companyId !== b.companyId || a.obligationId !== b.obligationId || a.installmentTotal !== b.installmentTotal) {
    return INSTANCE_COMPARISON.INSUFFICIENT_EVIDENCE;
  }
  return a.sequence === b.sequence ? INSTANCE_COMPARISON.SAME_INSTANCE : INSTANCE_COMPARISON.DISTINCT_INSTANCE;
}
