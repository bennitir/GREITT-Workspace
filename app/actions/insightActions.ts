"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  requireActiveCompanyWriteAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import { extractPersonKennitolur } from "@/lib/core/kennitala";
import { extractTextFromPdfBuffer } from "@/lib/core/pdf-text";
import { supabaseAdmin } from "@/lib/supabase";
import { createInsightProcessingJob } from "@/lib/insight/processing-service";
import { runInsightWorker } from "@/lib/insight/worker";

const INSIGHT_PROCESSING_VERSION = "innsyn-v1";

type CreateInsightJobOptions = {
  allowMultiplePersons?: boolean;
};

type PrivacyPreflightResult = {
  text: string;
  source:
    | "PDF_SOURCE_TEXT"
    | "OCR_TEXT_FALLBACK";
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
  /*
   * PDF:
   * Lesum frumskjalið sjálft staðbundið á GLÖGGT-servernum.
   *
   * Skjalið er ekki sent til AI við þessa athugun.
   */
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

  /*
   * Tímabundið fallback fyrir aðrar skráartegundir.
   *
   * PDF er nú lesið úr frumskjalinu sjálfu.
   * Excel, Word, CSV, myndir o.fl. fá síðar eigin staðbundna
   * source-parsera í sama preflight-lagi.
   *
   * Þetta fallback er því ekki fullkomin persónuverndarvörn
   * fyrir allar skráartegundir.
   */
  return {
    text: input.ocrText ?? "",
    source: "OCR_TEXT_FALLBACK",
  };
}

export async function createInsightJobForDocument(
  documentId: number,
  options: CreateInsightJobOptions = {},
) {
  if (!Number.isInteger(documentId) || documentId <= 0) {
    throw new Error("Ógilt skjalanúmer.");
  }

  const companyId = await requireActiveCompanyWriteAccess();

  const document = await prisma.aiDetectedDocument.findFirst({
    where: {
      id: documentId,
      receipt: {
        companyId,
      },
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
    throw new Error(
      "Skjalið fannst ekki eða þú hefur ekki aðgang að því.",
    );
  }

  if (
    !document.receipt.storagePath &&
    !document.receipt.filePath
  ) {
    throw new Error(
      "Frumskjal vantar og því er ekki hægt að keyra Innsýn.",
    );
  }

  /*
   * Persónuverndar-preflight fyrir Innsýn.
   *
   * Þetta hefur eingöngu áhrif á Innsýn-vinnslu skjalsins.
   * Það breytir hvorki bókun, launum, Verk, VSK né annarri
   * skráningu GLÖGGT.
   *
   * Fyrir PDF er frumskjalið lesið staðbundið áður en
   * Innsýn-jobb er stofnað.
   */
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

  if (
    requiresPrivacyConfirmation &&
    options.allowMultiplePersons !== true
  ) {
    return {
      created: false,
      requiresPrivacyConfirmation: true,
      personCount: personKennitolur.length,
      jobId: null,
      itemId: null,
      status: "PRIVACY_CONFIRMATION_REQUIRED",
      message:
        "Skjalið virðist innihalda upplýsingar um fleiri en einn einstakling.",
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
          companyId,
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

  const effectiveUser = await getEffectiveUser();

  /*
   * Ef fleiri en ein persónukennitala fannst og notandi hefur
   * sérstaklega heimilað áframhaldandi Innsýn-vinnslu,
   * varðveitum við ákvörðunina í rekjanleika GLÖGGT.
   *
   * Kennitölurnar sjálfar eru ekki settar í AuditEvent.
   */
  if (
    requiresPrivacyConfirmation &&
    options.allowMultiplePersons === true
  ) {
    await prisma.auditEvent.create({
      data: {
        companyId,
        userId: effectiveUser?.id ?? null,
        entityType: "AI_DETECTED_DOCUMENT",
        entityId: document.id,
        parentEntityType: "RECEIPT",
        parentEntityId: document.receiptId,
        action: "INSIGHT_PRIVACY_CONFIRMATION",
        source: "USER",
        description:
          "Notandi samþykkti Innsýn-vinnslu skjals sem inniheldur fleiri en eina persónukennitölu.",
        metadata: {
          personCount: personKennitolur.length,
          processingVersion:
            INSIGHT_PROCESSING_VERSION,
          preflightSource:
            privacyPreflight.source,
        },
      },
    });
  }

  const job = await createInsightProcessingJob({
    companyId,
    requestedById: effectiveUser?.id ?? null,
    jobType: "DOCUMENT_INSIGHT",
    processingVersion: INSIGHT_PROCESSING_VERSION,
    source: "USER_REQUEST",
    targets: [
      {
        receiptId: document.receiptId,
        documentId: document.id,
      },
    ],
    metadata: {
      trigger: "SERVER_ACTION",
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
          options.allowMultiplePersons === true,
      },
    },
  });

  /*
   * Ræsum nákvæmlega þetta Innsýn-jobb eftir að Server Action
   * hefur lokið svari sínu.
   *
   * Jobbið sjálft er þegar varanlega skráð í gagnagrunninum.
   * Þannig er biðröðin áfram sannleikurinn og hægt er að
   * endurheimta vinnslu þótt þessi bakgrunnsræsing mistakist.
   *
   * maxItems: 1 passar við DOCUMENT_INSIGHT-jobb sem stofnað er
   * hér með einu skjali.
   */
  after(async () => {
    try {
      await runInsightWorker({
        jobId: job.id,
        maxItems: 1,
      });
    } catch (error) {
      console.error(
        `Sjálfvirk Innsýn-vinnsla mistókst fyrir job ${job.id}:`,
        error,
      );
    }
  });

  revalidatePath("/fylgiskjol");
  revalidatePath("/fylgiskjol/skjalasafn");
  revalidatePath(
    `/fylgiskjol/${document.receiptId}`,
  );

  return {
    created: true,
    requiresPrivacyConfirmation: false,
    personCount: personKennitolur.length,
    jobId: job.id,
    itemId: job.items[0]?.id ?? null,
    status: job.status,
    message:
      "Skjalið hefur verið sett í Innsýn-vinnslu.",
  };
}

export async function getInsightJobStatus(jobId: number) {
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error("Ógilt vinnslunúmer.");
  }

  const companyId =
    await requireActiveCompanyWriteAccess();

  const job =
    await prisma.insightProcessingJob.findFirst({
      where: {
        id: jobId,
        companyId,
      },
      select: {
        id: true,
        jobType: true,
        status: true,
        processingVersion: true,
        totalItems: true,
        pendingItems: true,
        processingItems: true,
        completedItems: true,
        failedItems: true,
        startedAt: true,
        completedAt: true,
        errorMessage: true,
        createdAt: true,
        updatedAt: true,
        items: {
          orderBy: {
            id: "asc",
          },
          select: {
            id: true,
            receiptId: true,
            documentId: true,
            status: true,
            attemptCount: true,
            startedAt: true,
            completedAt: true,
            errorMessage: true,
          },
        },
      },
    });

  if (!job) {
    throw new Error(
      "Innsýn-vinnslan fannst ekki eða þú hefur ekki aðgang að henni.",
    );
  }

  return job;
}