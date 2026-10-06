import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { DOCUMENT_INSTANCE_IDENTITY_VERSION } from "./document-instance-identity";
import {
  attachDocumentIdentityAudit,
  documentIdentityEvidenceDigest,
  planDocumentIdentityTransition,
  type IdentityAuditRecord,
  type IdentityCandidate,
} from "./document-instance-envelope";
import {
  createDocumentInstanceEvidenceVerifier,
  verifyDocumentInstanceEvidence,
  type DocumentInstanceEvidenceDependencies,
} from "./document-instance-evidence";
import { reviewedCanonicalTextDigest } from "./document-instance-reviewed-evidence";
import type { IdentityServiceDocument } from "./document-instance-service";

function fixture() {
  const bytes = Buffer.from("trusted-original-artifact");
  const sourceFileHash = createHash("sha256").update(bytes).digest("hex");
  const candidate: IdentityCandidate = {
    version: DOCUMENT_INSTANCE_IDENTITY_VERSION,
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    obligation: { companyId: 8, entityId: 42 },
    reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: {
      kind: "PRINTED_INSTALLMENT_SEQUENCE",
      sequenceText: "16",
      totalText: "480",
      provenance: {
        origin: "ORIGINAL_DOCUMENT",
        receiptId: 101,
        documentId: 100,
        pageNumber: 2,
        fieldLabel: "Gjalddagi",
      },
    },
  };
  const evidence = {
    sourceFileHash,
    verbatimText: "Gjalddagi   16 af 480",
    bindingRevision: "binding-1",
  };
  const evidenceDigest = documentIdentityEvidenceDigest(candidate, evidence);
  const proposal = planDocumentIdentityTransition({
    metadata: { unrelated: { keep: true } },
    previousAudit: null,
    context: {
      companyId: 8,
      receiptId: 101,
      documentId: 100,
      obligationEntityId: 42,
      bindingRevision: "binding-1",
      sourceFileHash,
      verifiedEvidenceDigest: evidenceDigest,
    },
    expectedRevision: 0,
    expectedEvidenceDigest: null,
    actorUserId: 3,
    requestId: "proposal",
    occurredAt: "2026-10-01T12:00:00Z",
    command: { kind: "PROPOSE", candidate, evidence },
  });
  const audit: IdentityAuditRecord = { id: 1, ...proposal.audit };
  const document: IdentityServiceDocument = {
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    extractionMetadata: attachDocumentIdentityAudit(proposal, audit),
    sourceFileHash,
    binding: {
      companyId: 8,
      entityId: 42,
      revision: "binding-1",
      confirmed: true,
    },
  };
  const pages = [
    "Forsíða",
    "Innheimtubréf númer: 338379\nGjalddagi 16 af 480\nTil greiðslu 242.189 kr.",
  ];
  const deps: DocumentInstanceEvidenceDependencies = {
    async loadOriginalArtifact() {
      return { bytes, immutable: true };
    },
    async extractTextPages() {
      return pages;
    },
    async loadReviewedCanonicalText() {
      return null;
    },
  };
  return { bytes, candidate, evidence, evidenceDigest, document, pages, deps };
}

test("trusted original bytes and the authoritative page verify the proposed evidence", async () => {
  const f = fixture();
  assert.deepEqual(await verifyDocumentInstanceEvidence(f.document, f.deps), {
    sourceFileHash: f.document.sourceFileHash,
    evidenceDigest: f.evidenceDigest,
  });
});

test("the factory exposes the exact service verifier contract", async () => {
  const f = fixture();
  const verifier = createDocumentInstanceEvidenceVerifier(f.deps);
  assert.deepEqual(await verifier(f.document), {
    sourceFileHash: f.document.sourceFileHash,
    evidenceDigest: f.evidenceDigest,
  });
});

test("changed original bytes fail even when stored metadata still carries the old hash", async () => {
  const f = fixture();
  f.deps.loadOriginalArtifact = async () => ({ bytes: Buffer.from("mutated-artifact"), immutable: true });
  assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
});

