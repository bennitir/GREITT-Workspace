import "server-only";

import { extractTextPagesFromPdfBuffer } from "@/lib/core/pdf-text";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import {
  createDocumentInstanceEvidenceVerifier,
  type DocumentInstanceEvidenceDependencies,
} from "./document-instance-evidence";
import {
  createDocumentInstanceOriginalArtifactLoader,
  createPrismaSupabaseOriginalArtifactDependencies,
} from "./document-instance-original-artifact";

/**
 * Server-only composition for the trusted evidence verifier.
 *
 * The DB lookup re-resolves the exact document -> receipt ownership and current
 * durable storage pointer. Legacy local filePath is intentionally excluded.
 * The pure loader then authenticates the downloaded bytes against Receipt.fileHash
 * before the evidence verifier reads the claimed PDF page.
 */
export function createGloggtDocumentInstanceEvidenceVerifier() {
  const evidenceDependencies: DocumentInstanceEvidenceDependencies = {
    loadOriginalArtifact: createDocumentInstanceOriginalArtifactLoader(
      createPrismaSupabaseOriginalArtifactDependencies({
        prisma,
        storage: supabaseAdmin.storage,
      }),
    ),
    extractTextPages: extractTextPagesFromPdfBuffer,
    async loadReviewedCanonicalText(document) {
      const row = await prisma.aiDetectedDocument.findFirst({
        where: {
          id: document.documentId,
          receiptId: document.receiptId,
          reviewedAt: { not: null },
          receipt: { companyId: document.companyId },
        },
        select: {
          summary: true,
          reviewedAt: true,
          receipt: { select: { fileHash: true } },
        },
      });
      if (
        !row?.reviewedAt ||
        !row.summary.trim() ||
        !document.sourceFileHash ||
        row.receipt.fileHash !== document.sourceFileHash
      ) {
        return null;
      }
      return {
        sourceField: "summary" as const,
        text: row.summary,
        reviewedAt: row.reviewedAt.toISOString(),
      };
    },
  };

  return createDocumentInstanceEvidenceVerifier(evidenceDependencies);
}
