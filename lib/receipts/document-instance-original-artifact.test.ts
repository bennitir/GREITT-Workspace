import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  DOCUMENT_INSTANCE_ORIGINAL_BUCKET,
  createDocumentInstanceOriginalArtifactLoader,
  createPrismaSupabaseOriginalArtifactDependencies,
  type DocumentInstanceOriginalArtifactDependencies,
  type DocumentInstanceOriginalRecord,
} from "./document-instance-original-artifact";
import type { IdentityServiceDocument } from "./document-instance-service";

function sha256(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixture() {
  const original = Buffer.from("authoritative-original-pdf-bytes");
  const fileHash = sha256(original);
  const document: IdentityServiceDocument = {
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    extractionMetadata: {},
    sourceFileHash: fileHash,
    binding: null,
  };
  const record: DocumentInstanceOriginalRecord = {
    companyId: 8,
    receiptId: 101,
    documentId: 100,
    fileHash,
    storagePath: "8/1720000000000-festa.pdf",
  };
  const reads: unknown[] = [];
  const downloads: unknown[] = [];
  let nextRecord: DocumentInstanceOriginalRecord | null = structuredClone(record);
  let nextBytes: Buffer | Uint8Array | null = Buffer.from(original);
  const deps: DocumentInstanceOriginalArtifactDependencies = {
    async readOriginalRecord(input) {
      reads.push(structuredClone(input));
      return nextRecord ? structuredClone(nextRecord) : null;
    },
    async downloadOriginal(input) {
      downloads.push(structuredClone(input));
      return nextBytes;
    },
  };
  const loader = createDocumentInstanceOriginalArtifactLoader(deps);
  return {
    original,
    fileHash,
    document,
    record,
    reads,
    downloads,
    deps,
    loader,
    setRecord(value: DocumentInstanceOriginalRecord | null) { nextRecord = value; },
    setBytes(value: Buffer | Uint8Array | null) { nextBytes = value; },
  };
}

test("loads only the exact tenant-scoped durable original and authenticates its bytes", async () => {
  const f = fixture();
  const artifact = await f.loader(f.document);
  assert.ok(artifact);
  assert.equal(artifact.immutable, true);
  assert.deepEqual(Buffer.from(artifact.bytes), f.original);
  assert.deepEqual(f.reads, [{ companyId: 8, receiptId: 101, documentId: 100 }]);
  assert.deepEqual(f.downloads, [{ bucket: DOCUMENT_INSTANCE_ORIGINAL_BUCKET, storagePath: f.record.storagePath }]);
});

test("an archived Supabase path remains valid because content identity is the hash", async () => {
  const f = fixture();
  f.setRecord({ ...f.record, storagePath: "8/fylgiskjol/2026/01/12/12-1720000000000-festa.pdf" });
  assert.ok(await f.loader(f.document));
});

test("missing or foreign DB scope fails before storage access", async () => {
  for (const record of [
    null,
    { ...fixture().record, companyId: 9 },
    { ...fixture().record, receiptId: 999 },
    { ...fixture().record, documentId: 999 },
  ]) {
    const f = fixture();
    f.setRecord(record);
    assert.equal(await f.loader(f.document), null);
    assert.equal(f.downloads.length, 0);
  }
});

test("stored hash must be a current digest equal to the service source hash", async () => {
  for (const mutate of [
    (f: ReturnType<typeof fixture>) => { f.document.sourceFileHash = null; },
    (f: ReturnType<typeof fixture>) => { f.document.sourceFileHash = "BAD"; },
    (f: ReturnType<typeof fixture>) => { f.setRecord({ ...f.record, fileHash: null }); },
    (f: ReturnType<typeof fixture>) => { f.setRecord({ ...f.record, fileHash: "b".repeat(64) }); },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(await f.loader(f.document), null);
    assert.equal(f.downloads.length, 0);
  }
});

test("storage path must remain inside the exact company prefix", async () => {
  for (const storagePath of [
    null,
    "9/festa.pdf",
    "/8/festa.pdf",
    "8\\festa.pdf",
    "8/../9/festa.pdf",
    "8//festa.pdf",
    " 8/festa.pdf",
  ]) {
    const f = fixture();
    f.setRecord({ ...f.record, storagePath });
    assert.equal(await f.loader(f.document), null);
    assert.equal(f.downloads.length, 0);
  }
});

test("storage failures and empty objects fail closed", async () => {
  for (const bytes of [null, Buffer.alloc(0)]) {
    const f = fixture();
    f.setBytes(bytes);
    assert.equal(await f.loader(f.document), null);
  }
});

test("changed bytes cannot authenticate even when DB metadata still has the old hash", async () => {
  const f = fixture();
  f.setBytes(Buffer.from("changed-object-content"));
  assert.equal(await f.loader(f.document), null);
});

test("returned bytes are detached from the provider-owned buffer", async () => {
  const f = fixture();
  const providerBuffer = Buffer.from(f.original);
  f.setBytes(providerBuffer);
  const artifact = await f.loader(f.document);
  assert.ok(artifact);
  providerBuffer.fill(0);
  assert.deepEqual(Buffer.from(artifact.bytes), f.original);
});

test("invalid service scope never performs DB or storage reads", async () => {
  for (const mutate of [
    (document: IdentityServiceDocument) => { document.companyId = 0; },
    (document: IdentityServiceDocument) => { document.receiptId = -1; },
    (document: IdentityServiceDocument) => { document.documentId = Number.NaN; },
  ]) {
    const f = fixture();
    mutate(f.document);
    assert.equal(await f.loader(f.document), null);
    assert.equal(f.reads.length, 0);
    assert.equal(f.downloads.length, 0);
  }
});


test("Prisma/Supabase adapter uses exact company+receipt+document scope and fixed bucket", async () => {
  const f = fixture();
  const calls: Array<{ kind: string; value: unknown }> = [];
  const deps = createPrismaSupabaseOriginalArtifactDependencies({
    prisma: {
      aiDetectedDocument: {
        async findFirst(args: unknown) {
          calls.push({ kind: "db", value: structuredClone(args) });
          return {
            id: 100,
            receiptId: 101,
            receipt: {
              companyId: 8,
              fileHash: f.fileHash,
              storagePath: "8/fylgiskjol/2026/01/12/festa.pdf",
            },
          };
        },
      },
    },
    storage: {
      from(bucket: string) {
        calls.push({ kind: "bucket", value: bucket });
        return {
          async download(storagePath: string) {
            calls.push({ kind: "download", value: storagePath });
            return {
              data: { async arrayBuffer() {
                return f.original.buffer.slice(
                  f.original.byteOffset,
                  f.original.byteOffset + f.original.byteLength,
                ) as ArrayBuffer;
              } },
              error: null,
            };
          },
        };
      },
    },
  });
  const loader = createDocumentInstanceOriginalArtifactLoader(deps);
  assert.ok(await loader(f.document));
  assert.deepEqual(calls[0], {
    kind: "db",
    value: {
      where: { id: 100, receiptId: 101, receipt: { companyId: 8 } },
      select: {
        id: true,
        receiptId: true,
        receipt: { select: { companyId: true, fileHash: true, storagePath: true } },
      },
    },
  });
  assert.deepEqual(calls.slice(1), [
    { kind: "bucket", value: DOCUMENT_INSTANCE_ORIGINAL_BUCKET },
    { kind: "download", value: "8/fylgiskjol/2026/01/12/festa.pdf" },
  ]);
});

test("Prisma/Supabase adapter converts storage errors to fail-closed null", async () => {
  const f = fixture();
  const deps = createPrismaSupabaseOriginalArtifactDependencies({
    prisma: {
      aiDetectedDocument: {
        async findFirst() {
          return {
            id: 100, receiptId: 101,
            receipt: { companyId: 8, fileHash: f.fileHash, storagePath: "8/festa.pdf" },
          };
        },
      },
    },
    storage: {
      from() {
        return { async download() { return { data: null, error: new Error("storage down") }; } };
      },
    },
  });
  assert.equal(await createDocumentInstanceOriginalArtifactLoader(deps)(f.document), null);
});
