"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  requireActiveCompanyWriteAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import { createInsightProcessingJob } from "@/lib/insight/processing-service";

const INSIGHT_PROCESSING_VERSION = "innsyn-v1";

export async function createInsightJobForDocument(documentId: number) {
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
          filePath: true,
        },
      },
    },
  });

  if (!document) {
    throw new Error(
      "Skjalið fannst ekki eða þú hefur ekki aðgang að því."
    );
  }

  if (!document.receipt.filePath) {
    throw new Error("Frumskjal vantar og því er ekki hægt að keyra Innsýn.");
  }

  const existingItem = await prisma.insightProcessingItem.findFirst({
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
      jobId: existingItem.jobId,
      itemId: existingItem.id,
      status: existingItem.status,
      message: "Skjalið er þegar í Innsýn-vinnslu.",
    };
  }

  const effectiveUser = await getEffectiveUser();

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
    },
  });

  revalidatePath("/fylgiskjol");
  revalidatePath("/fylgiskjol/skjalasafn");
  revalidatePath(`/fylgiskjol/${document.receiptId}`);

  return {
    created: true,
    jobId: job.id,
    itemId: job.items[0]?.id ?? null,
    status: job.status,
    message: "Skjalið hefur verið sett í Innsýn-vinnslu.",
  };
}

export async function getInsightJobStatus(jobId: number) {
  if (!Number.isInteger(jobId) || jobId <= 0) {
    throw new Error("Ógilt vinnslunúmer.");
  }

  const companyId = await requireActiveCompanyWriteAccess();

  const job = await prisma.insightProcessingJob.findFirst({
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
      "Innsýn-vinnslan fannst ekki eða þú hefur ekki aðgang að henni."
    );
  }

  return job;
}