import { prisma } from "@/lib/prisma";
import { extractPersonKennitolur } from "@/lib/core/kennitala";
import { extractTextFromPdfBuffer } from "@/lib/core/pdf-text";
import { supabaseAdmin } from "@/lib/supabase";
import { createInsightProcessingJob } from "@/lib/insight/processing-service";

export const INSIGHT_PROCESSING_VERSION = "innsyn-v1";

type QueueInsightForDocumentInput = {
  documentId: number;
  requestedById?: number | null;
  enabled?: boolean;
  allowMultiplePersons?: boolean;
  source?: string;
  trigger?: string;
};

type PrivacyPreflightResult = {
  text: string;
  source: "PDF_SOURCE_TEXT" | "OCR_TEXT_FALLBACK";
};

function isPdfDocument(input: {
  fileName: string | null;
  filePath: string | null;
  storagePath: string | null;
}) {
  const candidates = [
    input.fileName,
    input.storagePath,
    input.filePath,
  ];

  return candidates.some(
    (value) =>
      typeof value === "string" &&
      value.toLowerCase().endsWith(".pdf"),
  );
}

async function getPrivacyPreflightText(input: {
  fileName: string | null;
  filePath: string | null;
  storagePath: string | null;
  ocrText: string | null;
}): Promise<PrivacyPreflightResult> {
  if (isPdfDocument(input)) {
    if (!input.storagePath) {
      throw new Error(
        "Ekki tókst að framkvæma persónuverndarathugun Innsýnar því PDF-frumskjalið fannst ekki í varanlegri skjalageymslu.",
      );
    }

    const { data, error } = await supabaseAdmin.storage
      .from("fylgiskjol")
      .download(input.storagePath);

    if (error || !data) {
      throw new Error(
        "Ekki tókst að lesa PDF-frumskjalið fyrir persónuverndarathugun Innsýnar.",
      );
    }

    const arrayBuffer = await data.arrayBuffer();
    const pdfBuffer = new Uint8Array(arrayBuffer);

    let text: string;

    try {
      text = await extractTextFromPdfBuffer(pdfBuffer);
    } catch (error) {
      console.error(
        "Villa við PDF-textalestur fyrir Innsýn-preflight:",
        error,
      );

      throw new Error(
        "Ekki tókst að lesa textalag PDF-skjalsins fyrir persónuverndarathugun Innsýnar.",
      );
    }

    if (!text.trim()) {
      throw new Error(
        "PDF-skjalið inniheldur ekkert læsilegt textalag. Innsýn verður ekki keyrð fyrr en hægt er að framkvæma örugga persónuverndarathugun á frumskjalinu.",
      );
    }

    return {
      text,
      source: "PDF_SOURCE_TEXT",
    };
  }

  return {
    text: input.ocrText ?? "",
    source: "OCR_TEXT_FALLBACK",
  };
}