test("a mutable/cache artifact cannot authenticate evidence", async () => {
  const f = fixture();
  f.deps.loadOriginalArtifact = async () => null;
  assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
});

test("wrong page provenance is rejected", async () => {
  const f = fixture();
  const metadata = structuredClone(f.document.extractionMetadata) as Record<string, any>;
  metadata.documentInstanceIdentity.candidate.instance.provenance.pageNumber = 1;
  f.document.extractionMetadata = metadata;
  assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
});

test("verbatim evidence must be present on the claimed page", async () => {
  const f = fixture();
  f.deps.extractTextPages = async () => [f.pages[0], "Innheimtubréf númer: 338379\nGjalddagi 17 af 480"];
  assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
});

test("whitespace differences from deterministic PDF extraction are harmless", async () => {
  const f = fixture();
  f.deps.extractTextPages = async () => [f.pages[0], "Innheimtubréf númer: 338379\nGjalddagi\n16   af   480"];
  assert.ok(await verifyDocumentInstanceEvidence(f.document, f.deps));
});

test("field label, sequence and total must all be grounded in the same verbatim evidence", async () => {
  for (const mutate of [
    (metadata: Record<string, any>) => { metadata.documentInstanceIdentity.candidate.instance.provenance.fieldLabel = "Afborgun"; },
    (metadata: Record<string, any>) => { metadata.documentInstanceIdentity.candidate.instance.sequenceText = "17"; },
    (metadata: Record<string, any>) => { metadata.documentInstanceIdentity.candidate.instance.totalText = "481"; },
  ]) {
    const f = fixture();
    const metadata = structuredClone(f.document.extractionMetadata) as Record<string, any>;
    mutate(metadata);
    f.document.extractionMetadata = metadata;
    assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
  }
});

test("the obligation reference must also be visible on the claimed source page", async () => {
  const f = fixture();
  f.deps.extractTextPages = async () => [f.pages[0], "Gjalddagi 16 af 480\nTil greiðslu 242.189 kr."];
  assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
});

test("stale source hash, binding revision or obligation binding fail closed", async () => {
  for (const mutate of [
    (document: IdentityServiceDocument) => { document.sourceFileHash = "b".repeat(64); },
    (document: IdentityServiceDocument) => { document.binding!.revision = "binding-2"; },
    (document: IdentityServiceDocument) => { document.binding!.entityId = 99; },
    (document: IdentityServiceDocument) => { document.binding!.confirmed = false; },
  ]) {
    const f = fixture();
    mutate(f.document);
    assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
  }
});

test("foreign scope and non-PROPOSED envelopes cannot be verified", async () => {
  {
    const f = fixture();
    f.document.companyId = 9;
    assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
  }
  {
    const f = fixture();
    const metadata = structuredClone(f.document.extractionMetadata) as Record<string, any>;
    metadata.documentInstanceIdentity.state = "CONFIRMED";
    metadata.documentInstanceIdentity.confirmedIdentity = {
      ...metadata.documentInstanceIdentity.candidate,
      confirmation: { state: "CONFIRMED", confirmedByUserId: 3 },
    };
    metadata.documentInstanceIdentity.confirmationAuditEventId = metadata.documentInstanceIdentity.lastAuditEventId;
    f.document.extractionMetadata = metadata;
    assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
  }
});

test("extractor failures propagate to the service boundary, which already converts them to fail-closed", async () => {
  const f = fixture();
  f.deps.extractTextPages = async () => { throw new Error("unreadable PDF"); };
  await assert.rejects(verifyDocumentInstanceEvidence(f.document, f.deps), /unreadable PDF/);
});

test("verification does not mutate the document, metadata, pages or original bytes", async () => {
  const f = fixture();
  const beforeDocument = structuredClone(f.document);
  const beforePages = structuredClone(f.pages);
  const beforeBytes = Buffer.from(f.bytes);
  await verifyDocumentInstanceEvidence(f.document, f.deps);
  assert.deepEqual(f.document, beforeDocument);
  assert.deepEqual(f.pages, beforePages);
  assert.deepEqual(f.bytes, beforeBytes);
});


