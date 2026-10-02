import { createHash } from "node:crypto";

import type { OriginalIdentityArtifact } from "./document-instance-evidence";
import type { IdentityServiceDocument } from "./document-instance-service";

export const DOCUMENT_INSTANCE_ORIGINAL_BUCKET = "fylgiskjol" as const;

export type DocumentInstanceOriginalRecord = {
  companyId: number;
  receiptId: number;
  documentId: number;
  fileHash: string | null;
  storagePath: string | null;
};


export type DocumentInstanceOriginalArtifactPrisma = {
  aiDetectedDocument: {
    findFirst(args: any): Promise<any>;
  };
};

export type DocumentInstanceOriginalArtifactStorage = {
  from(bucket: string): {
    download(storagePath: string): Promise<{
      data: { arrayBuffer(): Promise<ArrayBuffer> } | null;
      error: unknown;
    }>;
  };
};

export type DocumentInstanceOriginalArtifactDependencies = {
  readOriginalRecord(input: {
    companyId: number;
    receiptId: number;
    documentId: number;
  }): Promise<DocumentInstanceOriginalRecord | null>;
  downloadOriginal(input: {
    bucket: typeof DOCUMENT_INSTANCE_ORIGINAL_BUCKET;
    storagePath: string;
  }): Promise<Buffer | Uint8Array | null>;
};

const DIGEST = /^[a-f0-9]{64}$/;

function positiveId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function companyScopedStoragePath(value: unknown, companyId: number): value is string {
  if (typeof value !== "string" || !value || value.trim() !== value) return false;
  if (!value.startsWith(`${companyId}/`) || value.includes("\\")) return false;

  const segments = value.split("/");
  return segments.length >= 2 && segments.every(
    (segment) => segment.length > 0 && segment !== "." && segment !== "..",
  );
}

function sha256(bytes: Buffer | Uint8Array) {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Loads the durable original receipt object that belongs to the exact
 * company/receipt/document scope used by the identity service.
 *
 * `immutable: true` is asserted only after the downloaded bytes have been
 * authenticated against the persisted SHA-256 that is already bound into the
 * document-instance evidence. The Supabase object path may move when a receipt
 * is archived; the content version is the hash, not the pathname.
 *
 * Legacy local `filePath` data is intentionally not accepted here. Identity
 * confirmation requires the durable Supabase original and fails closed when it
 * is absent, foreign, ambiguous or changed.
 */
export function createDocumentInstanceOriginalArtifactLoader(
  deps: DocumentInstanceOriginalArtifactDependencies,
): (document: IdentityServiceDocument) => Promise<OriginalIdentityArtifact | null> {
  return async (document) => {
    if (
      !positiveId(document.companyId) ||
      !positiveId(document.receiptId) ||
      !positiveId(document.documentId) ||
      typeof document.sourceFileHash !== "string" ||
      !DIGEST.test(document.sourceFileHash)
    ) {
      return null;
    }

    const record = await deps.readOriginalRecord({
      companyId: document.companyId,
      receiptId: document.receiptId,
      documentId: document.documentId,
    });

    if (
      !record ||
      record.companyId !== document.companyId ||
      record.receiptId !== document.receiptId ||
      record.documentId !== document.documentId ||
      typeof record.fileHash !== "string" ||
      !DIGEST.test(record.fileHash) ||
      record.fileHash !== document.sourceFileHash ||
      !companyScopedStoragePath(record.storagePath, document.companyId)
    ) {
      return null;
    }

    const downloaded = await deps.downloadOriginal({
      bucket: DOCUMENT_INSTANCE_ORIGINAL_BUCKET,
      storagePath: record.storagePath,
    });
    if (!downloaded || downloaded.byteLength === 0) return null;

    // Copy the snapshot so a mutable provider-owned Uint8Array cannot be
    // changed after we authenticate it.
    const bytes = Buffer.from(downloaded);
    if (sha256(bytes) !== record.fileHash) return null;

    return { bytes, immutable: true };
  };
}


/**
 * Concrete read/download adapter for GLÖGGT's current Prisma + Supabase shape.
 * Kept injectable so tenant scoping and bucket/path selection are unit-testable
 * without touching a database or storage service.
 */
export function createPrismaSupabaseOriginalArtifactDependencies(args: {
  prisma: DocumentInstanceOriginalArtifactPrisma;
  storage: DocumentInstanceOriginalArtifactStorage;
}): DocumentInstanceOriginalArtifactDependencies {
  return {
    async readOriginalRecord(input) {
      const row = await args.prisma.aiDetectedDocument.findFirst({
        where: {
          id: input.documentId,
          receiptId: input.receiptId,
          receipt: { companyId: input.companyId },
        },
        select: {
          id: true,
          receiptId: true,
          receipt: {
            select: {
              companyId: true,
              fileHash: true,
              storagePath: true,
            },
          },
        },
      });
      if (!row?.receipt) return null;
      return {
        companyId: row.receipt.companyId,
        receiptId: row.receiptId,
        documentId: row.id,
        fileHash: row.receipt.fileHash,
        storagePath: row.receipt.storagePath,
      };
    },
    async downloadOriginal(input) {
      if (input.bucket !== DOCUMENT_INSTANCE_ORIGINAL_BUCKET) return null;
      const { data, error } = await args.storage
        .from(DOCUMENT_INSTANCE_ORIGINAL_BUCKET)
        .download(input.storagePath);
      if (error || !data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
  };
}
