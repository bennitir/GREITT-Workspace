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
import { queueInsightForDocument } from "@/lib/insight/auto-enqueue";


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

  const companyId =
    await requireActiveCompanyWriteAccess();

  // Tryggjum áfram að handvirki Innsýn-takkinn geti aðeins
  // unnið skjal sem tilheyrir virku fyrirtæki notandans.
  const document =
    await prisma.aiDetectedDocument.findFirst({
      where: {
        id: documentId,
        receipt: {
          companyId,
        },
      },
      select: {
        id: true,
        receiptId: true,
      },
    });

  if (!document) {
    throw new Error(
      "Skjalið fannst ekki eða þú hefur ekki aðgang að því.",
    );
  }

  const effectiveUser = await getEffectiveUser();

  const result = await queueInsightForDocument({
    documentId: document.id,
    requestedById: effectiveUser?.id ?? null,
    enabled: true,
    allowMultiplePersons:
      options.allowMultiplePersons === true,
    source: "USER_REQUEST",
    trigger: "SERVER_ACTION",
  });

  if (result.created && result.jobId) {
    after(async () => {
      try {
        await runInsightWorker({
          jobId: result.jobId!,
          maxItems: 1,
        });
      } catch (error) {
        console.error(
          `Sjálfvirk Innsýn-vinnsla mistókst fyrir job ${result.jobId}:`,
          error,
        );
      }
    });
  }

  revalidatePath("/fylgiskjol");
  revalidatePath("/fylgiskjol/skjalasafn");
  revalidatePath(
    `/fylgiskjol/${document.receiptId}`,
  );

  return result;
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