function reviewedFixture() {
  const bytes = Buffer.from("trusted-original-artifact-reviewed");
  const sourceFileHash = createHash("sha256").update(bytes).digest("hex");
  const reviewedAt = "2026-10-05T20:00:00.000Z";
  const reviewedText =
    "Skuldabréf/innheimtubréf vegna gjalddaga 16 af 480. Krafa nr. 294755, innheimtubréf nr. 338379. Til greiðslu eru 242.189 kr.";
  const candidate: IdentityCandidate = {
    version: DOCUMENT_INSTANCE_IDENTITY_VERSION,
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    obligation: { companyId: 8, entityId: 42 },
    reference: { role: "OBLIGATION_REFERENCE", value: "338379" },
    instance: {
      kind: "PRINTED_INSTALLMENT_SEQUENCE",
      sequenceText: "16",
      totalText: "480",
      provenance: {
        origin: "REVIEWED_CANONICAL_TEXT",
        sourceField: "summary",
        receiptId: 101,
        documentId: 100,
        pageNumber: 1,
        fieldLabel: "gjalddaga",
      },
    },
  };
  const evidence = {
    sourceFileHash,
    verbatimText: "gjalddaga 16 af 480",
    bindingRevision: "binding-1",
    reviewedTextDigest: reviewedCanonicalTextDigest(reviewedText),
    reviewedAt,
  };
  const evidenceDigest = documentIdentityEvidenceDigest(candidate, evidence);
  const proposal = planDocumentIdentityTransition({
    metadata: null,
    previousAudit: null,
    context: {
      companyId: 8,
      receiptId: 101,
      documentId: 100,
      obligationEntityId: 42,
      bindingRevision: "binding-1",
      sourceFileHash,
      verifiedEvidenceDigest: evidenceDigest,
    },
    expectedRevision: 0,
    expectedEvidenceDigest: null,
    actorUserId: 3,
    requestId: "reviewed-proposal",
    occurredAt: "2026-10-05T20:01:00Z",
    command: { kind: "PROPOSE", candidate, evidence },
  });
  const audit: IdentityAuditRecord = { id: 11, ...proposal.audit };
  const document: IdentityServiceDocument = {
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    extractionMetadata: attachDocumentIdentityAudit(proposal, audit),
    sourceFileHash,
    binding: {
      companyId: 8,
      entityId: 42,
      revision: "binding-1",
      confirmed: true,
    },
  };
  const deps: DocumentInstanceEvidenceDependencies = {
    async loadOriginalArtifact() {
      return { bytes, immutable: true };
    },
    async extractTextPages() {
      return ["garbled embedded PDF text layer"];
    },
    async loadReviewedCanonicalText() {
      return { sourceField: "summary", text: reviewedText, reviewedAt };
    },
  };
  return { bytes, reviewedText, reviewedAt, document, deps, evidenceDigest };
}

test("reviewed canonical summary verifies when immutable PDF text extraction is unusable", async () => {
  const f = reviewedFixture();
  assert.deepEqual(await verifyDocumentInstanceEvidence(f.document, f.deps), {
    sourceFileHash: f.document.sourceFileHash,
    evidenceDigest: f.evidenceDigest,
  });
});

test("reviewed canonical evidence fails closed if the reviewed summary or review timestamp changes", async () => {
  {
    const f = reviewedFixture();
    f.deps.loadReviewedCanonicalText = async () => ({
      sourceField: "summary",
      text: f.reviewedText.replace("16 af 480", "17 af 480"),
      reviewedAt: f.reviewedAt,
    });
    assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
  }
  {
    const f = reviewedFixture();
    f.deps.loadReviewedCanonicalText = async () => ({
      sourceField: "summary",
      text: f.reviewedText,
      reviewedAt: "2026-10-05T20:02:00.000Z",
    });
    assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
  }
});

test("reviewed canonical fallback still requires the immutable original file hash", async () => {
  const f = reviewedFixture();
  f.deps.loadOriginalArtifact = async () => ({
    bytes: Buffer.from("changed-original"),
    immutable: true,
  });
  assert.equal(await verifyDocumentInstanceEvidence(f.document, f.deps), null);
});
