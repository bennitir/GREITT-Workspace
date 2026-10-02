import { createHash } from "node:crypto";

import {
  documentIdentityEvidenceDigest,
  parseDocumentIdentityEnvelope,
} from "./document-instance-envelope";
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

export type DocumentInstanceEvidenceDependencies = {
  loadOriginalArtifact(
    document: IdentityServiceDocument,
  ): Promise<OriginalIdentityArtifact | null>;
  extractTextPages(bytes: Buffer | Uint8Array): Promise<string[]>;
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

/**
 * Verifies a PROPOSED document-instance identity against the original artifact.
 *
 * This verifier deliberately does not trust browser supplied evidence or a
 * stored digest by itself. It re-hashes the original bytes, extracts the
 * authoritative page text, and checks the exact proposal evidence against that
 * page before returning the digest accepted by the service layer.
 *
 * It performs no DB writes and no authorization. The service owns those.
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

  const pages = await deps.extractTextPages(artifact.bytes);
  if (!Array.isArray(pages) || pages.length === 0) return null;

  const pageTextRaw = pages[provenance.pageNumber - 1];
  if (typeof pageTextRaw !== "string" || !pageTextRaw.trim()) return null;

  const pageText = normalizeSourceText(pageTextRaw);
  const pageComparable = normalizeComparableText(pageTextRaw);
  const verbatim = normalizeSourceText(evidence.verbatimText);
  const verbatimComparable = normalizeComparableText(evidence.verbatimText);
  const fieldLabel = normalizeComparableText(provenance.fieldLabel);

  if (!verbatim || !fieldLabel) return null;
  if (!pageComparable.includes(verbatimComparable)) return null;
  if (!verbatimComparable.includes(fieldLabel)) return null;
  if (!containsPrintedInteger(verbatim, candidate.instance.sequenceText)) return null;
  if (!containsPrintedInteger(verbatim, candidate.instance.totalText)) return null;

  const reference = normalizeReference(candidate.reference.value);
  const pageReferenceSpace = normalizeReference(pageText);
  if (!reference || !pageReferenceSpace.includes(reference)) return null;

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
