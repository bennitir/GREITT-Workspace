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
  };

  return createDocumentInstanceEvidenceVerifier(evidenceDependencies);
}