export async function queueInsightForDocument(
  input: QueueInsightForDocumentInput,
) {
  if (input.enabled === false) {
    return {
      created: false,
      requiresPrivacyConfirmation: false,
      personCount: 0,
      jobId: null,
      itemId: null,
      status: "AI_DISABLED",
      message: "AI-Innsýn er óvirk.",
    };
  }

  if (
    !Number.isInteger(input.documentId) ||
    input.documentId <= 0
  ) {
    throw new Error("Ógilt skjalanúmer.");
  }

  const document = await prisma.aiDetectedDocument.findUnique({
    where: {
      id: input.documentId,
    },
    select: {
      id: true,
      receiptId: true,
      documentType: true,
      documentRole: true,
      disposition: true,
      receipt: {
        select: {
          id: true,
          companyId: true,
          fileName: true,
          filePath: true,
          storagePath: true,
          ocrText: true,
        },
      },
    },
  });

  if (!document) {
    throw new Error("Skjalið fannst ekki.");
  }

  if (
    !document.receipt.storagePath &&
    !document.receipt.filePath
  ) {
    throw new Error(
      "Frumskjal vantar og því er ekki hægt að keyra Innsýn.",
    );
  }

  const privacyPreflight =
    await getPrivacyPreflightText({
      fileName: document.receipt.fileName,
      filePath: document.receipt.filePath,
      storagePath: document.receipt.storagePath,
      ocrText: document.receipt.ocrText,
    });

  const personKennitolur = extractPersonKennitolur(
    privacyPreflight.text,
  );

  const requiresPrivacyConfirmation =
    personKennitolur.length > 1;

  /*
   * Mikilvægt:
   * Þetta stöðvar ALDREI bókun skjalsins.
   * Aðeins dýpri Innsýn-vinnsla bíður eftir meðvitaðri
   * ákvörðun um meðferð upplýsinga annarra einstaklinga.
   */
  if (
    requiresPrivacyConfirmation &&
    input.allowMultiplePersons !== true
  ) {
    return {
      created: false,
      requiresPrivacyConfirmation: true,
      personCount: personKennitolur.length,
      jobId: null,
      itemId: null,
      status: "PRIVACY_DECISION_REQUIRED",
      message:
        "Skjalið inniheldur upplýsingar um fleiri en einn einstakling. Bókun heldur áfram óháð þessu; taka þarf meðvitaða ákvörðun um birtingu upplýsinga annarra í Innsýn.",
    };
  }

  const existingItem =
    await prisma.insightProcessingItem.findFirst({
      where: {
        documentId: document.id,
        processingVersion: INSIGHT_PROCESSING_VERSION,
        status: {
          in: ["PENDING", "PROCESSING"],
        },
        job: {
          companyId: document.receipt.companyId,
        },
      },
      select: {
        id: true,
        jobId: true,
        status: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

  if (existingItem) {
    return {
      created: false,
      requiresPrivacyConfirmation: false,
      personCount: personKennitolur.length,
      jobId: existingItem.jobId,
      itemId: existingItem.id,
      status: existingItem.status,
      message: "Skjalið er þegar í Innsýn-vinnslu.",
    };
  }

  if (
    requiresPrivacyConfirmation &&
    input.allowMultiplePersons === true
  ) {
    await prisma.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: input.requestedById ?? null,
        entityType: "AI_DETECTED_DOCUMENT",
        entityId: document.id,
        parentEntityType: "RECEIPT",
        parentEntityId: document.receiptId,
        action: "INSIGHT_PRIVACY_CONFIRMATION",
        source: "USER",
        description:
          "Notandi tók meðvitaða ákvörðun um að halda áfram Innsýn-vinnslu skjals sem inniheldur fleiri en einn einstakling.",
        metadata: {
          personCount: personKennitolur.length,
          processingVersion: INSIGHT_PROCESSING_VERSION,
          preflightSource: privacyPreflight.source,
        },
      },
    });
  }

  const job = await createInsightProcessingJob({
    companyId: document.receipt.companyId,
    requestedById: input.requestedById ?? null,
    jobType: "DOCUMENT_INSIGHT",
    processingVersion: INSIGHT_PROCESSING_VERSION,
    source: input.source?.trim() || "SYSTEM",
    targets: [
      {
        receiptId: document.receiptId,
        documentId: document.id,
      },
    ],
    metadata: {
      trigger: input.trigger?.trim() || "AUTO_ENQUEUE",
      documentType: document.documentType,
      documentRole: document.documentRole,
      disposition: document.disposition,
      privacyPreflight: {
        source: privacyPreflight.source,
        personCount: personKennitolur.length,
        multiplePersonsDetected:
          requiresPrivacyConfirmation,
        userConfirmedMultiplePersons:
          requiresPrivacyConfirmation &&
          input.allowMultiplePersons === true,
      },
    },
  });

  return {
    created: true,
    requiresPrivacyConfirmation: false,
    personCount: personKennitolur.length,
    jobId: job.id,
    itemId: job.items[0]?.id ?? null,
    status: job.status,
    message: "Skjalið hefur verið sett í Innsýn-vinnslu.",
  };
}
