import { createHash } from "node:crypto";

import {
  documentIdentityEvidenceDigest,
  parseDocumentIdentityEnvelope,
} from "./document-instance-envelope";
import {
  normalizeReviewedCanonicalText,
  reviewedCanonicalTextDigest,
  reviewedTextConfirmsObligationReference,
} from "./document-instance-reviewed-evidence";
import type {
  IdentityServiceDependencies,
  IdentityServiceDocument,
} from "./document-instance-service";

export type OriginalIdentityArtifact = {
  bytes: Buffer | Uint8Array;
  /**
   * The loader may only assert this when the returned bytes come from an
   * immutable/content-versioned original artifact. A mutable cache/export is
   * not sufficient evidence for identity confirmation.
   */
  immutable: true;
};

export type ReviewedCanonicalIdentityText = {
  sourceField: "summary";
  text: string;
  reviewedAt: string;
};

export type DocumentInstanceEvidenceDependencies = {
  loadOriginalArtifact(
    document: IdentityServiceDocument,
  ): Promise<OriginalIdentityArtifact | null>;
  extractTextPages(bytes: Buffer | Uint8Array): Promise<string[]>;
  loadReviewedCanonicalText(
    document: IdentityServiceDocument,
  ): Promise<ReviewedCanonicalIdentityText | null>;
};

const DIGEST = /^[a-f0-9]{64}$/;

function normalizeSourceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeComparableText(value: string) {
  return normalizeSourceText(value).toLocaleLowerCase("is-IS");
}

function normalizeReference(value: string) {
  return value
    .normalize("NFKC")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function containsPrintedInteger(text: string, value: string) {
  if (!/^[1-9]\d*$/.test(value)) return false;
  const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|\\D)${escaped}(?:\\D|$)`).test(text);
}

function sha256(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function sourceTextGroundsCandidate(input: {
  sourceText: string;
  verbatimText: string;
  fieldLabel: string;
  sequenceText: string;
  totalText: string;
  referenceValue: string;
}) {
  const sourceText = normalizeSourceText(input.sourceText);
  const sourceComparable = normalizeComparableText(input.sourceText);
  const verbatim = normalizeSourceText(input.verbatimText);
  const verbatimComparable = normalizeComparableText(input.verbatimText);
  const fieldLabel = normalizeComparableText(input.fieldLabel);

  if (!verbatim || !fieldLabel) return false;
  if (!sourceComparable.includes(verbatimComparable)) return false;
  if (!verbatimComparable.includes(fieldLabel)) return false;
  if (!containsPrintedInteger(verbatim, input.sequenceText)) return false;
  if (!containsPrintedInteger(verbatim, input.totalText)) return false;

  const reference = normalizeReference(input.referenceValue);
  const sourceReferenceSpace = normalizeReference(sourceText);
  return Boolean(reference) && sourceReferenceSpace.includes(reference);
}

/**
 * Verifies a PROPOSED document-instance identity against trusted source evidence.
 *
 * ORIGINAL_DOCUMENT keeps the existing immutable-PDF verification path.
 * REVIEWED_CANONICAL_TEXT is a fallback for PDFs whose embedded text layer is
 * unreadable but whose already-reviewed canonical summary contains the exact
 * obligation reference and printed installment sequence. That path still
 * authenticates the original bytes by Receipt.fileHash and additionally binds
 * the proposal to the exact server-reloaded reviewed summary digest + reviewedAt.
 *
 * Neither path trusts browser supplied evidence or a stored digest by itself.
 */
export async function verifyDocumentInstanceEvidence(
  document: IdentityServiceDocument,
  deps: DocumentInstanceEvidenceDependencies,
): Promise<{ sourceFileHash: string; evidenceDigest: string } | null> {
  const parsed = parseDocumentIdentityEnvelope(document.extractionMetadata);
  if (!parsed.ok || parsed.envelope.state !== "PROPOSED") return null;

  const { candidate, evidence, evidenceDigest } = parsed.envelope;
  const provenance = candidate.instance.provenance;
  const binding = document.binding;

  if (
    candidate.companyId !== document.companyId ||
    candidate.receiptId !== document.receiptId ||
    candidate.documentId !== document.documentId ||
    candidate.obligation.companyId !== document.companyId ||
    provenance.receiptId !== document.receiptId ||
    provenance.documentId !== document.documentId ||
    !Number.isSafeInteger(provenance.pageNumber) ||
    provenance.pageNumber < 1 ||
    !binding ||
    !binding.confirmed ||
    binding.companyId !== document.companyId ||
    candidate.obligation.entityId !== binding.entityId ||
    evidence.bindingRevision !== binding.revision ||
    !document.sourceFileHash ||
    !DIGEST.test(document.sourceFileHash) ||
    evidence.sourceFileHash !== document.sourceFileHash
  ) {
    return null;
  }

  const artifact = await deps.loadOriginalArtifact(structuredClone(document));
  if (!artifact?.immutable) return null;

  const actualSourceFileHash = sha256(artifact.bytes);
  if (actualSourceFileHash !== document.sourceFileHash) return null;

  if (provenance.origin === "ORIGINAL_DOCUMENT") {
    const pages = await deps.extractTextPages(artifact.bytes);
    if (!Array.isArray(pages) || pages.length === 0) return null;

    const pageTextRaw = pages[provenance.pageNumber - 1];
    if (typeof pageTextRaw !== "string" || !pageTextRaw.trim()) return null;

    if (
      !sourceTextGroundsCandidate({
        sourceText: pageTextRaw,
        verbatimText: evidence.verbatimText,
        fieldLabel: provenance.fieldLabel,
        sequenceText: candidate.instance.sequenceText,
        totalText: candidate.instance.totalText,
        referenceValue: candidate.reference.value,
      })
    ) {
      return null;
    }
  } else if (provenance.origin === "REVIEWED_CANONICAL_TEXT") {
    if (
      provenance.sourceField !== "summary" ||
      !evidence.reviewedTextDigest ||
      !DIGEST.test(evidence.reviewedTextDigest) ||
      !evidence.reviewedAt ||
      !Number.isFinite(Date.parse(evidence.reviewedAt))
    ) {
      return null;
    }

    const reviewed = await deps.loadReviewedCanonicalText(
      structuredClone(document),
    );
    if (
      !reviewed ||
      reviewed.sourceField !== "summary" ||
      reviewed.reviewedAt !== evidence.reviewedAt ||
      !reviewed.text.trim() ||
      reviewedCanonicalTextDigest(reviewed.text) !== evidence.reviewedTextDigest
    ) {
      return null;
    }

    if (
      !reviewedTextConfirmsObligationReference(
        reviewed.text,
        candidate.reference.value,
      ) ||
      !sourceTextGroundsCandidate({
        sourceText: normalizeReviewedCanonicalText(reviewed.text),
        verbatimText: evidence.verbatimText,
        fieldLabel: provenance.fieldLabel,
        sequenceText: candidate.instance.sequenceText,
        totalText: candidate.instance.totalText,
        referenceValue: candidate.reference.value,
      })
    ) {
      return null;
    }
  } else {
    return null;
  }

  const recomputedDigest = documentIdentityEvidenceDigest(candidate, evidence);
  if (recomputedDigest !== evidenceDigest) return null;

  return {
    sourceFileHash: actualSourceFileHash,
    evidenceDigest: recomputedDigest,
  };
}

export function createDocumentInstanceEvidenceVerifier(
  deps: DocumentInstanceEvidenceDependencies,
): IdentityServiceDependencies["verifyEvidence"] {
  return (document) => verifyDocumentInstanceEvidence(document, deps);
}
