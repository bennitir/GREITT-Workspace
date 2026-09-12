"use server";
import { queueInsightForDocument } from "@/lib/insight/auto-enqueue";
import { runInsightWorker } from "@/lib/insight/worker";
import {
  requireActiveCompanyWriteAccess,
  requireCompanyBookAccess,
  requireCompanyDeleteAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";
import { cookies } from "next/headers";
import { after } from "next/server";
import { createReadStream } from "fs";
import OpenAI from "openai";
import {
  writeFile,
  readFile,
  unlink,
} from "fs/promises";
import path from "path";
import os from "os";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { revalidatePath } from "next/cache";

async function saveReceiptFile(file: File, companyId: number) {
  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const safeFileName = file.name
    .replace(/ð/gi, "d")
    .replace(/þ/gi, "th")
    .replace(/æ/gi, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_");

  const timestamp = Date.now();
  const storagePath = `${companyId}/${timestamp}-${safeFileName}`;

  const { error } = await supabaseAdmin.storage
    .from("fylgiskjol")
    .upload(storagePath, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (error) {
    throw new Error(`Mistókst að vista fylgiskjal í Supabase: ${error.message}`);
  }

  // Supabase Storage is the durable source of truth. filePath is retained as
  // a compatibility/display path for older UI code; production must not rely
  // on a writable public/uploads directory.
  const fileName = `${timestamp}-${file.name}`;

  return {
    fileName,
    filePath: `/uploads/${fileName}`,
    storagePath,
  };
}

async function downloadReceiptBuffer(receipt: {
  storagePath?: string | null;
  filePath?: string | null;
}) {
  if (receipt.storagePath) {
    const { data, error } = await supabaseAdmin.storage
      .from("fylgiskjol")
      .download(receipt.storagePath);

    if (error || !data) {
      throw new Error(
        `Mistókst að sækja frumskjal úr Supabase: ${error?.message ?? "skrá fannst ekki"}`
      );
    }

    return Buffer.from(await data.arrayBuffer());
  }

  // Legacy fallback for older local-only receipts.
  if (receipt.filePath) {
    const fullPath = path.join(process.cwd(), "public", receipt.filePath);
    return readFile(fullPath);
  }

  throw new Error("Ekkert stafrænt frumskjal er tengt þessu fylgiskjali.");
}

async function backfillMissingReceiptHashes() {
  const receipts = await prisma.receipt.findMany({
    where: {
      fileHash: null,
    },
    select: {
      id: true,
      filePath: true,
      storagePath: true,
    },
  });

  for (const receipt of receipts) {
    try {
      const buffer = await downloadReceiptBuffer(receipt);
      const fileHash = crypto
        .createHash("sha256")
        .update(buffer)
        .digest("hex");

      await prisma.receipt.update({
        where: {
          id: receipt.id,
        },
        data: {
          fileHash,
        },
      });
    } catch (error) {
      console.error(
        `Gat ekki búið til hash fyrir fylgiskjal ${receipt.id}:`,
        error
      );
    }
  }
}

async function archiveReceiptFile(receiptId: number) {
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      aiDetectedDocuments: true,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (
    receipt.aiDetectedDocuments.length === 0 &&
    receipt.voucherNumber === null
  ) {
    return;
  }

  const isManualReceipt =
    receipt.aiDetectedDocuments.length === 0 &&
    receipt.voucherNumber !== null;

  const allApproved = isManualReceipt
    ? receipt.status === "APPROVED"
    : receipt.aiDetectedDocuments.every(
        (document) =>
          document.approvedAt !== null &&
          document.voucherNumber !== null
      );

  if (!allApproved) {
    return;
  }

  const voucherNumbers = isManualReceipt
    ? [receipt.voucherNumber]
    : receipt.aiDetectedDocuments
        .map((document) => document.voucherNumber)
        .filter((number): number is number => number !== null)
        .sort((a, b) => a - b);

  const firstVoucherNumber = voucherNumbers[0];
  const lastVoucherNumber = voucherNumbers[voucherNumbers.length - 1];

  const voucherFolderName =
    firstVoucherNumber === lastVoucherNumber
      ? String(firstVoucherNumber)
      : `${firstVoucherNumber}-${lastVoucherNumber}`;

  const documentDate = receipt.aiDetectedDocuments[0]?.date ?? receipt.date;

  if (!documentDate || !receipt.fileName) {
    return;
  }

  const year = String(documentDate.getFullYear());
  const month = String(documentDate.getMonth() + 1).padStart(2, "0");
  const archivedFileName = `${voucherFolderName}-${receipt.fileName}`;
  const newPublicPath =
    `/uploads/fylgiskjol/${year}/${month}/${voucherFolderName}/${archivedFileName}`;

  if (receipt.storagePath) {
    const newStoragePath =
      `${receipt.companyId}/fylgiskjol/${year}/${month}/${voucherFolderName}/${archivedFileName}`;

    if (receipt.storagePath !== newStoragePath) {
      const { error } = await supabaseAdmin.storage
        .from("fylgiskjol")
        .move(receipt.storagePath, newStoragePath);

      if (error) {
        throw new Error(`Mistókst að færa fylgiskjal í skjalasafn: ${error.message}`);
      }
    }

    await prisma.receipt.update({
      where: { id: receipt.id },
      data: {
        filePath: newPublicPath,
        storagePath: newStoragePath,
      },
    });
    return;
  }

  // Legacy local-only receipts are left in place in production. They can be
  // migrated to Supabase separately instead of relying on a writable bundle.
  if (receipt.filePath === newPublicPath) {
    return;
  }
}

async function runAutomaticInsightForDocuments(documentIds: number[]) {
  for (const documentId of documentIds) {
    try {
      const insightResult = await queueInsightForDocument({
        documentId,
        enabled: true,
        source: "SYSTEM",
        trigger: "RECEIPT_ANALYSIS",
      });

      if (insightResult.created && insightResult.jobId) {
        await runInsightWorker({
          jobId: insightResult.jobId,
          maxItems: 1,
        });
      }
    } catch (error) {
      console.error(
        `Sjálfvirk Innsýn mistókst fyrir skjal ${documentId}:`,
        error,
      );
    }
  }
}

export async function createReceipt(formData: FormData) {
  await requireActiveCompanyWriteAccess();
  const file = formData.get("file") as File;
    if (!(file instanceof File) || file.size === 0) {
    throw new Error("Ekkert fylgiskjal var valið.");
  }
    const bytes = await file.arrayBuffer();
  const fileHash = crypto
    .createHash("sha256")
    .update(Buffer.from(bytes))
    .digest("hex");


    await backfillMissingReceiptHashes();


const receiptNumber =
  String(formData.get("receiptNumber") || "").trim();
const cookieStore = await cookies();
const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

if (!activeCompanyId) {
  throw new Error("Ekkert virkt fyrirtæki er valið.");
}

const companyId = Number(activeCompanyId);
const existingFile = await prisma.receipt.findFirst({
  where: {
    companyId,
    fileHash,
  },
});
console.log("DUPLICATE CHECK", {
  companyId,
  fileHash,
  existingFile,
});
if (existingFile) {
  throw new Error("Þetta skjal hefur þegar verið sótt fyrir þetta fyrirtæki.");
}
if (receiptNumber) {
  const existingReceipt = await prisma.receipt.findFirst({
    where: {
      receiptNumber,
    },
  });

  if (existingReceipt) {
    throw new Error("Þetta fylgiskjal er þegar skráð.");
  }
}

  const uploaded = await saveReceiptFile(file, companyId);

  const createdReceipt = await prisma.receipt.create({
    data: {
      date: formData.get("date")
  ? new Date(String(formData.get("date")))
  : null,

description:
  String(formData.get("description") || "").trim() ||
  "Ólesið fylgiskjal",

amount: formData.get("amount")
  ? Number(formData.get("amount"))
    : 0,
      receiptNumber: receiptNumber || null,
      companyId,
      fileName: uploaded.fileName,
      filePath: uploaded.filePath,
      storagePath: uploaded.storagePath,
      fileHash,
    },
  });
after(async () => {
  try {
    const analysisResult = await analyzeReceiptWithAI(createdReceipt.id);
    await runAutomaticInsightForDocuments(analysisResult.createdDocumentIds);
  } catch (error) {
    console.error(
      `AI-lestur mistókst fyrir fylgiskjal ${createdReceipt.id}:`,
      error
    );

    await prisma.receipt.update({
      where: {
        id: createdReceipt.id,
      },
      data: {
        status: "NEEDS_ATTENTION",
        ocrStatus: "AI-lestur mistókst",
      },
    });
  }
});
  revalidatePath("/fylgiskjol");

  return {
  receiptId: createdReceipt.id,
};
}

export async function createManualReceipt(formData: FormData) {
  await requireActiveCompanyWriteAccess();
  const file = formData.get("file");


  const cookieStore = await cookies();
  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki er valið.");
  }

  const rawDate =
    String(formData.get("date") || "").trim();

  let parsedDate: Date | null = null;

  if (rawDate) {
    const match = rawDate.match(
      /^(\d{2})\.(\d{2})\.(\d{4})$/
    );

    if (!match) {
      throw new Error(
        "Dagsetning verður að vera á forminu dd.mm.áááá."
      );
    }

    const [, day, month, year] = match;

    parsedDate = new Date(
      Number(year),
      Number(month) - 1,
      Number(day)
    );
  }

 const uploaded =
  file instanceof File && file.size > 0
    ? await saveReceiptFile(file, Number(activeCompanyId))
    : null;

    const rawVoucherNumber =
  String(formData.get("voucherNumber") || "").trim();

const voucherNumber =
  rawVoucherNumber !== ""
    ? Number(rawVoucherNumber)
    : null;

if (
  voucherNumber !== null &&
  (!Number.isInteger(voucherNumber) || voucherNumber <= 0)
) {
  throw new Error("Fylgiskjalsnúmer verður að vera jákvæð heiltala.");
}

if (voucherNumber !== null) {
  const existingVoucher = await prisma.receipt.findFirst({
    where: {
      companyId: Number(activeCompanyId),
      voucherNumber,
    },
  });

  if (existingVoucher) {
    throw new Error(
      `Fylgiskjalsnúmer ${voucherNumber} er þegar í notkun.`
    );
  }
}

  const createdReceipt =
    await prisma.receipt.create({
      data: {
                date: parsedDate,
        description:
          String(
            formData.get("description") || ""
          ).trim() || "Handvirkt fylgiskjal",
        amount: formData.get("amount")
          ? Number(formData.get("amount"))
                    : 0,
                    receiptNumber: String(formData.get("receiptNumber") || "").trim() || null,
                    voucherNumber,
merchantName: String(formData.get("merchantName") || "").trim() || null,
merchantKennitala:
  String(formData.get("merchantKennitala") || "").trim() || null,
        companyId: Number(activeCompanyId),
        fileName: uploaded?.fileName ?? null,
filePath: uploaded?.filePath ?? null,
        status: "NEW",
      },
    });

  revalidatePath("/fylgiskjol");

  return {
    receiptId: createdReceipt.id,
  };
}


export async function prepareExistingReceiptManually(
  receiptId: number,
  documentId: number | null,
  formData: FormData,
  bookingEntries: {
    account: string;
    text: string;
    debit: number;
    credit: number;
  }[],
) {
  const companyId = await requireActiveCompanyWriteAccess();
  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (bookingEntries.length === 0) {
    throw new Error("Engar bókunarlínur eru skráðar.");
  }

  const rawDate = String(formData.get("date") || "").trim();
  const dateMatch = rawDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);

  if (!dateMatch) {
    throw new Error("Dagsetning verður að vera á forminu dd.mm.áááá.");
  }

  const [, day, month, year] = dateMatch;
  const parsedDate = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
  );

  const rawAmount = String(formData.get("amount") || "").trim();
  const amount = Number(rawAmount);

  if (rawAmount === "" || !Number.isFinite(amount)) {
    throw new Error("Upphæð verður að vera gild tala.");
  }

  const debitTotal = bookingEntries.reduce(
    (sum, entry) => sum + Number(entry.debit || 0),
    0,
  );
  const creditTotal = bookingEntries.reduce(
    (sum, entry) => sum + Number(entry.credit || 0),
    0,
  );

  if (Math.abs(debitTotal - creditTotal) > 0.005) {
    throw new Error("Debet og kredit verða að stemma áður en sent er í yfirferð.");
  }

  const receipt = await prisma.receipt.findFirst({
    where: {
      id: receiptId,
      companyId,
      status: { not: "APPROVED" },
    },
    include: {
      aiDetectedDocuments: true,
    },
  });

  if (!receipt) {
    throw new Error("Óunnið fylgiskjal fannst ekki í þessu umhverfi.");
  }

  const requestedDocument =
    documentId == null
      ? null
      : receipt.aiDetectedDocuments.find(
          (document) => document.id === documentId,
        );

  if (documentId != null && !requestedDocument) {
    throw new Error("Valinn hluti fylgiskjalsins fannst ekki.");
  }

  if (
    requestedDocument &&
    (requestedDocument.approvedAt ||
      requestedDocument.voucherNumber != null ||
      requestedDocument.disposedAt ||
      requestedDocument.disposition)
  ) {
    throw new Error("Þessi hluti fylgiskjalsins hefur þegar verið afgreiddur.");
  }

  const description =
    String(formData.get("description") || "").trim() ||
    "Handvirkt undirbúið fylgiskjal";
  const merchantName =
    String(formData.get("merchantName") || "").trim() || null;
  const merchantKennitala =
    String(formData.get("merchantKennitala") || "").trim() || null;
  const receiptNumber =
    String(formData.get("receiptNumber") || "").trim() || null;

  const preparedDocumentId = await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: { id: receipt.id },
      data: requestedDocument
        ? {
            // Receipt can contain multiple detected documents. Keep shared
            // receipt-level accounting metadata untouched when preparing one
            // existing document manually; only reset the container workflow
            // status so the selected document can continue to review.
            status: "NEW",
          }
        : {
            date: parsedDate,
            description,
            amount,
            merchantName,
            merchantKennitala,
            receiptNumber,
            status: "NEW",
          },
    });

    let targetDocumentId: number;

    if (requestedDocument) {
      await tx.aiDetectedDocumentEntry.deleteMany({
        where: { documentId: requestedDocument.id },
      });

      await tx.aiDetectedDocument.update({
        where: { id: requestedDocument.id },
        data: {
          merchantName,
          merchantKennitala,
          date: parsedDate,
          receiptNumber,
          totalAmount: amount,
          summary: description,
          documentType: "ACCOUNTING_DOCUMENT",
          documentRole: "BOOKABLE",
          classificationConfidence: null,
          classificationSource: "MANUAL",
          classifiedAt: new Date(),
          reviewedAt: null,
          environmentReviewRequired: false,
          environmentReviewReason: null,
          bookingEntries: {
            create: bookingEntries.map((entry) => ({
              account: entry.account,
              text: entry.text,
              debit: entry.debit,
              credit: entry.credit,
            })),
          },
        },
      });

      targetDocumentId = requestedDocument.id;
    } else {
      const createdDocument = await tx.aiDetectedDocument.create({
        data: {
          receiptId: receipt.id,
          merchantName,
          merchantKennitala,
          date: parsedDate,
          receiptNumber,
          totalAmount: amount,
          summary: description,
          documentType: "ACCOUNTING_DOCUMENT",
          documentRole: "BOOKABLE",
          classificationConfidence: null,
          classificationSource: "MANUAL",
          classifiedAt: new Date(),
          environmentReviewRequired: false,
          environmentReviewReason: null,
          bookingEntries: {
            create: bookingEntries.map((entry) => ({
              account: entry.account,
              text: entry.text,
              debit: entry.debit,
              credit: entry.credit,
            })),
          },
        },
      });

      targetDocumentId = createdDocument.id;
    }

    await tx.auditEvent.create({
      data: {
        companyId,
        userId: user.id,
        entityType: "AiDetectedDocument",
        entityId: targetDocumentId,
        parentEntityType: "Receipt",
        parentEntityId: receipt.id,
        action: "PREPARE_RECEIPT_MANUALLY",
        source: "USER",
        description: "Fylgiskjal undirbúið handvirkt og sent í yfirferð.",
        metadata: {
          receiptId: receipt.id,
          documentId: targetDocumentId,
          preparationMethod: "MANUAL",
          aiRequired: false,
          merchantName,
          receiptNumber,
          documentDate: parsedDate.toISOString(),
          totalAmount: amount,
          bookingEntries: bookingEntries.map((entry) => ({
            account: entry.account,
            text: entry.text,
            debit: entry.debit,
            credit: entry.credit,
          })),
        },
      },
    });

    return targetDocumentId;
  });

  revalidatePath(`/fylgiskjol/${receipt.id}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/fylgiskjol/handvirkt");

  return {
    receiptId: receipt.id,
    documentId: preparedDocumentId,
  };
}

export async function addReceiptEntries(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const existingEntries = await prisma.receiptEntry.count({
    where: {
      receiptId,
    },
  });

  if (existingEntries > 0) {
    return;
  }

  await prisma.receiptEntry.createMany({
    data: [
      {
        account: "2550",
        text: "Staðgreiðsla",
        debit: 53508,
        credit: 0,
        receiptId,
      },
      {
        account: "4530",
        text: "Tryggingagjald",
        debit: 12532,
        credit: 0,
        receiptId,
      },
      {
        account: "1510",
        text: "Banki",
        debit: 0,
        credit: 66040,
        receiptId,
      },
    ],
  });

  

  revalidatePath(`/fylgiskjol/${receiptId}`);
}
export async function saveOcrResult(

  receiptId: number,
  data: {
    merchantName?: string;
    ocrText?: string;
    ocrConfidence?: number;
    ocrStatus?: string;
  }
) {
  await requireActiveCompanyWriteAccess();
  await prisma.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      merchantName: data.merchantName ?? null,
      ocrText: data.ocrText ?? null,
      ocrConfidence: data.ocrConfidence ?? null,
      ocrStatus: data.ocrStatus ?? null,
    },
  });

  revalidatePath(`/fylgiskjol/${receiptId}`);
}
function isVatPostingAccount(account: {
  type?: string | null;
  entryRole?: string | null;
  vatTreatment?: string | null;
}) {
  return (
    account.type === "VAT_INPUT" ||
    account.type === "VAT_OUTPUT" ||
    account.entryRole === "VAT_INPUT" ||
    account.entryRole === "VAT_OUTPUT"
  );
}

async function assertCompanyVatPostingAllowed(
  tx: any,
  company: { id: number; vatRegistered: boolean | null },
  entries: { account: string }[]
) {
  if (company.vatRegistered === true || entries.length === 0) {
    return;
  }

  const accountNumbers = [...new Set(entries.map((entry) => entry.account))];
  const accounts = await tx.account.findMany({
    where: {
      companyId: company.id,
      number: { in: accountNumbers },
    },
    select: {
      number: true,
      type: true,
      entryRole: true,
      vatTreatment: true,
    },
  });

  const vatAccounts = accounts
    .filter(isVatPostingAccount)
    .map((account: { number: string }) => account.number);

  if (vatAccounts.length === 0) {
    return;
  }

  if (company.vatRegistered === false) {
    throw new Error(
      `Ekki er hægt að bóka VSK á reikning ${vatAccounts.join(", ")} vegna þess að fyrirtækið er merkt „Nei, ekki VSK-skráð“. Bókaðu heildarupphæð án innskatts/útskatts.`
    );
  }

  throw new Error(
    `Ekki er hægt að bóka VSK á reikning ${vatAccounts.join(", ")} fyrr en VSK-skráningarstaða fyrirtækisins hefur verið staðfest.`
  );
}

async function analyzeReceiptWithAIInternal(
  receiptId: number,
  options: { skipAccessCheck?: boolean; skipRevalidate?: boolean } = {}
) {
  const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 180 * 1000,
  maxRetries: 0,
});
  if (!options.skipAccessCheck) {
    await requireActiveCompanyWriteAccess();
  }
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      company: {
        include: {
          accounts: {
            where: {
              isActive: true,
            },
            orderBy: {
              number: "asc",
            },
          },
        },
      },
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  // Varðveitum handvirkt staðfest lánsnúmer yfir endurlestur.
  // Þetta gerir GLÖGGT kleift að nota lánsnúmer sem notandi hefur
  // staðfest þegar númerið er ekki læsilegt á frumskjalinu.
  const manualLoanHintDocuments = await prisma.aiDetectedDocument.findMany({
    where: { receiptId },
    select: {
      pageNumber: true,
      entityLinks: {
        where: {
          role: "LOAN",
          source: "USER",
        },
        select: {
          entity: {
            select: {
              id: true,
              name: true,
              identifierValue: true,
            },
          },
        },
      },
    },
  });

  const manualLoanHints = manualLoanHintDocuments
    .flatMap((document) =>
      document.entityLinks.map((link) => ({
        pageNumber: document.pageNumber,
        entityId: link.entity.id,
        name: link.entity.name,
        loanNumber: link.entity.identifierValue?.trim() ?? "",
      }))
    )
    .filter((hint) => hint.loanNumber.length > 0);

  const finalizedDetectedDocument = await prisma.aiDetectedDocument.findFirst({
    where: {
      receiptId,
      OR: [
        { voucherNumber: { not: null } },
        { disposedAt: { not: null } },
      ],
    },
    select: { id: true },
  });

  if (finalizedDetectedDocument) {
    throw new Error(
      "Ekki er hægt að endurlesa fylgiskjal sem hefur þegar verið bókað eða endanlega afgreitt."
    );
  }

  if (receipt.company.accounts.length === 0) {
    throw new Error(
      "Fyrirtækið er ekki með virkan reikningslykil."
    );
  }

  const companyAccountPromptText =
    receipt.company.accounts
      .map(
        (account) =>
          `${account.number} – ${account.name} [${account.type}]`
      )
      .join("\n");

  // Gefum AI aðeins staðfesta lánþekkingu sem GLÖGGT á nú þegar.
  // Þetta gerir nýju fylgiskjali kleift að búa til fulla bókunartillögu
  // í sama lestri, í stað þess að serverinn finni lánatenginguna fyrst eftir
  // að AI hefur þegar skilað tómum bookingEntries.
  const confirmedLoanEntities = await prisma.insightEntity.findMany({
    where: {
      companyId: receipt.companyId,
      entityType: "LOAN",
      identifierType: "LOAN_NUMBER",
      status: "ACTIVE",
      relationshipStatus: "CONFIRMED",
      accountLinks: {
        some: {
          role: "LIABILITY_PRINCIPAL",
          status: "CONFIRMED",
          account: {
            companyId: receipt.companyId,
            isActive: true,
          },
        },
      },
    },
    select: {
      name: true,
      identifierValue: true,
      metadata: true,
      accountLinks: {
        where: {
          role: "LIABILITY_PRINCIPAL",
          status: "CONFIRMED",
        },
        select: {
          account: { select: { number: true, name: true, isActive: true } },
        },
      },
    },
  });

  const confirmedLoanPromptText = confirmedLoanEntities.length
    ? confirmedLoanEntities
        .map((loan) => {
          const account = loan.accountLinks.find((link) => link.account.isActive)?.account;
          if (!loan.identifierValue || !account) return null;
          return `${loan.name} | lán: ${loan.identifierValue} | skuldareikningur: ${account.number} – ${account.name}`;
        })
        .filter((line): line is string => Boolean(line))
        .join("\n")
    : "Engin staðfest lán eru skráð.";

  // Staðfest tryggingarskírteini eru lærdómur bókarans, bundinn við nákvæmt skírteinisnúmer.
  const confirmedInsurancePolicies = await prisma.insightEntity.findMany({
    where: {
      companyId: receipt.companyId, entityType: "INSURANCE_POLICY",
      identifierType: "POLICY_NUMBER", status: "ACTIVE", relationshipStatus: "CONFIRMED",
      accountLinks: { some: { role: "EXPENSE", status: "CONFIRMED", account: { companyId: receipt.companyId, isActive: true } } },
    },
    select: {
      name: true, identifierValue: true, relationshipType: true,
      accountLinks: { where: { role: "EXPENSE", status: "CONFIRMED" }, select: { account: { select: { number: true, name: true, isActive: true } } } },
    },
  });
  const confirmedInsurancePromptText = confirmedInsurancePolicies.length
    ? confirmedInsurancePolicies.map((policy) => {
        const account = policy.accountLinks.find((link) => link.account.isActive)?.account;
        if (!policy.identifierValue || !account) return null;
        return `${policy.name} | skírteini: ${policy.identifierValue} | umhverfi: ${policy.relationshipType ?? "ÓTILGREINT"} | kostnaðarreikningur: ${account.number} – ${account.name}`;
      }).filter((line): line is string => Boolean(line)).join("\n")
    : "Engin staðfest tryggingarskírteini eru skráð.";

  // Innsýn getur þegar hafa lesið hreyfingalista/yfirlit frá tryggingafélagi.
  // Gefum bókunar-AI nýjustu tryggingahreyfingarnar svo sama skírteini þurfi ekki
  // að vera túlkað frá grunni á hverri greiðslukvittun. Þetta er aðeins heimild
  // fyrir tillögu; staðfest skírteinis-/reikningstenging hefur alltaf forgang.
  const insuranceInsightFacts = await prisma.insightFact.findMany({
    where: {
      companyId: receipt.companyId,
      factType: { in: ["INSURANCE_PREMIUM", "INSURANCE_PREMIUM_ADJUSTMENT", "INSURANCE_PREMIUM_REVERSAL"] },
      numberValue: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: { factType: true, label: true, numberValue: true, dateValue: true, periodStart: true, periodEnd: true },
  });

  const insuranceInsightPromptText = insuranceInsightFacts.length
    ? insuranceInsightFacts
        .map((fact) => {
          const amount = fact.numberValue === null ? "" : Number(fact.numberValue).toString();
          const date = fact.dateValue?.toISOString().slice(0, 10) ?? "";
          return `${fact.factType} | ${fact.label ?? "Ómerkt trygging"} | upphæð: ${amount}${date ? ` | dags: ${date}` : ""}`;
        })
        .join("\n")
    : "Engar fyrri tryggingahreyfingar fundust í Innsýn.";

  // Nýttu nýleg YFIRFARIN fylgiskjöl sem staðfest dæmi fyrir næstu AI-greiningu.
  // Yfirfarið skjal er enn óbókað, en notandinn hefur staðfest bókunartillöguna.
  // Þetta gerir t.d. leiðréttingu 2000 -> 1510 og rétta meðferð verðbóta
  // endurnýtanlega áður en eldri fylgiskjöl leyfa endanlega bókun.
  const reviewedBookingExamples = await prisma.aiDetectedDocument.findMany({
    where: {
      receipt: { companyId: receipt.companyId },
      reviewedAt: { not: null },
      disposedAt: null,
      bookingEntries: { some: {} },
    },
    orderBy: { reviewedAt: "desc" },
    take: 12,
    select: {
      merchantName: true,
      documentType: true,
      date: true,
      bookingEntries: {
        select: { account: true, text: true, debit: true, credit: true },
      },
    },
  });

  // AccountingPattern er varanlegt bókaraminni GLÖGGT. Yfirfarin dæmi hér að neðan
  // eru gagnleg sem nýleg samhengi, en mega ekki vera eina leiðin sem staðfest
  // notendaval skilar sér aftur inn í næsta AI-lestur.
  const learnedAccountingPatterns = await prisma.accountingPattern.findMany({
    where: {
      companyId: receipt.companyId,
      patternType: "ACCOUNT_SELECTION",
      status: "ACTIVE",
      targetAccountId: { not: null },
    },
    orderBy: [{ lastConfirmedAt: "desc" }, { confidence: "desc" }],
    take: 40,
    select: {
      decisionRole: true,
      matchKey: true,
      matchData: true,
      confidence: true,
      confirmationCount: true,
      correctionCount: true,
      targetAccount: {
        select: { number: true, name: true, type: true, entryRole: true, isActive: true },
      },
    },
  });

  const learnedAccountingPatternPromptText = learnedAccountingPatterns.length
    ? learnedAccountingPatterns
        .filter((pattern) => pattern.targetAccount?.isActive)
        .map((pattern) => {
          const matchData =
            pattern.matchData && typeof pattern.matchData === "object"
              ? JSON.stringify(pattern.matchData)
              : "{}";
          return `${pattern.decisionRole} | ${pattern.matchKey} | ${pattern.targetAccount!.number} – ${pattern.targetAccount!.name} | traust ${pattern.confidence.toFixed(2)} | staðfest ${pattern.confirmationCount} | leiðrétt ${pattern.correctionCount} | ${matchData}`;
        })
        .join("\n")
    : "Engin varanleg staðfest bókunarmynstur eru skráð.";

  const reviewedBookingPromptText = reviewedBookingExamples.length
    ? reviewedBookingExamples
        .map((example) => {
          const lines = example.bookingEntries
            .map(
              (entry) =>
                `${entry.account} | ${entry.text} | debet ${entry.debit} | kredit ${entry.credit}`
            )
            .join(" ; ");
          return `${example.merchantName ?? "Óþekktur aðili"} | ${example.documentType ?? "Óþekkt skjal"} | ${
            example.date?.toISOString().slice(0, 10) ?? "án dagsetningar"
          } => ${lines}`;
        })
        .join("\n")
    : "Engin yfirfarin bókunardæmi eru til enn.";
  if (!receipt.storagePath && !receipt.filePath) {
    throw new Error("Ekkert stafrænt frumskjal er tengt þessu fylgiskjali.");
  }

  const sourceName = receipt.fileName ?? receipt.storagePath ?? receipt.filePath ?? "fylgiskjal";
  const extension = path.extname(sourceName).toLowerCase();
  const isImage = [".jpg", ".jpeg", ".png", ".webp"].includes(extension);
  const sourceBuffer = await downloadReceiptBuffer(receipt);

  let uploadedFileId: string | null = null;
  let imageDataUrl: string | null = null;

  if (isImage) {
    const mimeType =
      extension === ".png"
        ? "image/png"
        : extension === ".webp"
          ? "image/webp"
          : "image/jpeg";

    imageDataUrl = `data:${mimeType};base64,${sourceBuffer.toString("base64")}`;
  } else {
    const safeBaseName = path.basename(sourceName).replace(/[^a-zA-Z0-9._-]/g, "_");
    const temporaryPath = path.join(
      os.tmpdir(),
      `gloggt-${receipt.id}-${Date.now()}-${safeBaseName}`
    );

    await writeFile(temporaryPath, sourceBuffer);

    try {
      const uploadedFile = await openai.files.create({
        file: createReadStream(temporaryPath),
        purpose: "user_data",
      });
      uploadedFileId = uploadedFile.id;
    } finally {
      await unlink(temporaryPath).catch(() => undefined);
    }
  }

  const response = await openai.responses.create({
    model: "gpt-5.6",
    input: [
      {
        role: "user",
        content: [
          ...(isImage && imageDataUrl
            ? [
                {
                  type: "input_image" as const,
                  image_url: imageDataUrl,
                  detail: "auto" as const,
                },
              ]
            : uploadedFileId
              ? [
                  {
                    type: "input_file" as const,
                    file_id: uploadedFileId,
                  },
                ]
              : []),

          {
            type: "input_text",
            text: `
Lestu þetta íslenska skjal vandlega.

MIKILVÆGT – FLOKKAÐU SKJALIÐ ÁÐUR EN ÞÚ HUGSAR UM BÓKUN:

Fyrir hvert sjálfstætt skjal skaltu ákveða documentType og documentRole.

documentType má aðeins vera eitt af:
- ACCOUNTING_DOCUMENT: reikningur, sölukvittun eða annað sjálfstætt bókhaldsfylgiskjal
- CREDIT_NOTE: kreditreikningur eða fjárhagsleg leiðrétting
- PAYMENT_NOTICE: greiðsluseðill, innheimtutilkynning, afborgunartilkynning eða krafa. Slíkt skjal getur annaðhvort verið bókanlegt sjálft eða tengst öðrum fjárhagsatburði; það ræðst af innihaldi og hlutverki skjalsins
- PAYMENT_CONFIRMATION: kvittun eða staðfesting á greiðslu sem getur verið stuðningsskjal við annað skjal
- STATEMENT: yfirlit, uppgjör eða samantekt sem getur vísað í önnur skjöl/atburði
- OFFER: tilboð sem er ekki sjálft bókunaratburður
- CONTRACT: samningur eða skilmálaskjal
- INFORMATION: upplýsingaskjal án sjálfstæðs bókunaratburðar
- UNKNOWN: ekki hægt að flokka með nægri vissu

documentRole má aðeins vera eitt af:
- BOOKABLE: skjalið sjálft er líklegur sjálfstæður bókunaratburður
- SUPPORTING: skjalið styður eða staðfestir líklega annan atburð/skjal og á ekki að bókast sjálfstætt án tengingar
- INSIGHT_SOURCE: skjalið er fyrst og fremst verðmætt sem grunn-/Innsýn-gagn, ekki sem sjálfstæð bókun
- REVIEW: flokkun eða tengsl eru of óviss og notandi þarf að skoða

Skilaðu einnig classificationConfidence frá 0 til 1.

Mjög mikilvægt:
- Skjal getur verið verðmætt þótt það eigi ekki að bókast.
- Núll í heildarupphæð þýðir EKKI sjálfkrafa að ekkert sé að bóka. Leiðrétting eða skuldajöfnun með raunverulegum debet- og kreditliðum (t.d. +900/-900 eða leiðrétting eldri réttinda) getur verið BOOKABLE þótt nettó sé 0. Varðveittu undirliðina og láttu bókun stemma.
- Þegar frumskjal sýnir aðskilda gjaldaliði/undirliði með eigin heiti og fjárhæð skal varðveita HVERN slíkan lið sem sjálfstæða bookingEntry-línu. Ekki leggja saman eða gleypa einn merkingarlega aðskildan frumskjalslið inn í annan, jafnvel þótt fleiri en einn liður endi á sama bókhaldslykli. Ef tveir liðir fara á sama lykil má endurtaka sama accountNumber á tveimur bookingEntries. Heiti/lýsing bookingEntry skal varðveita merkingu frumskjalsliðsins eins nákvæmlega og hægt er.
- CREDIT_NOTE eða annað leiðréttingarskjal getur verið BOOKABLE þótt það vísi til fyrri tímabila. Bóka skal fjárhagslega leiðréttingu eftir efni skjalsins og forðast að breyta henni í nýjar tekjur/gjöld ef hún er bakfærsla eða leiðrétting fyrri atburðar.
- Ekki búa til bookingEntries fyrir SUPPORTING eða INSIGHT_SOURCE.
- REVIEW á aðeins að stöðva bókun þegar bókhaldslegt eðli/tengsl skjalsins eru sjálf óviss. Ef eina ástæðan fyrir skoðun er að nafn/kennitala móttakanda eða kaupanda passar ekki við bókhaldsumhverfið, en skjalið er annars fullnægjandi sjálfstætt bókhaldsskjal, skal HALDA documentRole = BOOKABLE, búa til venjulegar bookingEntries og setja environmentReviewRequired = true. Þá stöðvar GLÖGGT staðfestingu bókara á umhverfinu án þess að kasta bókunartillögunni.
- environmentReviewRequired skal aðeins vera true þegar sérstök staðfesting þarf á því að halda að skjalið tilheyri þessu bókhaldsumhverfi, t.d. vegna annars nafns/kennitala á reikningi. environmentReviewReason skal þá útskýra hlutlaust hvað þarf að staðfesta. Annars skal environmentReviewRequired = false og environmentReviewReason = null.
- Sama fjárhæð, dagsetning og útgefandi sanna ekki að tvö skjöl séu tvítekin. Sterk auðkenni eins og reikningsnúmer, skráningarnúmer ökutækis, fasteignanúmer, lánsnúmer eða tilvísun skipta meira máli.
- PAYMENT_NOTICE skal EKKI sjálfkrafa vera hvorki BOOKABLE né SUPPORTING. Meta þarf hvaða fjárhagsatburð skjalið sannar og hvort skjalið innihaldi sjálft nægar upplýsingar til bókunar.
- PAYMENT_NOTICE MÁ vera BOOKABLE þegar það er sjálft fullnægjandi bókunarheimild fyrir raunverulegri skuldbindingu eða greiðslu og inniheldur nauðsynlega sundurliðun. Dæmi: afborgunartilkynning láns með skýru lánsnúmeri og sundurliðun í höfuðstól, vexti og kostnað getur verið BOOKABLE, ef ekki þarf annað frumskjal til að ákvarða bókunina.
- Ef PAYMENT_NOTICE vísar fyrst og fremst í aðra álagningu, reikning, uppgjör, fyrri kröfu eða sama fjárhagsatburð og annað frumskjal skal velja SUPPORTING. Ef ekki er hægt að ákvarða þetta með nægri vissu skal velja REVIEW.
- Orðalag eins og „bráðabirgðagreiðsla“, „innheimtukrafa“ eða „krafa send innheimtumanni“ er sterk vísbending um SUPPORTING/REVIEW þegar undirliggjandi álagning eða annar fjárhagsatburður er til staðar. Orðið „greiðsluseðill“ eða „greiðslutilkynning“ eitt og sér ræður þó ekki flokkun.
- Greiðsluseðill, yfirlit eða greiðslustaðfesting getur varðað sama fjárhagsatburð og reikningur/álagning. Þá skal ekki meðhöndla skjalið sjálfkrafa sem nýjan kostnað.
- PAYMENT_CONFIRMATION sem aðeins staðfestir að greiðsla hafi farið fram, en inniheldur ekki sjálfstæða reiknings-/sölusundurliðun sem stofnar nýjan bókunaratburð, skal að jafnaði vera SUPPORTING en ekki REVIEW.
- UNDANTEKNING FYRIR LÁNAHREYFINGU: Greiðslustaðfesting/kvittun af ÞEKKTU láni má vera BOOKABLE þegar skjalið sjálft sýnir lánsnúmer, raunverulega greiðslu og skýra sundurliðun sem breytir skuldinni, t.d. höfuðstól, vexti, verðbætur eða kostnað. Slíkt skjal er fullnægjandi heimild um lánahreyfinguna þótt það stofni ekki nýjan kostnað. Höfuðstóll skal lækka staðfestan skuldareikning lánsins; ekki búa til nýjan kostnað vegna höfuðstóls. Ef sama greiðsla hefur þegar verið bókuð úr öðru skjali skal tengja við sama fjárhagsatburð í stað tvíbókunar.
- Ef þekkt lán og staðfestur skuldareikningur liggja fyrir en mótreikningur greiðslu er óviss, má documentRole vera BOOKABLE með tómum bookingEntries og summary skal segja að aðeins vanti að staðfesta mótreikning; ekki lækka skjalið í SUPPORTING eingöngu vegna þess.
- PAYMENT_CONFIRMATION má aðeins vera BOOKABLE ef skjalið sjálft er jafnframt fullnægjandi frumheimild um sjálfstæð viðskipti, ekki bara staðfesting á greiðslu annars atburðar. Ef slíkt er raunin skaltu íhuga hvort documentType eigi fremur að vera ACCOUNTING_DOCUMENT.
- Fyrir lán skal greina sérstaklega lánveitanda, lánsnúmer, höfuðstól/afborgun, vexti, verðbætur og annan kostnað þegar þessar upplýsingar sjást. Ekki stofna nýjan skuldareikning sjálfkrafa; ef viðeigandi sérstakur skuldareikningur vantar skal halda bókun óstaðfestri og útskýra hvaða lykil þarf að staðfesta eða stofna.
- Fyrir lán skal einnig fylla út loanInfo. loanInfo skal vera null ef skjalið varðar ekki lán. Ef skjalið varðar lán skal skila lenderName, loanNumber, loanNumberSourceLabel, collectionLetterNumber, collectionLetterNumberSourceLabel og principalAmount eftir því sem sést á skjalinu; óþekkt gildi skulu vera null.
- Innheimtubréfsnúmer er EKKI almennt lánsnúmer. Ef frumskjalið sýnir reit merktan „Innheimtubréf númer“ eða ótvírætt sambærilegt heiti skal varðveita það sérstaklega í collectionLetterNumber og nákvæmt heiti reitsins í collectionLetterNumberSourceLabel. Ekki færa það yfir í loanNumber.
- MJÖG MIKILVÆGT UM LÁNSNÚMER: Að jafnaði má loanNumber aðeins vera gildi sem stendur við reit sem er beinlínis merktur „Lán“, „Lánsnúmer“, „Nr. láns“ eða ótvírætt sambærileg merking á frumskjalinu.
- Takmörkuð undantekning: Á skjali sem er ótvírætt afborgunartilkynning eða sambærilegt skjal fyrir EITT lán má reitur sem heitir aðeins „Númer“ teljast lánsnúmer ef samhengi skjalsins gerir skýrt að reiturinn auðkennir sjálft lánið. Þetta á sérstaklega við þegar skjalið sýnir jafnframt lánveitanda og sundurliðun láns í höfuðstól/afborgun og vexti eða annan lánskostnað. Þá skal loanNumberSourceLabel vera nákvæmlega „Númer“ (eða nákvæmt heiti reitsins).
- Þessi undantekning gildir ALDREI um kennitölu, innheimtunúmer, kröfunúmer, innheimtubréfsnúmer, tilvísun, greiðslunúmer, viðskiptanúmer, reikningsnúmer eða önnur auðkenni. Ef fleiri númer koma fram á skjalinu verður samhengi og merking reitanna að aðgreina þau skýrt.
- Skilaðu nákvæmu heiti reitsins sem þú last númerið úr í loanNumberSourceLabel. Dæmi: ef skjalið sýnir „Lán: 417008-02“ skal loanNumber = „417008-02“ og loanNumberSourceLabel = „Lán“. Ef ótvíræð afborgunartilkynning sýnir „Númer: 104907“ sem auðkenni lánsins skal loanNumber = „104907“ og loanNumberSourceLabel = „Númer“.
- Innheimtunúmer, kröfunúmer, tilvísun, greiðslunúmer, viðskiptanúmer, reikningsnúmer eða önnur auðkenni mega ALDREI fara í loanNumber, jafnvel þótt þau séu nálægt upplýsingum um lánið.
- Ef hvorki skýr lánamerking né ofangreint ótvírætt eins-láns samhengi er til staðar skal loanNumber = null og loanNumberSourceLabel = null. Ekki álykta lánsnúmer út frá öðru númeri.
- MIKILVÆGT: Lánsnúmer eitt og sér heimilar EKKI AI að velja skuldareikning fyrir höfuðstól. GLÖGGT staðfestir tengingu lánsnúmers við skuldareikning á server-hlið. Merktu bókunarlínu fyrir höfuðstól láns með entryRole = LOAN_PRINCIPAL. Aðrar línur skulu hafa entryRole = GENERAL.
- Ef skjalið inniheldur höfuðstól láns má AI leggja til bókun, en tillagan verður ekki varðveitt sem bókanleg fyrr en GLÖGGT finnur staðfesta tengingu milli lánseiningarinnar og skuldareikningsins.
- GLÖGGT gefur hér fyrir neðan lista yfir NÚ ÞEGAR STAÐFEST lán og skuldareikninga. Þessi listi er heimild um þekkta tengingu, ekki heimild til að búa til ný lán.
- Ef skjalið sýnir ekki fullt lánsnúmer en sýnir annað skýrt auðkenni sem passar við nákvæmlega eitt staðfest lán samkvæmt sérstakri þekktri reglu, má nota staðfesta skuldareikning þess láns fyrir LOAN_PRINCIPAL-línuna.
- SÉRSTÖK FESTA-REGLA: Fyrir Festa – lífeyrissjóð má reiturinn „Innheimtubréf númer“ vera síðari hluti þegar staðfests Festa-lánsnúmers. Dæmi: innheimtubréf 338379 má tengja við staðfest lán 0142-338379 ef það er nákvæmlega eina staðfesta Festa-lánið sem endar á -338379. Þetta gerir innheimtubréfsnúmerið EKKI að loanNumber í úttakinu; loanNumber skal áfram null nema frumskjalið sjálft sýni lánsnúmer.
- Ef slík staðfest tenging finnst skaltu samt búa til full bookingEntries og nota staðfesta skuldareikninginn á LOAN_PRINCIPAL.

STAÐFEST LÁN SEM GLÖGGT ÞEKKIR:
${confirmedLoanPromptText}

VARANLEG STAÐFEST BÓKUNARMYNSTUR ÚR BÓKARAMINNI GLÖGGT:
${learnedAccountingPatternPromptText}
- Þetta eru staðfestar ákvarðanir bókara úr AccountingPattern, ekki ágiskanir AI.
- Þegar merchant/documentType á núverandi skjali passar við matchKey/matchData skal samsvarandi staðfest reikningsval hafa meira vægi en almennt sjálfgefið reikningsval.
- Ekki yfirfæra mynstur milli ólíkra aðila eða ólíkra skjalategunda nema gögnin styðji það skýrt.
- correctionCount merkir að mynstrið hefur áður verið leiðrétt; ef nýtt skjal stangast á við mynstrið skaltu velja REVIEW frekar en að þvinga mynstrið.

NÝLEG YFIRFARIN BÓKUNARDÆMI Í ÞESSU FYRIRTÆKI:
${reviewedBookingPromptText}
- Yfirfarin dæmi eru staðfest notendaval og mega hafa meira vægi en almenn ágiskun AI þegar sami aðili og sama tegund færslu kemur aftur.
- Ef endurtekið lánaskjal frá sama lánveitanda og sama staðfesta láni hefur áður verið yfirfarið með BANK/CASH mótreikningi, skaltu endurnýta þann mótreikning þegar nýja skjalið lýsir sömu tegund greiðslu. Ekki nota 2000 – Viðskiptaskuldir sem sjálfgefinn mótreikning gegn slíku staðfestu mynstri.
- Verðbætur sem leggjast á eða eru greiddar með láni eru fjármögnunarkostnaður en EKKI afborgun höfuðstóls. Þær mega því ekki fá entryRole = LOAN_PRINCIPAL og mega ekki fara á staðfesta skuldareikning lánsins nema sérstök bókhaldsregla fyrirtækisins segi það. Nýttu staðfest yfirfarin dæmi til að velja viðeigandi verðbótareikning.
- Aðeins eiginleg afborgun nafnverðs/höfuðstóls fær entryRole = LOAN_PRINCIPAL.
- TILBOÐ og samningar sem stofna ekki sjálfir ótvíræða greiðsluskyldu geta verið INSIGHT_SOURCE. Árleg álagning má hins vegar EKKI sjálfkrafa fara í INSIGHT_SOURCE eingöngu vegna þess að hún hefur marga gjalddaga.
- ÁRLAGNING MEÐ GREIÐSLUÁÆTLUN: Ef skjalið sjálft er opinber álagning, gjaldaseðill eða sambærilegt frumskjal sem stofnar ótvíræða heildarskuldbindingu fyrir tiltekið tímabil og sýnir heildarupphæð, skal það almennt vera BOOKABLE þó greiðslan sé dreifð á marga gjalddaga. Greiðsluáætlunin breytir ekki einni álagningu í mörg ný kostnaðarskjöl.
- Fyrir slíka álagningu skal bóka heildarskuldbindinguna EINU SINNI: debetfæra viðeigandi kostnaðarreikning eða kostnaðarreikninga samkvæmt eðli gjaldanna og kreditfæra viðeigandi viðskiptaskuldar-/skammtímaskuldareikning sem er virkur í reikningslyklinum. Ekki giska á BANK/CASH nema skjalið sýni að greiðsla hafi þegar farið fram.
- SUNDURLIÐUN ÁLAGNINGAR ER FRUMGAGN: Ef álagning sýnir fleiri en einn sérstaklega merktan gjaldalið með eigin fjárhæð skal hver slíkur liður skila sér sem sjálfstæð debet-bookingEntry. Ekki sameina tvo ólíka frumskjalsliði í eina línu, jafnvel þótt báðir séu bókaðir á sama accountNumber; endurtaktu þá sama reikningslykil með aðskildum texta og fjárhæð. Þetta tryggir að heiti og fjárhæð hvers gjaldaliðar tapist ekki. Summary skal jafnframt telja upp sömu gjaldaliði og fjárhæðir nákvæmlega eftir frumskjalinu.
- Gjalddagar og afborganir á álagningu eru GREIÐSLUÁÆTLUN, ekki sjálfstæð ný kostnaðarálagning. Varðveittu fjölda gjalddaga, dagsetningar og fjárhæðir eins nákvæmlega og skjalið sýnir í summary. Ekki búa til eina bókunarlínu fyrir hvern framtíðargjalddaga á grunnskjalinu.
- Fyrir álagningu með greiðsluáætlun skal paymentSchedule einnig fyllt með nákvæmum gjalddögum og upphæðum sem sjást á skjalinu. Ekki búa til gjalddaga sem ekki sjást. totalAmount í paymentSchedule skal vera heildarskuldbindingin, ekki upphæð eins gjalddaga.
- Þegar síðar kemur greiðsluseðill eða greiðslustaðfesting sem skýrt vísar í áður stofnaða álagningu skal EKKI bóka kostnaðinn aftur. Ef skjalið er fullnægjandi heimild um raunverulega greiðslu skal debetfæra skuldareikning álagningarinnar og kreditfæra staðfestan BANK/CASH reikning; annars skal tengja skjalið sem SUPPORTING við sama fjárhagsatburð þegar matching-lag leyfir.
- Ef skjalið er aðeins greiðsluáætlun eða upplýsingayfirlit og stofnar EKKI sjálft greiðsluskyldu skal það áfram vera INSIGHT_SOURCE/SUPPORTING eftir samhengi. Aðgreindu alltaf "álagningu sem stofnar skuld" frá "áætlun sem aðeins lýsir framtíðargreiðslum".

MIKILVÆG REGLA UM TRYGGINGAR:
- Fyrir tryggingaskjöl skal fylla út insurancePolicies með EINNI færslu fyrir HVERT skýrt merkt skírteini á skjalinu. Ef aðeins eitt skírteini er á skjalinu má insuranceInfo einnig innihalda það til samhæfni; annars skal insuranceInfo vera null.
- Hvert insurancePolicies stak inniheldur insurerName, policyNumber, policyNumberSourceLabel, insuranceType, insuredItem og amount. Ekki giska á skírteinisnúmer; það þarf að koma úr skýrt merktum skírteinisreit. amount er aðeins upphæð sem núverandi skjal tengir nákvæmlega við þetta skírteini; annars null.
- Á fjölskírteinaskjali SKAL skila öllum skírteinum, ekki sameina þau í eitt insuranceInfo.
- Tryggingafélag eitt og sér segir EKKI hvort trygging tilheyri fyrirtækjarekstri, heimilisrekstri eða öðru umhverfi. Ekki alhæfa allar tryggingar sama félags.
- Ef nákvæmt skírteinisnúmer passar við staðfest skírteini hér fyrir neðan SKAL nota staðfest umhverfi og kostnaðarreikning þess. Ekki biðja aftur um staðfestingu nema upplýsingar á skjalinu stangist á við staðfesta tengingu.
- Ef skírteini er nýtt/óstaðfest og meðferð ræðst af umhverfi þess, veldu REVIEW og kallaðu eftir staðfestingu.
- Heimilisrekstur er gilt bókhaldsumhverfi þegar bókhaldið er fyrir einstakling/heimili; ekki flokka slíkt sjálfkrafa sem utan umhverfis.
- SÉRSTÖK BÓKUNARREGLA FYRIR STAÐFEST TRYGGINGARSKÍRTEINI: Greiðslukvittun/greiðslustaðfesting fyrir nákvæmt STAÐFEST skírteini er BOOKABLE þegar skjalið sjálft sýnir raunverulega greitt iðgjald/kostnað, greiðsludag eða skýra dagsetningu, heildarupphæð og skírteinisnúmer. Þá er greiðslan sjálfstæður fjárhagsatburður í þessu bókhaldsumhverfi og má EKKI flokka hana sem SUPPORTING eingöngu vegna þess að undirliggjandi tryggingarsamningur eða yfirlit er til.
- Fyrir slíka bókun skal debetfæra staðfesta kostnaðarreikning skírteinisins með bókanlegum tryggingarkostnaði og kreditfæra viðeigandi BANK/CASH greiðslureikning þegar hann er örugglega þekktur úr reikningslyklum eða staðfestum mynstrum. Bókunarlínur verða að stemma við heildargreiðsluna.
- FJÖLSKÍRTEINA TRYGGINGAGREIÐSLUR: Ef ein greiðslukvittun inniheldur mörg skírteini skal nota fyrri tryggingahreyfingar úr Innsýn hér fyrir neðan til að þekkja nákvæm skírteinisnúmer og tryggingategundir. Passa skal á skírteinisnúmeri; aldrei tengja aðeins út frá sömu upphæð eða nafni tryggingafélags.
- Þegar núverandi kvittun sýnir upphæð fyrir hvert skírteini má leggja til eina debetlínu fyrir hvert skírteini/tryggingaflokk. Veldu virkan reikningslykil sem merkingarlega passar við tryggingategundina, t.d. bifreiðatryggingar á bifreiðatryggingalykil, líf-/persónutryggingar á líf- og persónutryggingalykil og heimilis-/bruna-/húseigandatryggingar á heimilis- og fasteignatryggingalykil. Þetta er tillaga, ekki varanleg staðfesting skírteinis.
- Ef fyrri Innsýn-gögn nægja ekki til öruggrar tengingar skírteinis við tryggingategund/reikningsflokk skal merkja skjalið REVIEW í stað þess að giska.
- Fyrri hreyfingalisti getur útskýrt skírteini og tryggingategund, en greiðslukvittunin sjálf ræður hvaða upphæð er bókuð núna. Ekki bóka eldri ársiðgjaldsupphæð úr hreyfingalista sem núverandi greiðslu.
- Ef greiðslureikningur/mótreikningur er ekki örugglega þekktur skal EKKI giska á hann: veldu REVIEW/BOOKABLE eftir því sem við á, hafðu bookingEntries tómt og segðu skýrt í summary að staðfesta þurfi greiðslureikning.
- Tryggingayfirlit, samningur eða annað grunnskjal sem aðeins lýsir tryggingarvernd/skilmálum án sjálfstæðrar greiðslu getur áfram verið INSIGHT_SOURCE/SUPPORTING. Þessi regla breytir því ekki.

STAÐFEST TRYGGINGARSKÍRTEINI SEM GLÖGGT ÞEKKIR:
${confirmedInsurancePromptText}

FYRRI TRYGGINGAHREYFINGAR ÚR INNSÝN (hreyfingalistar/yfirlit; notaðu aðeins nákvæm skírteinisnúmer sem tengilykil):
${insuranceInsightPromptText}

MIKILVÆG REGLA UM LÍFEYRIS- OG GREIÐSLUSEÐLA EINSTAKLINGS:
- Lífeyrisseðill, örorkulífeyrisseðill eða sambærilegt mánaðarlegt tekjuyfirlit er EKKI sjálfkrafa persónulegt upplýsingaskjal sem á aðeins í Innsýn.
- Þegar fyrirtækið/bókhaldsumhverfið er einstaklingur og móttakandi greiðslunnar er sami einstaklingur, skal slíkt skjal með raunverulegum tekjum tímabilsins almennt vera BOOKABLE tekjuskjal. Þetta á sérstaklega við þegar skjalið sýnir brúttó lífeyristekjur, staðgreiðslu/skatt og nettó útborgun.
- Bókun skal byggjast á BRÚTTÓ tekjunum, ekki aðeins nettó útborguninni. Leitaðu að viðeigandi tekjureikningi fyrir lífeyris-/aðrar tekjur, viðeigandi eigna-/skattareikningi fyrir staðgreiðslu og BANK-reikningi fyrir nettó útborgun þegar skjalið styður að hún hafi verið greidd.
- Dæmi um jafnvægi: debet staðgreiðsla + debet banki = kredit brúttó lífeyristekjur. Ekki finna upp reikningslykla; ef nauðsynlegur tekju-, staðgreiðslu- eða bankareikningur vantar skal bookingEntries vera tómt og summary segja nákvæmlega hvaða reikningstegund vantar.
- Sú staðreynd að tekjurnar séu persónulegar eða undanþegnar VSK gerir þær EKKI að INSIGHT_SOURCE þegar þær tilheyra bókhaldi sama einstaklings. Ekki hafna slíkum tekjum með rökum um að þær séu ekki rekstrartekjur; þær geta verið bókanlegar sem aðrar tekjur/lífeyristekjur í bókhaldi einstaklingsins.
- Ef bókhaldsumhverfið er lögaðili eða móttakandi tekjunnar er annar aðili en sá sem bókhaldið tilheyrir, má ekki bóka persónulegar lífeyristekjur inn í rekstur lögaðilans; veldu þá REVIEW eða INSIGHT_SOURCE eftir samhengi.
- Ef mánaðarlegt lífeyris-/tekjuskjal gefur skýrt tekjutímabil á forminu YYYY-MM en enga nákvæma dagsetningu skal nota 1. dag þess tímabils sem bókunardagsetningu. Dæmi: tímabil 2026-02 → date = 2026-02-01. Þetta er stöðluð GLÖGGT-regla fyrir mánaðarbundin tekjuskjöl, ekki ágiskun á raunverulegan greiðsludag.

- Ef skjalið inniheldur sundurliðun, magn, km, kWh, einingarverð, eignarauðkenni, lánsnúmer, tryggingavernd eða tímabil skal varðveita það í summary eins nákvæmlega og skynsamlegt er, jafnvel þótt það sé ekki nauðsynlegt fyrir bókun.

Fyrirtækið sem bókar fylgiskjalið er:
Nafn: ${receipt.company.name}
VSK-númer: ${receipt.company.vatNumber ?? "Ekki skráð"}
VSK-skráningarstaða: ${receipt.company.vatRegistered === true ? "Já, VSK-skráð" : receipt.company.vatRegistered === false ? "Nei, ekki VSK-skráð" : "Ekki staðfest"}
RSK-skráð starfsemi: ${receipt.company.rskRegisteredActivities ?? "Ekki skráð"}
Virk starfsemi: ${receipt.company.activeActivities ?? "Ekki staðfest"}

Mikilvægt um fyrirtækið:
RSK-skráð starfsemi segir hvað fyrirtækið er skráð fyrir,
en ekki endilega hvaða starfsemi er raunverulega virk.

Við bókun skal fyrst og fremst miða við "Virk starfsemi".

Ekki nota RSK-skráða starfsemi sem sjálfstæð rök
fyrir frádrætti eða VSK-meðferð ef starfsemin er ekki
staðfest sem virk.

Teldu hversu mörg sjálfstæð bókhaldsfylgiskjöl eru á myndinni.

Fyrir hvert sjálfstætt fylgiskjal skal einnig skila pageNumber.

pageNumber er númer þeirrar PDF-síðu eða myndasíðu þar sem aðalskjal fylgiskjalsins er staðsett.

Ef fylgiskjal nær yfir fleiri en eina síðu skal nota síðuna þar sem aðalsölukvittun/reikningur er.

Ef ekki er hægt að ákvarða síðuna með vissu skal skila null.

Eitt bókhaldsfylgiskjal getur samanstaðið af fleiri en
einu blaði eða kvittun.

Ef kassakvittun, kortakvittun, greiðslukvittun eða annað
skjal er heft eða fest við handskrifaða kvittun, reikning
eða annað undirskjal og skjölin augljóslega tilheyra sömu
viðskiptum, skal telja þau saman sem EITT fylgiskjal.

Ekki telja hvert blað sjálfkrafa sem sérstakt fylgiskjal.

Mjög mikilvægt um greiðslukvittanir:

Kortakvittun, POS-kvittun eða önnur greiðslustaðfesting
er EKKI sjálfstætt bókhaldsfylgiskjal þegar hún einungis
staðfestir greiðslu á kassakvittun, sölukvittun eða reikningi
sem fylgir með.

Ef sölukvittun/reikningur og kortakvittun sýna sömu upphæð
má aðeins telja þau EITT bókhaldsfylgiskjal þegar önnur gögn
styðja einnig skýrt að um sömu greiðslu sé að ræða.

Sama upphæð ein og sér er EKKI næg sönnun.

Berðu sérstaklega saman:
- dagsetningu viðskiptanna,
- nafn söluaðila eða greiðsluaðila,
- kortanúmer/endatölur ef þær sjást,
- reiknings-, pöntunar- eða færslunúmer,
- og hvort skjölin séu greinilega fest saman sem ein færsla.

Ef dagsetningar eru verulega mismunandi eða skjölin sýna
ólíka söluaðila og ekkert annað tengir þau ótvírætt saman,
skal telja þau sem TVÖ sjálfstæð bókhaldsfylgiskjöl,
jafnvel þótt upphæðin sé sú sama.

Kortakvittun skal aðeins vera stuðningsskjal þegar skýrt er
að hún staðfesti greiðslu á aðalskjalinu.

documentCount verður að vera sami fjöldi og fjöldi staka
í documents fylkinu.

Aðskilin skjöl sem tilheyra mismunandi viðskiptum skulu
teljast sem sitt hvort fylgiskjalið.

documentCount skal vera fjöldi sjálfstæðra
bókhaldsfylgiskjala, ekki fjöldi blaða eða pappírsbúta.

Finndu aðeins það sem raunverulega sést á skjalinu.
Ekki giska á óskýrar tölur eða númer.

Mikilvægar reglur um dagsetningar:

- Finndu dagsetningu fyrst og fremst í prentuðum reit sem er
  greinilega merktur sem dagsetning, t.d. "Dags.", "Dagsetning",
  "Date" eða sambærilegt.

- Í íslenskum skjölum skal túlka dagsetningar sem
  DAGUR.MÁNUÐUR.ÁR, ekki MÁNUÐUR.DAGUR.ÁR.

- Ef prentuð dagsetning er t.d. 15.03.26 skal skila
  2026-03-15.

- Tveggja stafa ártal 00-49 skal túlka sem 2000-2049,
  nema skjalið gefi skýrt annað til kynna.

- Handskrifaðar tölur, fylgiskjalsnúmer, reikningslyklar,
  bókhaldsmerkingar og upphæðir mega ALDREI vera túlkaðar
  sem dagsetning nema þær séu ótvírætt merktar sem dagsetning.

- Ef dagsetning er ólæsileg eða óviss skal skila null
  frekar en að giska.

Leggðu einnig til fulla bókun þegar reikningslykill
fyrirtækisins inniheldur viðeigandi reikninga.

Samtala debetlína og kreditlína verður alltaf að vera jöfn.

REIKNINGSLYKILL FYRIRTÆKISINS:

${companyAccountPromptText}

Reglur um reikningslykla:

1. Í bookingEntries skal account ALLTAF vera nákvæmlega
   eitt reikningsnúmer úr listanum hér að ofan.

2. Ekki finna upp reikningsnúmer.

3. Ekki nota annan reikning sem neyðarlausn bara vegna þess
   að nákvæmur reikningur vantar.

4. Ef enginn núverandi reikningslykill passar nægilega vel:
   - ekki velja óskyldan almennan lykil bara til að klára bókun,
   - ekki finna upp reikningsnúmer,
   - skila frekar tillögu um að stofna nýjan reikningslykil,
   - merkja slíka tillögu sérstaklega þannig að notandi þurfi að staðfesta hana áður en bókun er samþykkt.

5. Notaðu type innan hornklofa til að skilja bókhaldslega
   merkingu reikningsins.

6. Ef fylgiskjalið er sölureikningur skal almennt leita að:
   - ACCOUNTS_RECEIVABLE fyrir viðskiptakröfu,
   - REVENUE fyrir sölu/tekjur,
   - VAT_OUTPUT fyrir útskatt þegar VSK á við.

7. Ef fylgiskjalið er innkaupareikningur eða kostnaður skal
   velja viðeigandi kostnaðarreikning og greiðslu-/skuldareikning.

8. VAT_INPUT má aðeins nota þegar innskattsfrádráttur er
   heimill.

9. BANK skal aðeins nota þegar skjalið sýnir eða gögnin
   styðja að viðskiptin hafi þegar verið greidd af banka.

10. Ef enginn reikningur í reikningslykli fyrirtækisins
   passar bókhaldslega við færsluna:
   - ekki finna upp lykil,
   - skilaðu bookingEntries sem tómu fylki fyrir það skjal,
   - útskýrðu í summary hvaða reikningstegund vantar.

Mikilvæg VSK-regla:

- Ef VSK-skráningarstaða fyrirtækisins er "Nei, ekki VSK-skráð" má ALDREI nota VAT_INPUT eða VAT_OUTPUT. Bóka skal heildarupphæð án innskattsfrádráttar og án útskattsfærslu.
- Ef VSK-skráningarstaða er "Ekki staðfest" má ekki gera sjálfvirka VSK-færslu. Ekki nota VAT_INPUT eða VAT_OUTPUT fyrr en staðan hefur verið staðfest.
- Ef fyrirtækið er "Já, VSK-skráð" má VSK-meðferð aðeins beita þegar önnur gögn og reglur styðja hana. VSK-skráning ein og sér sannar ekki innskattsrétt einstakra útgjalda.

- MIKILVÆGT: Ef fyrirtækið er merkt "Nei, ekki VSK-skráð" er skortur á innskattsrétti EKKI ástæða til að flokka annars fullnægjandi bókunarskjal sem REVIEW. Ef skjalið er að öðru leyti fullnægjandi bókunarheimild skal það vera BOOKABLE og leggja skal til bókun heildarupphæðarinnar án VAT_INPUT eða VAT_OUTPUT.

- Ef fyrirtækið er ekki VSK-skráð skal ekki krefjast sérstakrar staðfestingar á VSK-meðferð áður en bókunartillaga er búin til. Heildarupphæð kostnaðar skal fara á viðeigandi kostnaðar-, eigna- eða skuldareikning eftir eðli færslunnar.

Ekki færa virðisaukaskatt af fæðiskaupum, veitingum,
kaffistofu eða mötuneyti sem innskatt nema fyrir liggi
skýr heimild til þess, svo sem þegar fæðið er endurselt.

Ef fylgiskjalið er fyrir mat eða veitingar og virk starfsemi
fyrirtækisins gefur ekki skýrt tilefni til
innskattsfrádráttar, skal bóka alla heildarupphæðina sem
kostnað án innskattsfrádráttar.

Ekki nota VAT_INPUT eingöngu vegna þess að VSK sé sýndur
á kvittuninni.

Ef kvittana-, reiknings- eða vörusölunúmer sést ekki,
skilaðu null.

Ef eitthvað er óljóst skal confidence vera lægra.

MIKILVÆG DAGSETNINGARREGLA:

Lesið dagsetningu nákvæmlega af fylgiskjalinu.
Ekki giska á, leiðrétta eða breyta ári.
Ef ártal er 2026 á fylgiskjali má aldrei skila 2025.
Skila skal dagsetningu á forminu YYYY-MM-DD.
Ef dagsetning eða ártal er ólæsilegt eða óvíst skal skila date sem null.
            `,
          },
        ],
      },
    ],

    text: {
      format: {
        type: "json_schema",
        name: "receipt_analysis",
        strict: true,

        schema: {
          type: "object",

          properties: {
            documentCount: {
              type: "number",
            },

            documents: {
              type: "array",

              items: {
                type: "object",

                properties: {
                  merchantName: {
                    type: ["string", "null"],
                  },

                  date: {
  type: ["string", "null"],
  description:
    "Dagsetning nákvæmlega eins og hún kemur fram á fylgiskjalinu. Skilaðu sem YYYY-MM-DD. Ekki giska á eða breyta ári. Ef árið er ólæsilegt eða óvíst skal skila null.",
},

                  receiptNumber: {
                    type: ["string", "null"],
                  },

                  totalAmount: {
                    type: ["number", "null"],
                  },

                  pageNumber: {
  type: ["number", "null"],
},

                  summary: {
                    type: "string",
                  },

                  documentType: {
                    type: "string",
                    enum: [
                      "ACCOUNTING_DOCUMENT",
                      "CREDIT_NOTE",
                      "PAYMENT_NOTICE",
                      "PAYMENT_CONFIRMATION",
                      "STATEMENT",
                      "OFFER",
                      "CONTRACT",
                      "INFORMATION",
                      "UNKNOWN",
                    ],
                  },

                  documentRole: {
                    type: "string",
                    enum: ["BOOKABLE", "SUPPORTING", "INSIGHT_SOURCE", "REVIEW"],
                  },

                  classificationConfidence: {
                    type: "number",
                  },

                  environmentReviewRequired: {
                    type: "boolean",
                  },

                  environmentReviewReason: {
                    type: ["string", "null"],
                  },

                  loanInfo: {
                    type: ["object", "null"],
                    properties: {
                      lenderName: {
                        type: ["string", "null"],
                      },
                      loanNumber: {
                        type: ["string", "null"],
                      },
                      loanNumberSourceLabel: {
                        type: ["string", "null"],
                      },
                      collectionLetterNumber: {
                        type: ["string", "null"],
                      },
                      collectionLetterNumberSourceLabel: {
                        type: ["string", "null"],
                      },
                      principalAmount: {
                        type: ["number", "null"],
                      },
                    },
                    required: [
                      "lenderName",
                      "loanNumber",
                      "loanNumberSourceLabel",
                      "collectionLetterNumber",
                      "collectionLetterNumberSourceLabel",
                      "principalAmount",
                    ],
                    additionalProperties: false,
                  },

                  insuranceInfo: {
                    type: ["object", "null"],
                    properties: {
                      insurerName: { type: ["string", "null"] },
                      policyNumber: { type: ["string", "null"] },
                      policyNumberSourceLabel: { type: ["string", "null"] },
                      insuranceType: { type: ["string", "null"] },
                    },
                    required: ["insurerName", "policyNumber", "policyNumberSourceLabel", "insuranceType"],
                    additionalProperties: false,
                  },

                  insurancePolicies: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        insurerName: { type: ["string", "null"] },
                        policyNumber: { type: "string" },
                        policyNumberSourceLabel: { type: ["string", "null"] },
                        insuranceType: { type: ["string", "null"] },
                        insuredItem: { type: ["string", "null"] },
                        amount: { type: ["number", "null"] },
                      },
                      required: ["insurerName", "policyNumber", "policyNumberSourceLabel", "insuranceType", "insuredItem", "amount"],
                      additionalProperties: false,
                    },
                  },

                  paymentSchedule: {
                    type: ["object", "null"],
                    properties: {
                      scheduleType: {
                        type: "string",
                        enum: ["ANNUAL_ASSESSMENT", "INSTALLMENT_PLAN", "OTHER"],
                      },
                      totalAmount: { type: ["number", "null"] },
                      currency: { type: ["string", "null"] },
                      confidence: { type: "number" },
                      installments: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            sequence: { type: "number" },
                            dueDate: { type: "string" },
                            amount: { type: "number" },
                            externalReference: { type: ["string", "null"] },
                          },
                          required: ["sequence", "dueDate", "amount", "externalReference"],
                          additionalProperties: false,
                        },
                      },
                    },
                    required: ["scheduleType", "totalAmount", "currency", "confidence", "installments"],
                    additionalProperties: false,
                  },

                  bookingEntries: {
                    type: "array",

                    items: {
                      type: "object",

                      properties: {
                        account: {
                          type: "string",
                        },

                        text: {
                          type: "string",
                        },

                        debit: {
                          type: "number",
                        },

                        credit: {
                          type: "number",
                        },

                        entryRole: {
                          type: "string",
                          enum: ["GENERAL", "LOAN_PRINCIPAL"],
                        },
                      },

                      required: [
                        "account",
                        "text",
                        "debit",
                        "credit",
                        "entryRole",
                      ],

                      additionalProperties: false,
                    },
                  },
                },

                required: [
                  "merchantName",
                  "date",
                  "receiptNumber",
                  "totalAmount",
                  "summary",
                  "documentType",
                  "documentRole",
                  "classificationConfidence",
                  "environmentReviewRequired",
                  "environmentReviewReason",
                  "loanInfo",
                  "insuranceInfo",
                  "insurancePolicies",
                  "paymentSchedule",
                  "bookingEntries",
                  "pageNumber",
                ],

                additionalProperties: false,
              },
            },

            merchantName: {
              type: ["string", "null"],
            },

            date: {
              type: ["string", "null"],
              description:
                "Dagsetning á forminu YYYY-MM-DD",
            },

            receiptNumber: {
              type: ["string", "null"],
            },

            totalAmount: {
              type: ["number", "null"],
            },

            confidence: {
              type: "number",
            },

            summary: {
              type: "string",
            },

            suggestedDebitAccount: {
              type: ["string", "null"],
            },

            suggestedCreditAccount: {
              type: ["string", "null"],
            },

            suggestedBookingText: {
              type: ["string", "null"],
            },

            bookingEntries: {
              type: "array",

              items: {
                type: "object",

                properties: {
                  account: {
                    type: "string",
                  },

                  text: {
                    type: "string",
                  },

                  debit: {
                    type: "number",
                  },

                  credit: {
                    type: "number",
                  },
                },

                required: [
                  "account",
                  "text",
                  "debit",
                  "credit",
                ],

                additionalProperties: false,
              },
            },
          },

          required: [
            "documentCount",
            "documents",
            "merchantName",
            "date",
            "receiptNumber",
            "totalAmount",
            "confidence",
            "summary",
            "suggestedDebitAccount",
            "suggestedCreditAccount",
            "suggestedBookingText",
            "bookingEntries",
          ],

          additionalProperties: false,
        },
      },
    },
  });
const inputTokens = response.usage?.input_tokens ?? 0;
const cachedInputTokens =
  response.usage?.input_tokens_details?.cached_tokens ?? 0;
const outputTokens = response.usage?.output_tokens ?? 0;
const totalTokens = response.usage?.total_tokens ?? 0;
  const result = JSON.parse(
    response.output_text
  );
  const actualDocumentCount = Array.isArray(result.documents)
  ? result.documents.length
  : 0;

const reportedDocumentCount = Number(result.documentCount ?? 0);

const documentCountMismatch =
  reportedDocumentCount !== actualDocumentCount;

  if (documentCountMismatch) {
  console.warn(
    `⚠️ Fjöldi fylgiskjala stemmir ekki. AI sagði ${reportedDocumentCount}, en documents inniheldur ${actualDocumentCount}.`
  );
}
  const uncachedInputTokens = Math.max(
  inputTokens - cachedInputTokens,
  0
);



const costUsd =
  (uncachedInputTokens / 1_000_000) * 5 +
  (cachedInputTokens / 1_000_000) * 0.5 +
  (outputTokens / 1_000_000) * 30;

const usdIskRate = 122.94;
const costIsk = costUsd * usdIskRate;

await prisma.aiUsage.create({
  data: {
    companyId: receipt.companyId,
    receiptId,
    action: "RECEIPT_ANALYSIS",
    model: "gpt-5.6",
    inputTokens,
    cachedInputTokens,
    outputTokens,
    totalTokens,
    costUsd,
    costIsk,
    usdIskRate,
  },
});

const createdDocumentIds: number[] = [];

  await prisma.$transaction(async (tx) => {
    await tx.receipt.update({
      where: {
        id: receiptId,
      },

      data: {
        merchantName: result.merchantName,
        receiptNumber: result.receiptNumber,
        ocrConfidence: result.confidence,
        ocrText: result.summary,
        ocrStatus: "Lesið með AI",

        aiDate: result.date
          ? new Date(result.date)
          : null,

        aiAmount:
          result.totalAmount ?? null,

        documentCount:
  actualDocumentCount,

        suggestedDebitAccount:
          result.suggestedDebitAccount,

        suggestedCreditAccount:
          result.suggestedCreditAccount,

        suggestedBookingText:
          result.suggestedBookingText,

      },
    });

    await tx.aiBookingEntry.deleteMany({
      where: {
        receiptId,
      },
    });

    if (
  (!Array.isArray(result.documents) || result.documents.length === 0) &&
  Array.isArray(result.bookingEntries) &&
  result.bookingEntries.length > 0
) {
      await tx.aiBookingEntry.createMany({
        data: result.bookingEntries
          .filter(
            (entry: {
              debit: number;
              credit: number;
            }) => entry.debit !== 0 || entry.credit !== 0
          )
          .map(
          (entry: {
            account: string;
            text: string;
            debit: number;
            credit: number;
          }) => ({
            account: entry.account,
            text: entry.text,
            debit: entry.debit,
            credit: entry.credit,
            receiptId,
          })
        ),
      });
    }

    // Varðveitum staðfesta umhverfisákvörðun við endurlestur sama frumskjals.
    // AI má endurmeta bókunina, en notandinn á ekki að þurfa að staðfesta
    // sama nafn-/kennitalafrávik aftur ef skjalið auðkennist ótvírætt.
    const priorEnvironmentConfirmations = await tx.aiDetectedDocument.findMany({
      where: {
        receiptId,
        environmentConfirmedAt: { not: null },
      },
      select: {
        merchantName: true,
        date: true,
        receiptNumber: true,
        totalAmount: true,
        environmentConfirmedAt: true,
        environmentConfirmedById: true,
        environmentConfirmationReason: true,
      },
    });

    await tx.aiDetectedDocument.deleteMany({
      where: {
        receiptId,
      },
    });

    if (
      Array.isArray(result.documents) &&
      result.documents.length > 0
    ) {

const dateWarnings: string[] = [];

      const loanPrincipalDocumentCount = result.documents.filter(
        (candidate: { bookingEntries?: Array<{ entryRole?: string }> }) =>
          Array.isArray(candidate.bookingEntries) &&
          candidate.bookingEntries.some(
            (entry) => entry.entryRole === "LOAN_PRINCIPAL"
          )
      ).length;

      for (const document of result.documents) {
        // Mánaðarleg lífeyris-/tekjuskjöl sýna oft aðeins tímabil (YYYY-MM).
        // Ef enginn nákvæmur dagur er á skjalinu notar GLÖGGT 1. dag
        // tímabilsins sem stöðluð bókunardagsetningu.
        if (!document.date && document.documentRole === "BOOKABLE") {
          const pensionDateEvidence = [
            document.merchantName,
            document.summary,
            result.merchantName,
            result.summary,
          ]
            .filter(Boolean)
            .join(" ")
            .toLocaleLowerCase("is-IS");

          const isMonthlyPensionIncome =
            pensionDateEvidence.includes("lífeyr") &&
            (pensionDateEvidence.includes("tímabil") ||
              pensionDateEvidence.includes("örorkulífeyr"));

          const periodMatch = pensionDateEvidence.match(
            /(?:tímabil(?:ið|sins)?\s*)?(20\d{2})[-/.](0[1-9]|1[0-2])(?!\d)/
          );

          if (isMonthlyPensionIncome && periodMatch) {
            const [, year, month] = periodMatch;
            document.date = `${year}-${month}-01`;
          }
        }

        const parsedDocumentDate = document.date
  ? new Date(document.date)
  : null;

const today = new Date();
today.setHours(23, 59, 59, 999);

const fourMonthsAgo = new Date();
fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 4);

const isFutureDate =
  parsedDocumentDate !== null &&
  parsedDocumentDate > today;

const isOldDate =
  parsedDocumentDate !== null &&
  parsedDocumentDate < fourMonthsAgo;

  if (isFutureDate) {
  dateWarnings.push(
    `Dagsetning ${document.date} er í framtíðinni.`
  );
}

if (isOldDate) {
  dateWarnings.push(
    receipt.company.vatRegistered === false
      ? `Dagsetning ${document.date} er eldri en 4 mánuðir.`
      : `Dagsetning ${document.date} er eldri en 4 mánuðir. Athuga VSK-tímabil.`
  );
}

  const hasInvalidDate =
  parsedDocumentDate !== null &&
  Number.isNaN(parsedDocumentDate.getTime());

if (hasInvalidDate) {
  throw new Error(
    `Ógild dagsetning kom frá AI: ${document.date}`
  );
}

        const normalizedMerchantName = String(document.merchantName ?? "")
          .trim()
          .toLocaleLowerCase("is-IS");
        const priorEnvironmentConfirmation =
          document.environmentReviewRequired === true
            ? priorEnvironmentConfirmations.find((prior) => {
                const sameReceiptNumber =
                  Boolean(document.receiptNumber) &&
                  Boolean(prior.receiptNumber) &&
                  String(prior.receiptNumber).trim() ===
                    String(document.receiptNumber).trim();

                if (sameReceiptNumber) return true;

                const priorMerchantName = String(prior.merchantName ?? "")
                  .trim()
                  .toLocaleLowerCase("is-IS");
                const sameMerchant =
                  Boolean(normalizedMerchantName) &&
                  normalizedMerchantName === priorMerchantName;
                const sameAmount =
                  Number(prior.totalAmount ?? Number.NaN) ===
                  Number(document.totalAmount ?? Number.NaN);
                const sameDate =
                  Boolean(parsedDocumentDate) &&
                  Boolean(prior.date) &&
                  parsedDocumentDate!.getTime() === prior.date!.getTime();

                return sameMerchant && sameAmount && sameDate;
              })
            : null;

        const createdDocument =
          await tx.aiDetectedDocument.create({
            data: {
              merchantName:
                document.merchantName,

              date: parsedDocumentDate,

              receiptNumber:
                document.receiptNumber,

              totalAmount:
                document.totalAmount,

                pageNumber:
  document.pageNumber,

              summary:
                document.summary,

              documentType:
                document.documentType,

              documentRole:
                document.documentRole,

              classificationConfidence:
                document.classificationConfidence,

              classificationSource: "AI",

              environmentReviewRequired:
                document.environmentReviewRequired === true,

              environmentReviewReason:
                document.environmentReviewRequired === true &&
                typeof document.environmentReviewReason === "string" &&
                document.environmentReviewReason.trim()
                  ? document.environmentReviewReason.trim()
                  : null,

              environmentConfirmedAt:
                priorEnvironmentConfirmation?.environmentConfirmedAt ?? null,
              environmentConfirmedById:
                priorEnvironmentConfirmation?.environmentConfirmedById ?? null,
              environmentConfirmationReason:
                priorEnvironmentConfirmation?.environmentConfirmationReason ?? null,

              paymentSchedule:
                document.paymentSchedule && typeof document.paymentSchedule === "object"
                  ? document.paymentSchedule
                  : undefined,

              classifiedAt: new Date(),

              receiptId,
            },
          });

          createdDocumentIds.push(createdDocument.id);

        const rawInsurancePolicies = Array.isArray(document.insurancePolicies)
          ? document.insurancePolicies
          : [];
        const legacyInsuranceInfo = document.insuranceInfo && typeof document.insuranceInfo === "object"
          ? document.insuranceInfo
          : null;
        // Varnarregla fyrir eldri/einstaka AI-svör: stundum skilar líkanið mörgum
        // skírteinisnúmerum saman í legacy insuranceInfo.policyNumber þrátt fyrir array-regluna.
        // Við megum ALDREI búa til eitt skírteini úr kommuaðgreindum lista. Kljúfum þá
        // nákvæm, töluleg skírteinisnúmer í sjálfstæðar einingar og sækjum lýsingu/upphæð
        // úr samantekt skjalsins þegar hún er ótvíræð.
        const expandLegacyInsuranceInfo = (info: any) => {
          const raw = typeof info?.policyNumber === "string" ? info.policyNumber : "";
          const numbers: string[] = Array.from(new Set<string>(raw.match(/\b\d{6,10}\b/g) ?? []));
          if (numbers.length <= 1) return info ? [info] : [];

          const summary = typeof document.summary === "string" ? document.summary : "";
          return numbers.map((policyNumber, index) => {
            const start = summary.indexOf(policyNumber);
            const nextNumber = numbers[index + 1] ?? null;
            const next = nextNumber && start >= 0 ? summary.indexOf(nextNumber, start + policyNumber.length) : -1;
            const segment = start >= 0
              ? summary.slice(start + policyNumber.length, next > start ? next : Math.min(summary.length, start + 260))
              : "";
            const amountMatches: RegExpMatchArray[] = Array.from(segment.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)\s*kr\.?/gi));
            const amountText = amountMatches.length ? amountMatches[amountMatches.length - 1][1] : null;
            const amount = amountText ? Number(amountText.replace(/\./g, "")) : null;
            const cleanSegment = segment.replace(/^[\s,:;–-]+/, "").trim();
            const insuranceType = cleanSegment
              ? cleanSegment.split(/,\s*(?=[A-ZÁÉÍÓÚÝÞÆÖ0-9])/)[0].trim().slice(0, 140)
              : null;
            return {
              insurerName: info?.insurerName ?? null,
              policyNumber,
              policyNumberSourceLabel: "Skírteini",
              insuranceType: insuranceType || info?.insuranceType || null,
              insuredItem: cleanSegment || null,
              amount: typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : null,
            };
          });
        };

        const aiInsurancePolicies = rawInsurancePolicies.length > 0
          ? rawInsurancePolicies.flatMap((info: any) => expandLegacyInsuranceInfo(info))
          : expandLegacyInsuranceInfo(legacyInsuranceInfo);

        // Harðari normalisering fyrir fjölskírteina greiðslukvittanir.
        // Líkanið getur þrátt fyrir schema skilað öllum skírteinum í einu staki.
        // Þegar samantekt tryggingaskjals inniheldur mörg 7 stafa skírteinisnúmer
        // er samantektin sjálf öruggari uppspretta fyrir EINSTÖK auðkenni. Við notum
        // hana til að tryggja að ekkert kommuaðgreint/sameinað policy entity verði til.
        const insuranceSummary = typeof document.summary === "string" ? document.summary : "";
        const summaryPolicyNumbers: string[] = Array.from(new Set<string>(
          insuranceSummary.match(/\b\d{7}\b/g) ?? []
        ));
        const looksLikeInsuranceDocument = /trygging|skírteini|skirteini/i.test(insuranceSummary);

        const buildPoliciesFromSummary = (numbers: string[]) => numbers.map((policyNumber, index) => {
          const start = insuranceSummary.indexOf(policyNumber);
          const nextNumber = numbers[index + 1] ?? null;
          const next = nextNumber && start >= 0
            ? insuranceSummary.indexOf(nextNumber, start + policyNumber.length)
            : -1;
          const segment = start >= 0
            ? insuranceSummary.slice(
                start + policyNumber.length,
                next > start ? next : Math.min(insuranceSummary.length, start + 320)
              )
            : "";
          const cleanSegment = segment
            .replace(/^[\s,:;–-]+/, "")
            .replace(/\s+/g, " ")
            .trim();
          const amountMatches: RegExpMatchArray[] = Array.from(
            cleanSegment.matchAll(/([0-9]{1,3}(?:\.[0-9]{3})*|[0-9]+)\s*kr\.?/gi)
          );
          const amountText = amountMatches.length ? amountMatches[0][1] : null;
          const amount = amountText ? Number(amountText.replace(/\./g, "")) : null;
          const typeText = cleanSegment
            .split(/,\s*(?=(?:[A-ZÁÉÍÓÚÝÞÆÖ]|\d{7}))/)[0]
            .trim()
            .slice(0, 180);

          const matchingAi = aiInsurancePolicies.find((item: any) => {
            const raw = typeof item?.policyNumber === "string" ? item.policyNumber : "";
            return raw === policyNumber;
          });

          return {
            insurerName: matchingAi?.insurerName ?? legacyInsuranceInfo?.insurerName ?? null,
            policyNumber,
            policyNumberSourceLabel: "Skírteini",
            insuranceType: matchingAi?.insuranceType ?? (typeText || null),
            insuredItem: matchingAi?.insuredItem ?? (cleanSegment || null),
            amount: typeof matchingAi?.amount === "number" && matchingAi.amount > 0
              ? matchingAi.amount
              : (typeof amount === "number" && Number.isFinite(amount) && amount > 0 ? amount : null),
          };
        });

        const insurancePolicies = looksLikeInsuranceDocument && summaryPolicyNumbers.length > 1
          ? buildPoliciesFromSummary(summaryPolicyNumbers)
          : aiInsurancePolicies.filter((info: any) => {
              const raw = typeof info?.policyNumber === "string" ? info.policyNumber.trim() : "";
              return /^\d{6,10}$/.test(raw);
            });

        const confirmedInsuranceEntries: Array<{ account: string; policyNumber: string; amount: number }> = [];
        let insurancePoliciesNeedConfirmation = 0;

        for (const insuranceInfo of insurancePolicies) {
          const policyNumber = typeof insuranceInfo?.policyNumber === "string" ? insuranceInfo.policyNumber.trim() : "";
          const policyLabel = typeof insuranceInfo?.policyNumberSourceLabel === "string"
            ? insuranceInfo.policyNumberSourceLabel.toLocaleLowerCase("is-IS").replace(/[.:]/g, "").replace(/\s+/g, " ").trim() : "";
          const hasExplicitPolicyLabel = policyLabel.includes("skírteini") || policyLabel.includes("skirteini");
          if (!policyNumber || !hasExplicitPolicyLabel) continue;

          const insurerName = typeof insuranceInfo?.insurerName === "string" ? insuranceInfo.insurerName.trim() : "";
          const insuranceType = typeof insuranceInfo?.insuranceType === "string" ? insuranceInfo.insuranceType.trim() : "";
          const insuredItem = typeof insuranceInfo?.insuredItem === "string" ? insuranceInfo.insuredItem.trim() : "";
          const amount = typeof insuranceInfo?.amount === "number" && Number.isFinite(insuranceInfo.amount) && insuranceInfo.amount > 0
            ? insuranceInfo.amount : null;

          let policyEntity = await tx.insightEntity.findFirst({
            where: { companyId: receipt.companyId, entityType: "INSURANCE_POLICY", identifierType: "POLICY_NUMBER", identifierValue: policyNumber, status: "ACTIVE" },
            include: { accountLinks: { where: { role: "EXPENSE", status: "CONFIRMED" }, include: { account: true } } },
          });
          if (!policyEntity) {
            policyEntity = await tx.insightEntity.create({
              data: {
                companyId: receipt.companyId, entityType: "INSURANCE_POLICY",
                name: insuranceType ? `${insuranceType} – skírteini ${policyNumber}` : `Trygging – skírteini ${policyNumber}`,
                identifierType: "POLICY_NUMBER", identifierValue: policyNumber, relationshipStatus: "UNCONFIRMED",
                metadata: { insurerName: insurerName || null, insuranceType: insuranceType || null, insuredItem: insuredItem || null, lastSeenAmount: amount, firstSeenReceiptId: receiptId, source: "AI" },
              },
              include: { accountLinks: { where: { role: "EXPENSE", status: "CONFIRMED" }, include: { account: true } } },
            });
          } else {
            const oldMetadata = policyEntity.metadata && typeof policyEntity.metadata === "object" && !Array.isArray(policyEntity.metadata) ? policyEntity.metadata : {};
            policyEntity = await tx.insightEntity.update({
              where: { id: policyEntity.id },
              data: {
                name: insuranceType ? `${insuranceType} – skírteini ${policyNumber}` : policyEntity.name,
                metadata: { ...oldMetadata, insurerName: insurerName || null, insuranceType: insuranceType || null, insuredItem: insuredItem || null, lastSeenAmount: amount, lastSeenReceiptId: receiptId },
              },
              include: { accountLinks: { where: { role: "EXPENSE", status: "CONFIRMED" }, include: { account: true } } },
            });
          }
          await tx.documentEntityLink.upsert({
            where: { documentId_entityId_role: { documentId: createdDocument.id, entityId: policyEntity.id, role: "INSURANCE_POLICY" } },
            update: { confidence: document.classificationConfidence ?? null, source: "AI" },
            create: { receiptId, documentId: createdDocument.id, entityId: policyEntity.id, role: "INSURANCE_POLICY", confidence: document.classificationConfidence ?? null, source: "AI" },
          });

          const confirmedExpense = policyEntity.accountLinks.find((link) => link.account.companyId === receipt.companyId && link.account.isActive);
          if (!confirmedExpense || policyEntity.relationshipStatus !== "CONFIRMED") {
            insurancePoliciesNeedConfirmation += 1;
          } else if (amount !== null) {
            confirmedInsuranceEntries.push({ account: confirmedExpense.account.number, policyNumber, amount });
          }
        }

        if (insurancePoliciesNeedConfirmation > 0) {
          await tx.aiDetectedDocument.update({
            where: { id: createdDocument.id },
            data: {
              documentRole: "REVIEW",
              summary: `${document.summary}\n\nGLÖGGT: ${insurancePoliciesNeedConfirmation} af ${insurancePolicies.length} tryggingarskírteinum þurfa staðfest umhverfi og kostnaðarreikning. Staðfestu aðeins þau skírteini sem vantar; hvert skírteini varðveitir sína eigin tengingu.`,
            },
          });
        }

        const loanInfo =
          document.loanInfo &&
          typeof document.loanInfo === "object"
            ? document.loanInfo
            : null;

        const rawAiLoanNumber =
          typeof loanInfo?.loanNumber === "string"
            ? loanInfo.loanNumber.trim()
            : "";

        const rawLoanNumberSourceLabel =
          typeof loanInfo?.loanNumberSourceLabel === "string"
            ? loanInfo.loanNumberSourceLabel.trim()
            : "";

        const normalizedLoanNumberSourceLabel = rawLoanNumberSourceLabel
          .toLocaleLowerCase("is-IS")
          .replace(/[.:]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        const hasExplicitLoanNumberLabel =
          normalizedLoanNumberSourceLabel === "lán" ||
          normalizedLoanNumberSourceLabel === "lánsnúmer" ||
          normalizedLoanNumberSourceLabel === "lánsnr" ||
          normalizedLoanNumberSourceLabel === "lán nr" ||
          normalizedLoanNumberSourceLabel === "lán númer" ||
          normalizedLoanNumberSourceLabel === "nr láns" ||
          normalizedLoanNumberSourceLabel === "númer láns";

        const lenderName =
          typeof loanInfo?.lenderName === "string"
            ? loanInfo.lenderName.trim()
            : "";

        const principalAmount =
          typeof loanInfo?.principalAmount === "number" &&
          Number.isFinite(loanInfo.principalAmount)
            ? loanInfo.principalAmount
            : null;

        // Sumir lánveitendur merkja aðalauðkenni láns á afborgunartilkynningu
        // aðeins sem „Númer“. Það er samþykkt eingöngu þegar AI hefur jafnframt
        // greint lánveitanda og jákvæða höfuðstóls-/afborgunarfjárhæð.
        // Almenn kröfu-, innheimtu- og tilvísunarnúmer fá því ekki þessa leið.
        const hasContextualGenericLoanNumberLabel =
          normalizedLoanNumberSourceLabel === "númer" &&
          lenderName.length > 0 &&
          principalAmount !== null &&
          principalAmount > 0;

        const aiLoanNumber =
          rawAiLoanNumber &&
          (hasExplicitLoanNumberLabel || hasContextualGenericLoanNumberLabel)
            ? rawAiLoanNumber
            : "";

        const collectionLetterNumber =
          typeof loanInfo?.collectionLetterNumber === "string"
            ? loanInfo.collectionLetterNumber.trim()
            : "";

        const collectionLetterNumberSourceLabel =
          typeof loanInfo?.collectionLetterNumberSourceLabel === "string"
            ? loanInfo.collectionLetterNumberSourceLabel.trim()
            : "";

        const normalizedCollectionLetterLabel = collectionLetterNumberSourceLabel
          .toLocaleLowerCase("is-IS")
          .replace(/[.:]/g, "")
          .replace(/\s+/g, " ")
          .trim();

        const hasExplicitCollectionLetterLabel =
          normalizedCollectionLetterLabel === "innheimtubréf númer" ||
          normalizedCollectionLetterLabel === "innheimtubréfsnúmer" ||
          normalizedCollectionLetterLabel === "innheimtubréf nr";

        const hasLoanPrincipalEntry =
          Array.isArray(document.bookingEntries) &&
          document.bookingEntries.some(
            (entry: { entryRole?: string }) =>
              entry.entryRole === "LOAN_PRINCIPAL"
          );

        const hasLoanPrincipalAmount =
          principalAmount !== null && principalAmount > 0;

        // AI getur réttilega sleppt bookingEntries þegar lánsnúmer eða
        // skuldareikningur er óstaðfestur. Við megum því ekki nota
        // LOAN_PRINCIPAL-línu sem eina vísbendingu um að þetta sé lán.
        // Sundurliðaður höfuðstóll í loanInfo nægir líka til að virkja
        // handvirka staðfestingarferlið fyrir lánsnúmer + skuldareikning.
        // Ekki treysta eingöngu á document.loanInfo eða bookingEntries hér.
        // AI getur skilað þeim tómum þegar það veit að lánatengingin er óstaðfest.
        // Global summary og document summary eru hins vegar varðveitt textagögn úr
        // sömu greiningu og gefa okkur öruggt merki um að kalla eigi eftir
        // handvirkri lánatengingu, án þess að giska á sjálft lánsnúmerið.
        const loanEvidenceText = [
          typeof result.summary === "string" ? result.summary : "",
          typeof document.summary === "string" ? document.summary : "",
        ]
          .join("\n")
          .toLocaleLowerCase("is-IS");

        const hasLoanPrincipalTextEvidence =
          loanEvidenceText.includes("höfuðstól") ||
          loanEvidenceText.includes("afborgun");

        const hasLoanContextTextEvidence =
          loanEvidenceText.includes("skuldabréf") ||
          loanEvidenceText.includes("lán");

        const hasLoanPrincipalEvidence =
          hasLoanPrincipalEntry ||
          hasLoanPrincipalAmount ||
          (hasLoanContextTextEvidence && hasLoanPrincipalTextEvidence);

        const matchingManualHints = manualLoanHints.filter(
          (hint) =>
            document.pageNumber !== null &&
            document.pageNumber !== undefined &&
            hint.pageNumber === document.pageNumber
        );

        const manualLoanHint =
          !aiLoanNumber && matchingManualHints.length === 1
            ? matchingManualHints[0]
            : !aiLoanNumber &&
                matchingManualHints.length === 0 &&
                manualLoanHints.length === 1 &&
                loanPrincipalDocumentCount === 1
              ? manualLoanHints[0]
              : null;

        // Festa birtir sérstakt lánsnúmer á sínum síðum (t.d. 0142-338379),
        // en Landsbankaskjalið getur aðeins sýnt síðari hlutann sem
        // „Innheimtubréf númer“ (t.d. 338379). Þetta er EKKI almenn regla um
        // innheimtubréfsnúmer. Við notum það aðeins sem alias til að finna
        // NÚ ÞEGAR staðfest Festa-lán, og aðeins ef nákvæmlega eitt lán passar.
        let knownFestaLoanNumber = "";
        const normalizedLenderName = lenderName.toLocaleLowerCase("is-IS");
        if (
          !aiLoanNumber &&
          normalizedLenderName.includes("festa") &&
          collectionLetterNumber &&
          hasExplicitCollectionLetterLabel
        ) {
          const festaLoanCandidates = await tx.insightEntity.findMany({
            where: {
              companyId: receipt.companyId,
              entityType: "LOAN",
              identifierType: "LOAN_NUMBER",
              status: "ACTIVE",
              relationshipStatus: "CONFIRMED",
              identifierValue: {
                endsWith: `-${collectionLetterNumber}`,
              },
              accountLinks: {
                some: {
                  role: "LIABILITY_PRINCIPAL",
                  status: "CONFIRMED",
                  account: {
                    companyId: receipt.companyId,
                    isActive: true,
                  },
                },
              },
            },
            select: { identifierValue: true },
          });

          if (festaLoanCandidates.length === 1) {
            knownFestaLoanNumber =
              festaLoanCandidates[0].identifierValue?.trim() ?? "";
          }
        }

        const loanNumber =
          aiLoanNumber || knownFestaLoanNumber || manualLoanHint?.loanNumber || "";
        const loanLinkSource = manualLoanHint && !knownFestaLoanNumber ? "USER" : "AI";

        let confirmedLoanPrincipalAccountNumber: string | null = null;

        if (loanNumber) {
          let loanEntity = await tx.insightEntity.findFirst({
            where: {
              companyId: receipt.companyId,
              entityType: "LOAN",
              identifierType: "LOAN_NUMBER",
              identifierValue: loanNumber,
              status: "ACTIVE",
            },
            include: {
              accountLinks: {
                where: {
                  role: "LIABILITY_PRINCIPAL",
                  status: "CONFIRMED",
                },
                include: {
                  account: true,
                },
              },
            },
          });

          if (!loanEntity) {
            loanEntity = await tx.insightEntity.create({
              data: {
                companyId: receipt.companyId,
                entityType: "LOAN",
                name: lenderName
                  ? `${lenderName} – lán ${loanNumber}`
                  : `Lán ${loanNumber}`,
                identifierType: "LOAN_NUMBER",
                identifierValue: loanNumber,
                relationshipStatus: "UNCONFIRMED",
                metadata: {
                  lenderName: lenderName || null,
                  firstSeenReceiptId: receiptId,
                  source: "AI",
                },
              },
              include: {
                accountLinks: {
                  where: {
                    role: "LIABILITY_PRINCIPAL",
                    status: "CONFIRMED",
                  },
                  include: {
                    account: true,
                  },
                },
              },
            });
          }

          await tx.documentEntityLink.upsert({
            where: {
              documentId_entityId_role: {
                documentId: createdDocument.id,
                entityId: loanEntity.id,
                role: "LOAN",
              },
            },
            update: {
              confidence: manualLoanHint
                ? 1
                : document.classificationConfidence ?? null,
              source: loanLinkSource,
            },
            create: {
              receiptId,
              documentId: createdDocument.id,
              entityId: loanEntity.id,
              role: "LOAN",
              confidence: manualLoanHint
                ? 1
                : document.classificationConfidence ?? null,
              source: loanLinkSource,
            },
          });

          const confirmedLink = loanEntity.accountLinks.find(
            (link) =>
              link.account.companyId === receipt.companyId &&
              link.account.isActive
          );

          confirmedLoanPrincipalAccountNumber =
            confirmedLink?.account.number ?? null;
        }

        const loanMappingMissing =
          hasLoanPrincipalEvidence &&
          (!loanNumber || !confirmedLoanPrincipalAccountNumber);

        if (loanMappingMissing) {
          const mappingReason = !loanNumber
            ? "Lánshöfuðstóll fannst en lánsnúmer vantar eða er óvíst."
            : `Lán ${loanNumber} hefur ekki staðfesta tengingu við skuldareikning.`;

          await tx.aiDetectedDocument.update({
            where: { id: createdDocument.id },
            data: {
              documentRole: "REVIEW",
              summary:
                `${document.summary}\n\nGLÖGGT: ${mappingReason} ` +
                "Staðfestu skuldareikning lánsins áður en bókun er heimiluð.",
            },
          });

          continue;
        }

        // Ef öll skírteini eru staðfest og AI skilaði engum línum má byggja öruggar
        // debetlínur beint úr upphæðum núverandi greiðslukvittunar. Við giskum aldrei
        // á mótreikning; kredit kemur aðeins frá AI/staðfestu bókunarmynstri.
        if (
          insurancePolicies.length > 0 &&
          insurancePoliciesNeedConfirmation === 0 &&
          Array.isArray(document.bookingEntries) &&
          document.bookingEntries.length === 0 &&
          confirmedInsuranceEntries.length === insurancePolicies.length
        ) {
          await tx.aiDetectedDocumentEntry.createMany({
            data: confirmedInsuranceEntries.map((entry) => ({
              account: entry.account,
              text: `Trygging – skírteini ${entry.policyNumber}`,
              debit: entry.amount,
              credit: 0,
              documentId: createdDocument.id,
            })),
          });
        }

        if (
          document.documentRole === "BOOKABLE" &&
          Array.isArray(document.bookingEntries) &&
          document.bookingEntries.length > 0
        ) {
          const safeBookingEntries = document.bookingEntries
            .filter(
              (entry: {
                debit: number;
                credit: number;
              }) => entry.debit !== 0 || entry.credit !== 0
            )
            .map(
              (entry: {
                account: string;
                text: string;
                debit: number;
                credit: number;
                entryRole?: string;
              }) => ({
                account:
                  entry.entryRole === "LOAN_PRINCIPAL" &&
                  confirmedLoanPrincipalAccountNumber
                    ? confirmedLoanPrincipalAccountNumber
                    : entry.account,
                text: entry.text,
                debit: entry.debit,
                credit: entry.credit,
                documentId: createdDocument.id,
              })
            );

          if (safeBookingEntries.length > 0) {
            await tx.aiDetectedDocumentEntry.createMany({
              data: safeBookingEntries,
            });
          }
        }
      }

if (dateWarnings.length > 0) {
  await tx.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "NEEDS_ATTENTION",
      ocrStatus: dateWarnings.join(" "),
    },
  });
}

    } else {
  await tx.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "NEEDS_ATTENTION",
      ocrStatus: "Engin læsileg fylgiskjöl fundust",
    },
  });
}
  });

  
  if (!options.skipRevalidate) {
    revalidatePath(`/fylgiskjol/${receiptId}`);
    revalidatePath("/fylgiskjol");
  }

  return { createdDocumentIds };
}

export async function analyzeReceiptWithAI(receiptId: number) {
  return analyzeReceiptWithAIInternal(receiptId);
}

export async function analyzeReceiptWithAIForMaintenance(receiptId: number) {
  if (process.env.GLOGGT_ALLOW_MAINTENANCE_REANALYZE !== "1") {
    throw new Error(
      "Maintenance-endurlestur er óvirkur. Settu GLOGGT_ALLOW_MAINTENANCE_REANALYZE=1 aðeins fyrir þessa terminal-keyrslu."
    );
  }

  return analyzeReceiptWithAIInternal(receiptId, {
    skipAccessCheck: true,
    skipRevalidate: true,
  });
}

export async function confirmMissingLoanDetails(
  documentId: number,
  loanNumber: string,
  accountNumber: string
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: {
      receipt: true,
    },
  });

  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) throw new Error("Innskráning er nauðsynleg.");

  if (document.approvedAt || document.voucherNumber != null) {
    throw new Error("Ekki er hægt að breyta lánatengingu eftir bókun.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Ekki er hægt að breyta lánatengingu á afgreiddu skjali.");
  }

  const cleanLoanNumber = loanNumber.trim();
  if (!cleanLoanNumber) {
    throw new Error("Skrá þarf lánsnúmer.");
  }

  const cleanAccountNumber = accountNumber.trim();
  if (!cleanAccountNumber) {
    throw new Error("Velja þarf skuldareikning.");
  }

  const account = await prisma.account.findFirst({
    where: {
      companyId: document.receipt.companyId,
      number: cleanAccountNumber,
      isActive: true,
      type: {
        in: ["SHORT_TERM_LIABILITY", "LONG_TERM_LIABILITY"],
      },
    },
  });

  if (!account) {
    throw new Error(
      "Velja þarf virkan skuldareikning (skammtíma- eða langtímaskuld) hjá fyrirtækinu."
    );
  }

  const lenderName =
    document.merchantName?.trim() ||
    document.receipt.merchantName?.trim() ||
    "Ótilgreindur lánveitandi";

  const confirmedAt = new Date();

  await prisma.$transaction(async (tx) => {
    let loanEntity = await tx.insightEntity.findFirst({
      where: {
        companyId: document.receipt.companyId,
        entityType: "LOAN",
        identifierType: "LOAN_NUMBER",
        identifierValue: cleanLoanNumber,
        status: "ACTIVE",
      },
    });

    if (!loanEntity) {
      loanEntity = await tx.insightEntity.create({
        data: {
          companyId: document.receipt.companyId,
          entityType: "LOAN",
          name: `${lenderName} – lán ${cleanLoanNumber}`,
          identifierType: "LOAN_NUMBER",
          identifierValue: cleanLoanNumber,
          relationshipStatus: "CONFIRMED",
          metadata: {
            lenderName,
            firstSeenReceiptId: document.receiptId,
            source: "USER",
          },
        },
      });
    }

    await tx.documentEntityLink.upsert({
      where: {
        documentId_entityId_role: {
          documentId: document.id,
          entityId: loanEntity.id,
          role: "LOAN",
        },
      },
      update: {
        confidence: 1,
        source: "USER",
      },
      create: {
        receiptId: document.receiptId,
        documentId: document.id,
        entityId: loanEntity.id,
        role: "LOAN",
        confidence: 1,
        source: "USER",
      },
    });

    const existingLinks = await tx.insightEntityAccountLink.findMany({
      where: {
        entityId: loanEntity.id,
        role: "LIABILITY_PRINCIPAL",
      },
      include: { account: true },
    });

    const previousConfirmed = existingLinks.find(
      (link) => link.status === "CONFIRMED"
    );

    await tx.insightEntityAccountLink.updateMany({
      where: {
        entityId: loanEntity.id,
        role: "LIABILITY_PRINCIPAL",
        status: "CONFIRMED",
      },
      data: { status: "REJECTED" },
    });

    await tx.insightEntityAccountLink.upsert({
      where: {
        entityId_accountId_role: {
          entityId: loanEntity.id,
          accountId: account.id,
          role: "LIABILITY_PRINCIPAL",
        },
      },
      update: {
        status: "CONFIRMED",
        source: "USER",
        confidence: 1,
        confirmedAt,
        confirmedBy: user.id,
        note: "Lánsnúmer og skuldareikningur staðfest af notanda.",
      },
      create: {
        entityId: loanEntity.id,
        accountId: account.id,
        role: "LIABILITY_PRINCIPAL",
        status: "CONFIRMED",
        source: "USER",
        confidence: 1,
        confirmedAt,
        confirmedBy: user.id,
        note: "Lánsnúmer og skuldareikningur staðfest af notanda.",
      },
    });

    await tx.insightEntity.update({
      where: { id: loanEntity.id },
      data: {
        relationshipStatus: "CONFIRMED",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "InsightEntity",
        entityId: loanEntity.id,
        action: "CONFIRM_LOAN_DETAILS",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: `Lán ${cleanLoanNumber} og skuldareikningur ${account.number} staðfest af notanda.`,
        beforeData: previousConfirmed
          ? {
              accountId: previousConfirmed.accountId,
              accountNumber: previousConfirmed.account.number,
              role: previousConfirmed.role,
              status: previousConfirmed.status,
            }
          : undefined,
        afterData: {
          loanNumber: cleanLoanNumber,
          accountId: account.id,
          accountNumber: account.number,
          role: "LIABILITY_PRINCIPAL",
          status: "CONFIRMED",
          confirmedAt: confirmedAt.toISOString(),
          confirmedBy: user.id,
        },
        metadata: {
          receiptId: document.receiptId,
          detectedDocumentId: document.id,
          lenderName,
        },
      },
    });
  });

  // Endurlesum strax. analyzeReceiptWithAI tekur nú handvirkt staðfesta
  // lánsnúmerið með sér yfir endurlesturinn og notar staðfesta skuldareikninginn.
  const analysisResult = await analyzeReceiptWithAI(document.receiptId);

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");

  return analysisResult;
}


export async function rejectIncorrectLoanEntityLink(
  documentId: number,
  entityId: number
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: {
      receipt: true,
      entityLinks: {
        where: { entityId, role: "LOAN" },
        include: { entity: true },
      },
    },
  });

  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) throw new Error("Innskráning er nauðsynleg.");

  if (document.approvedAt || document.voucherNumber != null) {
    throw new Error("Ekki er hægt að aftengja lán eftir bókun.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Ekki er hægt að aftengja lán á afgreiddu skjali.");
  }

  const entityLink = document.entityLinks[0];
  if (!entityLink || entityLink.entity.entityType !== "LOAN") {
    throw new Error("Lánatenging fannst ekki á þessu fylgiskjali.");
  }

  if (entityLink.entity.companyId !== document.receipt.companyId) {
    throw new Error("Lánið tilheyrir ekki sama fyrirtæki og fylgiskjalið.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "InsightEntity",
        entityId,
        action: "REJECT_DOCUMENT_LOAN_LINK",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: `Röng lánatenging ${entityLink.entity.identifierValue ?? entityLink.entity.name} aftengd af notanda.`,
        beforeData: {
          receiptId: document.receiptId,
          detectedDocumentId: document.id,
          insightEntityId: entityId,
          identifierType: entityLink.entity.identifierType,
          identifierValue: entityLink.entity.identifierValue,
          linkSource: entityLink.source,
        },
        afterData: {
          linkedToDocument: false,
        },
        metadata: {
          reason: "INCORRECT_LOAN_IDENTIFIER",
        },
      },
    });

    await tx.documentEntityLink.delete({
      where: {
        documentId_entityId_role: {
          documentId: document.id,
          entityId,
          role: "LOAN",
        },
      },
    });
  });

  // Endurlesum eftir að röng tenging hefur verið fjarlægð. Gamla AI-tengingin
  // verður því ekki tekin með sem handvirk vísbending og nýja stranga
  // lánsnúmerareglan fær hreina prófun á frumskjalinu.
  const analysisResult = await analyzeReceiptWithAI(document.receiptId);

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");

  return analysisResult;
}

export async function confirmInsurancePolicyProfile(documentId: number, entityId: number, environment: string, accountNumber: string) {
  if (!["BUSINESS", "HOME", "OTHER"].includes(environment)) throw new Error("Velja þarf gilt umhverfi tryggingarinnar.");
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: { receipt: true, entityLinks: { where: { entityId, role: "INSURANCE_POLICY" }, include: { entity: true } } },
  });
  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");
  await requireCompanyBookAccess(document.receipt.companyId);
  const user = await getEffectiveUser();
  if (!user) throw new Error("Innskráning er nauðsynleg.");
  if (document.approvedAt || document.voucherNumber != null || document.disposedAt) throw new Error("Ekki er hægt að breyta tryggingarsniði á endanlega afgreiddu skjali.");
  const entityLink = document.entityLinks[0];
  if (!entityLink || entityLink.entity.entityType !== "INSURANCE_POLICY") throw new Error("Tryggingarskírteini fannst ekki á fylgiskjalinu.");
  const account = await prisma.account.findFirst({ where: { companyId: document.receipt.companyId, number: accountNumber.trim(), isActive: true, entryRole: "EXPENSE" } });
  if (!account) throw new Error("Velja þarf virkan kostnaðarreikning.");
  const confirmedAt = new Date();
  await prisma.$transaction(async (tx) => {
    await tx.insightEntityAccountLink.updateMany({ where: { entityId, role: "EXPENSE", status: "CONFIRMED" }, data: { status: "REJECTED" } });
    await tx.insightEntityAccountLink.upsert({
      where: { entityId_accountId_role: { entityId, accountId: account.id, role: "EXPENSE" } },
      update: { status: "CONFIRMED", source: "USER", confidence: 1, confirmedAt, confirmedBy: user.id, note: "Kostnaðarreikningur tryggingarskírteinis staðfestur af notanda." },
      create: { entityId, accountId: account.id, role: "EXPENSE", status: "CONFIRMED", source: "USER", confidence: 1, confirmedAt, confirmedBy: user.id, note: "Kostnaðarreikningur tryggingarskírteinis staðfestur af notanda." },
    });
    await tx.insightEntity.update({ where: { id: entityId }, data: { relationshipStatus: "CONFIRMED", relationshipType: environment, relationshipConfirmedAt: confirmedAt, relationshipConfirmedBy: user.id } });
    await tx.documentEntityLink.update({ where: { documentId_entityId_role: { documentId, entityId, role: "INSURANCE_POLICY" } }, data: { source: "USER", confidence: 1, confirmedAt, confirmedBy: user.id } });
    await tx.auditEvent.create({ data: {
      companyId: document.receipt.companyId, userId: user.id, entityType: "InsightEntity", entityId, action: "CONFIRM_INSURANCE_POLICY_PROFILE",
      parentEntityType: "AiDetectedDocument", parentEntityId: document.id, source: "USER",
      description: `Tryggingarskírteini ${entityLink.entity.identifierValue ?? entityId} staðfest sem ${environment} á ${account.number}.`,
      afterData: { environment, accountNumber: account.number, accountId: account.id }, metadata: { receiptId: document.receiptId, detectedDocumentId: document.id },
    } });
  });
  // Ekki endurkeyra AI eftir hvert skírteini. Fjölskírteinaskjöl geta haft mörg
  // ólík skírteini og notandinn á að geta staðfest þau öll áður en ein endurlestur fer fram.
  revalidatePath(`/fylgiskjol/${document.receiptId}`); revalidatePath("/fylgiskjol");
  return { createdDocumentIds: [document.id] };
}

export async function createAndConfirmInsurancePolicyProfile(
  documentId: number,
  entityId: number,
  environment: string,
  accountNumber: string,
  accountName: string
) {
  if (!["BUSINESS", "HOME", "OTHER"].includes(environment)) {
    throw new Error("Velja þarf gilt umhverfi tryggingarinnar.");
  }

  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: {
      receipt: true,
      entityLinks: {
        where: { entityId, role: "INSURANCE_POLICY" },
        include: { entity: true },
      },
    },
  });
  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");

  await requireCompanyBookAccess(document.receipt.companyId);
  const user = await getEffectiveUser();
  if (!user) throw new Error("Innskráning er nauðsynleg.");
  if (document.approvedAt || document.voucherNumber != null || document.disposedAt) {
    throw new Error("Ekki er hægt að breyta tryggingarsniði á endanlega afgreiddu skjali.");
  }

  const entityLink = document.entityLinks[0];
  if (!entityLink || entityLink.entity.entityType !== "INSURANCE_POLICY") {
    throw new Error("Tryggingarskírteini fannst ekki á fylgiskjalinu.");
  }

  const number = accountNumber.trim();
  const name = accountName.trim();
  if (!/^\d{3,6}$/.test(number)) {
    throw new Error("Reikningsnúmer þarf að vera 3–6 tölustafir.");
  }
  if (name.length < 2 || name.length > 120) {
    throw new Error("Skráðu gilt heiti reikningslykils.");
  }

  const existing = await prisma.account.findUnique({
    where: { companyId_number: { companyId: document.receipt.companyId, number } },
  });
  if (existing) throw new Error(`Reikningslykill ${number} er þegar til.`);

  const confirmedAt = new Date();
  await prisma.$transaction(async (tx) => {
    const account = await tx.account.create({
      data: {
        companyId: document.receipt.companyId,
        number,
        name,
        type: "OTHER_EXPENSE",
        entryRole: "EXPENSE",
        isActive: true,
        vatTreatment: "NONE",
        vatCode: "NO_VAT",
        vatDeductiblePercent: 0,
        vatRequiresConfirmation: false,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "ACCOUNT",
        entityId: account.id,
        action: "CREATE_ACCOUNT_FROM_INSURANCE_POLICY",
        parentEntityType: "AI_DETECTED_DOCUMENT",
        parentEntityId: document.id,
        source: "USER",
        description: `Reikningslykill ${number} – ${name} stofnaður við staðfestingu tryggingarskírteinis.`,
        afterData: { number, name, type: "OTHER_EXPENSE", entryRole: "EXPENSE" },
      },
    });

    await tx.insightEntityAccountLink.updateMany({
      where: { entityId, role: "EXPENSE", status: "CONFIRMED" },
      data: { status: "REJECTED" },
    });
    await tx.insightEntityAccountLink.upsert({
      where: { entityId_accountId_role: { entityId, accountId: account.id, role: "EXPENSE" } },
      update: {
        status: "CONFIRMED", source: "USER", confidence: 1,
        confirmedAt, confirmedBy: user.id,
        note: "Kostnaðarreikningur tryggingarskírteinis staðfestur af notanda.",
      },
      create: {
        entityId, accountId: account.id, role: "EXPENSE",
        status: "CONFIRMED", source: "USER", confidence: 1,
        confirmedAt, confirmedBy: user.id,
        note: "Kostnaðarreikningur tryggingarskírteinis staðfestur af notanda.",
      },
    });
    await tx.insightEntity.update({
      where: { id: entityId },
      data: {
        relationshipStatus: "CONFIRMED",
        relationshipType: environment,
        relationshipConfirmedAt: confirmedAt,
        relationshipConfirmedBy: user.id,
      },
    });
    await tx.documentEntityLink.update({
      where: { documentId_entityId_role: { documentId, entityId, role: "INSURANCE_POLICY" } },
      data: { source: "USER", confidence: 1, confirmedAt, confirmedBy: user.id },
    });
    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "InsightEntity",
        entityId,
        action: "CONFIRM_INSURANCE_POLICY_PROFILE",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: `Tryggingarskírteini ${entityLink.entity.identifierValue ?? entityId} staðfest sem ${environment} á ${number}.`,
        afterData: { environment, accountNumber: number, accountId: account.id },
        metadata: { receiptId: document.receiptId, detectedDocumentId: document.id },
      },
    });
  });

  const analysisResult = await analyzeReceiptWithAI(document.receiptId);
  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath(`/fyrirtaeki/${document.receipt.companyId}/reikningslyklar`);
  return analysisResult;
}

export async function confirmInsightEntityAccountLink(
  documentId: number,
  entityId: number,
  accountNumber: string
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: {
      receipt: true,
      entityLinks: {
        where: { entityId, role: "LOAN" },
        include: { entity: true },
      },
    },
  });

  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) throw new Error("Innskráning er nauðsynleg.");

  if (document.approvedAt || document.voucherNumber != null) {
    throw new Error("Ekki er hægt að breyta lánatengingu eftir bókun.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Ekki er hægt að breyta lánatengingu á afgreiddu skjali.");
  }

  const entityLink = document.entityLinks[0];
  if (!entityLink || entityLink.entity.entityType !== "LOAN") {
    throw new Error("Lánatenging fannst ekki á þessu fylgiskjali.");
  }

  if (entityLink.entity.companyId !== document.receipt.companyId) {
    throw new Error("Lánið tilheyrir ekki sama fyrirtæki og fylgiskjalið.");
  }

  const cleanAccountNumber = accountNumber.trim();
  if (!cleanAccountNumber) throw new Error("Velja þarf skuldareikning.");

  const account = await prisma.account.findFirst({
    where: {
      companyId: document.receipt.companyId,
      number: cleanAccountNumber,
      isActive: true,
      type: {
        in: ["SHORT_TERM_LIABILITY", "LONG_TERM_LIABILITY"],
      },
    },
  });

  if (!account) {
    throw new Error("Velja þarf virkan skuldareikning (skammtíma- eða langtímaskuld) hjá fyrirtækinu.");
  }

  const confirmedAt = new Date();

  await prisma.$transaction(async (tx) => {
    const existingLinks = await tx.insightEntityAccountLink.findMany({
      where: { entityId, role: "LIABILITY_PRINCIPAL" },
      include: { account: true },
    });

    const previousConfirmed = existingLinks.find(
      (link) => link.status === "CONFIRMED"
    );

    await tx.insightEntityAccountLink.updateMany({
      where: {
        entityId,
        role: "LIABILITY_PRINCIPAL",
        status: "CONFIRMED",
      },
      data: { status: "REJECTED" },
    });

    await tx.insightEntityAccountLink.upsert({
      where: {
        entityId_accountId_role: {
          entityId,
          accountId: account.id,
          role: "LIABILITY_PRINCIPAL",
        },
      },
      update: {
        status: "CONFIRMED",
        source: "USER",
        confidence: 1,
        confirmedAt,
        confirmedBy: user.id,
        note: "Skuldareikningur staðfestur af notanda.",
      },
      create: {
        entityId,
        accountId: account.id,
        role: "LIABILITY_PRINCIPAL",
        status: "CONFIRMED",
        source: "USER",
        confidence: 1,
        confirmedAt,
        confirmedBy: user.id,
        note: "Skuldareikningur staðfestur af notanda.",
      },
    });

    await tx.insightEntity.update({
      where: { id: entityId },
      data: {
        relationshipStatus: "CONFIRMED",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "InsightEntity",
        entityId,
        action: "CONFIRM_ACCOUNT_LINK",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: `Skuldareikningur ${account.number} staðfestur fyrir ${entityLink.entity.name}.`,
        beforeData: previousConfirmed
          ? {
              accountId: previousConfirmed.accountId,
              accountNumber: previousConfirmed.account.number,
              role: previousConfirmed.role,
              status: previousConfirmed.status,
            }
          : undefined,
        afterData: {
          accountId: account.id,
          accountNumber: account.number,
          role: "LIABILITY_PRINCIPAL",
          status: "CONFIRMED",
          confirmedAt: confirmedAt.toISOString(),
          confirmedBy: user.id,
        },
        metadata: {
          receiptId: document.receiptId,
          detectedDocumentId: document.id,
          insightEntityId: entityId,
          identifierType: entityLink.entity.identifierType,
          identifierValue: entityLink.entity.identifierValue,
        },
      },
    });
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
}

async function materializeReviewedPaymentSchedule(
  tx: any,
  params: {
    companyId: number;
    receiptId: number;
    document: {
      id: number;
      merchantName?: string | null;
      date?: Date | null;
      totalAmount?: number | null;
      summary?: string | null;
      paymentSchedule?: unknown;
      bookingEntries?: Array<{ account: string; debit: number; credit: number; text?: string | null }>;
    };
  }
) {
  const { companyId, receiptId, document } = params;
  const raw = document.paymentSchedule;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;

  const schedule = raw as {
    scheduleType?: unknown;
    totalAmount?: unknown;
    currency?: unknown;
    confidence?: unknown;
    installments?: unknown;
  };

  if (!Array.isArray(schedule.installments) || schedule.installments.length === 0) return;

  const installments = schedule.installments
    .map((item: any, index: number) => {
      const dueDate = typeof item?.dueDate === "string" ? new Date(item.dueDate) : null;
      const amount = typeof item?.amount === "number" ? item.amount : Number(item?.amount);
      if (!dueDate || Number.isNaN(dueDate.getTime()) || !Number.isFinite(amount) || amount <= 0) return null;
      const sequence = Number.isInteger(item?.sequence) && item.sequence > 0 ? item.sequence : index + 1;
      return {
        sequence,
        dueDate,
        amount,
        externalReference:
          typeof item?.externalReference === "string" && item.externalReference.trim()
            ? item.externalReference.trim()
            : null,
      };
    })
    .filter(Boolean) as Array<{sequence:number; dueDate:Date; amount:number; externalReference:string|null}>;

  if (installments.length === 0) return;

  const scheduleTotal =
    typeof schedule.totalAmount === "number" && Number.isFinite(schedule.totalAmount)
      ? schedule.totalAmount
      : document.totalAmount ?? installments.reduce((sum, item) => sum + item.amount, 0);

  // Skuldareikningurinn er ekki harðkóðaður. AI/bókari velur hann í
  // bókunartillögunni og við festum hann aðeins þegar skjalið er yfirfarið.
  // Þannig getur 2000 verið rétt í einu tilviki en sértækur skuldalykill í öðru.
  const creditAccountNumbers = Array.from(
    new Set(
      (document.bookingEntries ?? [])
        .filter((entry) => Number(entry.credit) > 0 && Number(entry.debit) === 0)
        .map((entry) => String(entry.account).trim())
        .filter(Boolean)
    )
  );

  const liabilityAccounts = creditAccountNumbers.length
    ? await tx.account.findMany({
        where: {
          companyId,
          number: { in: creditAccountNumbers },
          type: {
            in: [
              "ACCOUNTS_PAYABLE",
              "SHORT_TERM_LIABILITY",
              "LONG_TERM_LIABILITY",
            ],
          },
        },
        select: { id: true, number: true },
      })
    : [];

  // Aðeins ótvírætt skuldarval verður varanlegt. Ef fleiri en einn
  // skuldareikningur er í færslunni þarf matching-lagið síðar að vita
  // nákvæmlega hvaða hluti greiðslan á við; við giskum ekki hér.
  const liabilityAccount =
    liabilityAccounts.length === 1 ? liabilityAccounts[0] : null;

  // Idempotency: eitt PRIMARY event fyrir sama greinda frumskjal.
  const existingLink = await tx.documentFinancialEvent.findFirst({
    where: { documentId: document.id, role: "PRIMARY" },
    include: { event: true },
  });

  const event = existingLink?.event ?? await tx.financialEvent.create({
    data: {
      companyId,
      eventType:
        schedule.scheduleType === "ANNUAL_ASSESSMENT"
          ? "ANNUAL_ASSESSMENT"
          : "CHARGE",
      status: "OPEN",
      title: document.merchantName
        ? `${document.merchantName} – greiðsluáætlun`
        : "Álagning / greiðsluáætlun",
      eventDate: document.date ?? null,
      amount: scheduleTotal,
      currency:
        typeof schedule.currency === "string" && schedule.currency.trim()
          ? schedule.currency.trim().toUpperCase()
          : "ISK",
      liabilityAccountId: liabilityAccount?.id ?? null,
      metadata: {
        source: "REVIEWED_DOCUMENT",
        scheduleType: schedule.scheduleType ?? "OTHER",
        confidence:
          typeof schedule.confidence === "number" ? schedule.confidence : null,
        summary: document.summary ?? null,
      },
    },
  });

  if (existingLink && liabilityAccount && existingLink.event.liabilityAccountId !== liabilityAccount.id) {
    await tx.financialEvent.update({
      where: { id: event.id },
      data: { liabilityAccountId: liabilityAccount.id },
    });
  }

  if (!existingLink) {
    await tx.documentFinancialEvent.create({
      data: {
        receiptId,
        documentId: document.id,
        eventId: event.id,
        role: "PRIMARY",
        confidence:
          typeof schedule.confidence === "number" ? schedule.confidence : null,
        source: "REVIEWED_DOCUMENT",
      },
    });
  }

  // Endurlesning/yfirferð má ekki tvöfalda gjalddaga.
  await tx.financialEventScheduleItem.deleteMany({ where: { eventId: event.id } });
  await tx.financialEventScheduleItem.createMany({
    data: installments.map((item) => ({
      eventId: event.id,
      sequence: item.sequence,
      dueDate: item.dueDate,
      amount: item.amount,
      currency:
        typeof schedule.currency === "string" && schedule.currency.trim()
          ? schedule.currency.trim().toUpperCase()
          : "ISK",
      externalReference: item.externalReference,
      metadata: { sourceDocumentId: document.id },
    })),
  });
}

  export async function reviewDetectedDocument(documentId: number) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: {
      receipt: true,
      bookingEntries: true,
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");

  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Þetta fylgiskjal hefur þegar verið afgreitt án bókunar.");
  }

  if (document.reviewedAt) {
    throw new Error("Þetta fylgiskjal hefur þegar verið yfirfarið.");
  }

  await prisma.$transaction(async (tx) => {
    await tx.aiDetectedDocument.update({
      where: {
        id: documentId,
      },
      data: {
        reviewedAt: new Date(),
      },
    });

    await tx.receipt.update({
      where: {
        id: document.receiptId,
      },
      data: {
        status: "REVIEWED",
      },
    });

    // Staðfest frumskjal með uppbyggðri greiðsluáætlun verður nú varanleg
    // FinancialEvent-skuldbinding með gjalddögum. Þetta bókar ekkert aftur.
    if (document.classificationSource !== "MANUAL") {
      await materializeReviewedPaymentSchedule(tx, {
        companyId: document.receipt.companyId,
        receiptId: document.receiptId,
        document,
      });
    }

    // „Merkja yfirfarið“ er staðfest bókaraval. Vista reikningsvalið strax
    // í AccountingPattern svo næsta sambærilega skjal geti endurnýtt ALLA
    // bókunina, þar með talið mótreikning (t.d. leiðréttingu 2000 -> 1510),
    // án þess að bíða eftir endanlegri bókun/voucher.
    await learnConfirmedAccountSelectionPatterns(tx, {
      companyId: document.receipt.companyId,
      userId: user.id,
      receiptId: document.receiptId,
      document: {
        id: document.id,
        merchantName: document.merchantName,
        documentType: document.documentType,
      },
      bookingEntries: document.bookingEntries.map((entry) => ({
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
      })),
    });
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/");
}


export async function confirmDetectedDocumentEnvironment(
  documentId: number,
  reason: string
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: { receipt: true },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Þetta fylgiskjal hefur þegar verið endanlega afgreitt.");
  }

  const isLegacyEnvironmentReview =
    document.documentRole === "REVIEW" &&
    document.documentType === "ACCOUNTING_DOCUMENT";

  if (!document.environmentReviewRequired && !isLegacyEnvironmentReview) {
    throw new Error("Þetta skjal bíður ekki staðfestingar á bókhaldsumhverfi.");
  }

  const cleanReason = reason.trim();
  if (cleanReason.length < 3) {
    throw new Error("Skrá þarf stutta skýringu á því hvers vegna skjalið tilheyrir þessu umhverfi.");
  }

  const confirmedAt = new Date();

  await prisma.$transaction(async (tx) => {
    await tx.aiDetectedDocument.update({
      where: { id: document.id },
      data: {
        environmentConfirmedAt: confirmedAt,
        environmentConfirmedById: user.id,
        environmentConfirmationReason: cleanReason,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "Receipt",
        entityId: document.receiptId,
        action: "CONFIRM_DOCUMENT_ENVIRONMENT",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: "Staðfest að fylgiskjal tilheyri þessu umhverfi þrátt fyrir viðvörun.",
        afterData: {
          environmentConfirmedAt: confirmedAt.toISOString(),
          environmentConfirmedById: user.id,
          environmentConfirmationReason: cleanReason,
        },
        metadata: {
          detectedDocumentId: document.id,
          receiptId: document.receiptId,
          merchantName: document.merchantName,
          receiptNumber: document.receiptNumber,
          documentDate: document.date?.toISOString() ?? null,
          totalAmount: document.totalAmount,
          reason: cleanReason,
          environmentReviewRequired: document.environmentReviewRequired,
          environmentReviewReason: document.environmentReviewReason,
          learningEffect: "NONE",
        },
      },
    });
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
}

export async function markDetectedDocumentOutsideBusiness(
  documentId: number,
  reason: string
) {
  return finalizeDetectedDocumentWithoutBooking(
    documentId,
    "OUTSIDE_BUSINESS",
    reason
  );
}

export async function retainDetectedDocumentForInsight(
  documentId: number,
  reason = "Varðveitt sem hluti af Innsýn án bókunar."
) {
  return finalizeDetectedDocumentWithoutBooking(
    documentId,
    "INSIGHT_ONLY",
    reason
  );
}

export async function resolveDetectedDocumentAsSupporting(
  documentId: number,
  reason = "Afgreitt sem stuðningsskjal við annan fjárhagsatburð."
) {
  return finalizeDetectedDocumentWithoutBooking(
    documentId,
    "SUPPORTING_RESOLVED",
    reason
  );
}

async function finalizeDetectedDocumentWithoutBooking(
  documentId: number,
  disposition: "OUTSIDE_BUSINESS" | "INSIGHT_ONLY" | "SUPPORTING_RESOLVED",
  reason: string
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: { receipt: true },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();
  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  const cleanReason = reason.trim();
  if (cleanReason.length < 3) {
    throw new Error("Skrá þarf stutta skýringu á afgreiðslu skjalsins.");
  }

  if (document.approvedAt || document.voucherNumber != null) {
    throw new Error("Ekki er hægt að afgreiða bókfært fylgiskjal án bókunar.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Þetta fylgiskjal hefur þegar verið endanlega afgreitt.");
  }

  const disposedAt = new Date();
  const action =
    disposition === "INSIGHT_ONLY"
      ? "RETAIN_FOR_INSIGHT"
      : disposition === "SUPPORTING_RESOLVED"
        ? "RESOLVE_SUPPORTING_DOCUMENT"
        : "MARK_OUTSIDE_BUSINESS";
  const description =
    disposition === "INSIGHT_ONLY"
      ? "Fylgiskjal varðveitt fyrir Innsýn án bókunar."
      : disposition === "SUPPORTING_RESOLVED"
        ? "Fylgiskjal afgreitt sem stuðningsskjal án sjálfstæðrar bókunar."
        : "Fylgiskjal afgreitt án bókunar – utan atvinnurekstrarbókhalds.";

  await prisma.$transaction(async (tx) => {
    await tx.aiDetectedDocument.update({
      where: { id: document.id },
      data: {
        disposition,
        dispositionReason: cleanReason,
        disposedAt,
        disposedById: user.id,
        reviewedAt: document.reviewedAt ?? disposedAt,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "Receipt",
        entityId: document.receiptId,
        action,
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description,
        afterData: {
          disposition,
          dispositionReason: cleanReason,
          disposedAt: disposedAt.toISOString(),
          disposedById: user.id,
        },
        metadata: {
          detectedDocumentId: document.id,
          receiptId: document.receiptId,
          merchantName: document.merchantName,
          receiptNumber: document.receiptNumber,
          documentDate: document.date?.toISOString() ?? null,
          totalAmount: document.totalAmount,
          documentType: document.documentType,
          documentRole: document.documentRole,
          reason: cleanReason,
        },
      },
    });

    const remainingUnresolved = await tx.aiDetectedDocument.count({
      where: {
        receiptId: document.receiptId,
        approvedAt: null,
        disposedAt: null,
        id: { not: document.id },
      },
    });

    if (remainingUnresolved === 0) {
      const approvedCount = await tx.aiDetectedDocument.count({
        where: {
          receiptId: document.receiptId,
          approvedAt: { not: null },
        },
      });

      await tx.receipt.update({
        where: { id: document.receiptId },
        data: { status: approvedCount > 0 ? "APPROVED" : "NOT_BOOKED" },
      });
    }
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/innsyn");
  revalidatePath("/");
}

export async function markDetectedDocumentDuplicate(
  documentId: number,
  duplicateOfDocumentId: number,
  duplicateVoucherNumber: number
) {
  await requireActiveCompanyWriteAccess();
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }


  await prisma.aiDetectedDocument.update({
    where: { id: documentId },
    data: {
      duplicateOfDocumentId,
      duplicateVoucherNumber,
      duplicateMarkedAt: new Date(),
    },
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
}


function normalizeAccountingPatternPart(value: string | null | undefined) {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, "_");
}

function buildCompanyDocumentPatternKey(document: {
  merchantName?: string | null;
  documentType?: string | null;
}) {
  const merchant = normalizeAccountingPatternPart(document.merchantName);
  const documentType = normalizeAccountingPatternPart(document.documentType);

  if (!merchant) {
    return null;
  }

  if (!documentType) {
    return `merchant:${merchant}`;
  }

  return `merchant:${merchant}|documentType:${documentType}`;
}

async function learnConfirmedAccountSelectionPatterns(
  tx: any,
  params: {
    companyId: number;
    userId: number;
    receiptId: number;
    document: {
      id: number;
      merchantName?: string | null;
      documentType?: string | null;
    };
    bookingEntries: {
      account: string;
      text: string;
      debit: number;
      credit: number;
    }[];
  }
) {
  const { companyId, userId, receiptId, document, bookingEntries } = params;

  const matchKey = buildCompanyDocumentPatternKey(document);
  if (!matchKey || bookingEntries.length === 0) {
    return;
  }

  const accountNumbers = [
    ...new Set(
      bookingEntries
        .map((entry) => entry.account.trim())
        .filter(Boolean)
    ),
  ];

  if (accountNumbers.length === 0) {
    return;
  }

  const accounts = await tx.account.findMany({
    where: {
      companyId,
      number: { in: accountNumbers },
      isActive: true,
    },
    select: {
      id: true,
      number: true,
      name: true,
      type: true,
      entryRole: true,
    },
  });

  const accountByNumber = new Map(
    accounts.map((account: any) => [account.number, account])
  );

  const candidates: {
    decisionRole: string;
    targetAccount: any;
    bookingEntry: {
      account: string;
      text: string;
      debit: number;
      credit: number;
    };
  }[] = [];

  for (const entry of bookingEntries) {
    const account = accountByNumber.get(entry.account) as any;
    if (!account) continue;

    let decisionRole: string | null = null;

    if (
      account.type === "BANK" ||
      account.entryRole === "BANK" ||
      account.type === "CASH"
    ) {
      decisionRole = "SETTLEMENT_ACCOUNT";
    } else if (
      account.type === "FINANCE_EXPENSE" ||
      account.entryRole === "FINANCE_EXPENSE"
    ) {
      decisionRole = "FINANCE_EXPENSE_ACCOUNT";
    } else if (
      account.type === "EXPENSE" ||
      account.entryRole === "EXPENSE"
    ) {
      decisionRole = "EXPENSE_ACCOUNT";
    } else if (
      account.type === "REVENUE" ||
      account.entryRole === "REVENUE"
    ) {
      decisionRole = "REVENUE_ACCOUNT";
    }

    if (!decisionRole) continue;

    candidates.push({
      decisionRole,
      targetAccount: account,
      bookingEntry: entry,
    });
  }

  for (const candidate of candidates) {
    const existingPattern = await tx.accountingPattern.findUnique({
      where: {
        companyId_patternType_decisionRole_matchKey: {
          companyId,
          patternType: "ACCOUNT_SELECTION",
          decisionRole: candidate.decisionRole,
          matchKey,
        },
      },
    });

    const sameDecision =
      existingPattern?.targetAccountId === candidate.targetAccount.id;

    const nextConfirmationCount =
      (existingPattern?.confirmationCount ?? 0) + 1;

    const nextCorrectionCount =
      (existingPattern?.correctionCount ?? 0) +
      (existingPattern && !sameDecision ? 1 : 0);

    const confidence = Math.min(
      0.95,
      0.55 +
        Math.min(nextConfirmationCount, 8) * 0.05 -
        Math.min(nextCorrectionCount, 5) * 0.08
    );

    const beforeData = existingPattern
      ? {
          targetAccountId: existingPattern.targetAccountId,
          confidence: existingPattern.confidence,
          confirmationCount: existingPattern.confirmationCount,
          correctionCount: existingPattern.correctionCount,
        }
      : undefined;

    const pattern = await tx.accountingPattern.upsert({
      where: {
        companyId_patternType_decisionRole_matchKey: {
          companyId,
          patternType: "ACCOUNT_SELECTION",
          decisionRole: candidate.decisionRole,
          matchKey,
        },
      },
      update: {
        targetAccountId: candidate.targetAccount.id,
        matchData: {
          merchantName: document.merchantName ?? null,
          documentType: document.documentType ?? null,
        },
        status: "ACTIVE",
        automationLevel: "SUGGEST_ONLY",
        confidence,
        confirmationCount: nextConfirmationCount,
        correctionCount: nextCorrectionCount,
        lastConfirmedAt: new Date(),
        lastConfirmedById: userId,
        valueData: {
          accountNumber: candidate.targetAccount.number,
          accountName: candidate.targetAccount.name,
          accountType: candidate.targetAccount.type,
          accountEntryRole: candidate.targetAccount.entryRole,
        },
      },
      create: {
        companyId,
        patternType: "ACCOUNT_SELECTION",
        decisionRole: candidate.decisionRole,
        matchKey,
        matchData: {
          merchantName: document.merchantName ?? null,
          documentType: document.documentType ?? null,
        },
        targetAccountId: candidate.targetAccount.id,
        valueData: {
          accountNumber: candidate.targetAccount.number,
          accountName: candidate.targetAccount.name,
          accountType: candidate.targetAccount.type,
          accountEntryRole: candidate.targetAccount.entryRole,
        },
        status: "ACTIVE",
        automationLevel: "SUGGEST_ONLY",
        confidence,
        confirmationCount: nextConfirmationCount,
        correctionCount: nextCorrectionCount,
        lastConfirmedAt: new Date(),
        lastConfirmedById: userId,
      },
    });

    await tx.accountingPatternEvidence.create({
      data: {
        patternId: pattern.id,
        receiptId,
        documentId: document.id,
        userId,
        action:
          existingPattern && !sameDecision
            ? "CORRECTED"
            : "CONFIRMED",
        beforeData,
        afterData: {
          targetAccountId: candidate.targetAccount.id,
          accountNumber: candidate.targetAccount.number,
          accountName: candidate.targetAccount.name,
          decisionRole: candidate.decisionRole,
          matchKey,
          bookingEntry: {
            text: candidate.bookingEntry.text,
            debit: candidate.bookingEntry.debit,
            credit: candidate.bookingEntry.credit,
          },
          confidence,
          confirmationCount: nextConfirmationCount,
          correctionCount: nextCorrectionCount,
        },
      },
    });
  }
}

 export async function approveDetectedDocument(
  documentId: number,
  manualVoucherNumber?: number,
  allowPossibleDuplicate = false
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: {
      id: documentId,
    },
    include: {
      bookingEntries: true,
      receipt: true,
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Ekki er hægt að bóka fylgiskjal sem hefur verið afgreitt án bókunar.");
  }

  if (!document.reviewedAt) {
  throw new Error(
    "Ekki er hægt að bóka fylgiskjal fyrr en það hefur verið yfirfarið."
  );
}

  if (document.bookingEntries.length === 0) {
    throw new Error(
      "Engar bókunarlínur fundust fyrir fylgiskjalið."
    );
  }


  if (
    document.approvedAt ||
    document.voucherNumber != null
  ) {
    throw new Error(
      "Þetta fylgiskjal hefur þegar verið samþykkt."
    );
  }
if (!document.date) {
  throw new Error(
    "Ekki er hægt að bóka fylgiskjal sem vantar dagsetningu."
  );
}

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: {
        id: document.receipt.companyId,
      },
    });

    if (!company) {
      throw new Error("Fyrirtæki fannst ekki.");
    }

    await assertCompanyVatPostingAllowed(
      tx,
      company,
      document.bookingEntries
    );
// Öryggisvörn gegn tvíbókun sama fylgiskjals
if (document.receiptNumber) {
  if (
  !allowPossibleDuplicate &&
  document.merchantName &&
  document.date &&
  document.totalAmount != null
) {
  const possibleDuplicate =
    await tx.aiDetectedDocument.findFirst({
      where: {
        id: {
          not: document.id,
        },
        merchantName: document.merchantName,
        date: document.date,
        totalAmount: document.totalAmount,
        receipt: {
          companyId: company.id,
        },
        approvedAt: {
          not: null,
        },
      },
    });

  if (possibleDuplicate) {
    throw new Error(
      `POSSIBLE_DUPLICATE|${possibleDuplicate.receiptId}|${possibleDuplicate.id}|${possibleDuplicate.voucherNumber ?? ""}|${document.merchantName}|${document.totalAmount}`
    );
  }
}
  const duplicateDocument = await tx.aiDetectedDocument.findFirst({
    where: {
      id: { not: document.id },
      receiptNumber: document.receiptNumber,
      receipt: {
        companyId: company.id,
      },
      approvedAt: {
        not: null,
      },
    },
  });

  if (duplicateDocument) {
    throw new Error(
      `Möguleg tvíbókun: reiknings-/kvittunarnúmer ${document.receiptNumber} hefur þegar verið bókað` +
        (duplicateDocument.voucherNumber
          ? ` sem fylgiskjal ${duplicateDocument.voucherNumber}.`
          : ".")
    );
  }
}

const olderUnbookedDocument =
  await tx.aiDetectedDocument.findFirst({
    where: {
      id: {
        not: document.id,
      },
      receipt: {
        companyId: company.id,
      },
      approvedAt: null,
      disposedAt: null,
      date: {
        not: null,
        lt: document.date!,
      },
    },
    orderBy: {
      date: "asc",
    },
  });

if (olderUnbookedDocument?.date) {
  throw new Error(
    `OLDER_UNBOOKED|${olderUnbookedDocument.receiptId}|${olderUnbookedDocument.id}|${olderUnbookedDocument.date.toISOString()}`
  );
}

    let voucherNumber: number;

    if (manualVoucherNumber === undefined) {
      const allocated = await tx.$queryRaw<{ voucherNumber: number }[]>`
        UPDATE "Company"
        SET "nextVoucherNumber" = "nextVoucherNumber" + 1
        WHERE "id" = ${company.id}
        RETURNING "nextVoucherNumber" - 1 AS "voucherNumber"
      `;

      if (!allocated[0]) {
        throw new Error("Ekki tókst að úthluta fylgiskjalsnúmeri.");
      }

      voucherNumber = Number(allocated[0].voucherNumber);
    } else {
      voucherNumber = manualVoucherNumber;
    }

const usedByAi =
  await tx.aiDetectedDocument.findFirst({
    where: {
      receipt: {
        companyId: company.id,
      },
      voucherNumber,
    },
  });

const usedByManual =
  await tx.receipt.findFirst({
    where: {
      companyId: company.id,
      voucherNumber,
    },
  });

if (usedByAi || usedByManual) {
  throw new Error(
    `Fylgiskjalsnúmer ${voucherNumber} er þegar í notkun.`
  );
}

    try {
      await tx.voucherNumberReservation.create({
        data: {
          companyId: company.id,
          voucherNumber,
          sourceType: "AI_DOCUMENT",
          sourceId: document.id,
        },
      });
    } catch {
      throw new Error(
        `Fylgiskjalsnúmer ${voucherNumber} var tekið af öðrum notanda á sama tíma. Reyndu aftur.`
      );
    }

    await tx.receiptEntry.createMany({
      data: document.bookingEntries.map(
        (entry) => ({
          account: entry.account,
          text: entry.text,
          debit: entry.debit,
          credit: entry.credit,
          receiptId: document.receiptId,
        })
      ),
    });

    const hasVatActivity = document.bookingEntries.some(
  (entry) =>
    entry.account === "2510" ||
    entry.account === "2520"
);

const isVatSettlement = document.bookingEntries.some(
  (entry) => entry.account === "2590"
);

if (hasVatActivity && !isVatSettlement) {
  const vatYear = document.date!.getUTCFullYear();
  const vatPeriod =
    Math.floor(document.date!.getUTCMonth() / 2) + 1;

  await tx.vatPeriod.upsert({
    where: {
      companyId_year_period: {
        companyId: company.id,
        year: vatYear,
        period: vatPeriod,
      },
    },
    update: {},
    create: {
      companyId: company.id,
      year: vatYear,
      period: vatPeriod,
      status: "OPEN",
    },
  });
}

    const approvedAt = new Date();

    await tx.aiDetectedDocument.update({
      where: {
        id: document.id,
      },
      data: {
        approvedAt,
        voucherNumber,
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: company.id,
        userId: user.id,
        entityType: "Receipt",
        entityId: document.receiptId,
        action: "BOOK_RECEIPT",
        parentEntityType: "AiDetectedDocument",
        parentEntityId: document.id,
        source: "USER",
        description: `Fylgiskjal ${voucherNumber} bókað.`,
        afterData: {
          status: "APPROVED",
          approvedAt: approvedAt.toISOString(),
          voucherNumber,
        },
        metadata: {
          bookingMethod: "AI_DOCUMENT",
          detectedDocumentId: document.id,
          receiptId: document.receiptId,
          voucherNumber,
          merchantName: document.merchantName,
          receiptNumber: document.receiptNumber,
          documentDate: document.date?.toISOString() ?? null,
          totalAmount: document.totalAmount,
          bookingEntries: document.bookingEntries.map((entry) => ({
            account: entry.account,
            text: entry.text,
            debit: entry.debit,
            credit: entry.credit,
          })),
        },
      },
    });

const remainingUnapproved =
  await tx.aiDetectedDocument.count({
    where: {
      receiptId: document.receiptId,
      approvedAt: null,
      disposedAt: null,
      id: {
        not: document.id,
      },
    },
  });

if (remainingUnapproved === 0) {
  await tx.receipt.update({
    where: {
      id: document.receiptId,
    },
    data: {
      status: "APPROVED",
    },
  });

  await archiveReceiptFile(document.receiptId);
}
  });



  revalidatePath(
    `/fylgiskjol/${document.receiptId}`
  );
  revalidatePath("/fylgiskjol");
  revalidatePath("/");
}
  export async function approveAiSuggestion(receiptId: number) {
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      company: true,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (!receipt.aiDate || receipt.aiAmount == null) {
    throw new Error("Engin full AI-tillaga er til að samþykkja.");
  }

  const approvedAiDate = receipt.aiDate;
  const approvedAiAmount = receipt.aiAmount;

  const aiEntries = await prisma.aiBookingEntry.findMany({
    where: {
      receiptId,
    },
  });

  if (aiEntries.length === 0) {
    throw new Error("Engin AI-bókhaldstillaga er til að samþykkja.");
  }

  const existingEntries = await prisma.receiptEntry.count({
    where: {
      receiptId,
    },
  });

  if (existingEntries > 0) {
    throw new Error("Þetta fylgiskjal hefur þegar verið bókað.");
  }

  await prisma.$transaction(async (tx) => {
    await assertCompanyVatPostingAllowed(
      tx,
      receipt.company,
      aiEntries
    );

    await tx.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      date: approvedAiDate,
      amount: approvedAiAmount,
      aiApprovedAt: new Date(),
    },
  });

    await tx.receiptEntry.createMany({
      data: aiEntries.map((entry) => ({
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
        receiptId,
      })),
    });
  });
  }
export async function approveManualReceipt(
  receiptId: number,
  bookingEntries: {
    account: string;
    text: string;
    debit: number;
    credit: number;
  }[]
) {
  await requireActiveCompanyWriteAccess();

  const user = await getEffectiveUser();

  if (!user) {
    throw new Error("Innskráning er nauðsynleg.");
  }

  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.status === "APPROVED") {
  throw new Error("Þetta fylgiskjal hefur þegar verið bókað.");
}

  if (bookingEntries.length === 0) {
    throw new Error("Engar bókunarlínur fundust.");
  }

  await prisma.$transaction(async (tx) => {
    const company = await tx.company.findUnique({
      where: {
        id: receipt.companyId,
      },
    });

    if (!company) {
      throw new Error("Fyrirtæki fannst ekki.");
    }

    await assertCompanyVatPostingAllowed(
      tx,
      company,
      bookingEntries
    );

    let voucherNumber: number;

    if (receipt.voucherNumber == null) {
      const allocated = await tx.$queryRaw<{ voucherNumber: number }[]>`
        UPDATE "Company"
        SET "nextVoucherNumber" = "nextVoucherNumber" + 1
        WHERE "id" = ${company.id}
        RETURNING "nextVoucherNumber" - 1 AS "voucherNumber"
      `;

      if (!allocated[0]) {
        throw new Error("Ekki tókst að úthluta fylgiskjalsnúmeri.");
      }

      voucherNumber = allocated[0].voucherNumber;
    } else {
      voucherNumber = receipt.voucherNumber;
    }

    const usedByAi =
      await tx.aiDetectedDocument.findFirst({
        where: {
          receipt: {
            companyId: company.id,
          },
          voucherNumber,
        },
      });

    const usedByManual =
  await tx.receipt.findFirst({
    where: {
      companyId: company.id,
      voucherNumber,
      id: {
        not: receiptId,
      },
    },
  });

    if (usedByAi || usedByManual) {
      throw new Error(
        `Fylgiskjalsnúmer ${voucherNumber} er þegar í notkun.`
      );
    }

    try {
      await tx.voucherNumberReservation.create({
        data: {
          companyId: company.id,
          voucherNumber,
          sourceType: "MANUAL_RECEIPT",
          sourceId: receiptId,
        },
      });
    } catch {
      throw new Error(
        `Fylgiskjalsnúmer ${voucherNumber} var tekið af öðrum notanda á sama tíma. Reyndu aftur.`
      );
    }

    await tx.receiptEntry.createMany({
      data: bookingEntries.map((entry) => ({
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
        receiptId,
      })),
    });

    await tx.receipt.update({
      where: {
        id: receiptId,
      },
      data: {
        voucherNumber,
        status: "APPROVED",
      },
    });

    await tx.auditEvent.create({
      data: {
        companyId: company.id,
        userId: user.id,
        entityType: "Receipt",
        entityId: receiptId,
        action: "BOOK_RECEIPT",
        source: "USER",
        description: `Fylgiskjal ${voucherNumber} bókað.`,
        afterData: {
          status: "APPROVED",
          voucherNumber,
        },
        metadata: {
          bookingMethod: "MANUAL_RECEIPT",
          receiptId,
          voucherNumber,
          merchantName: receipt.merchantName,
          receiptNumber: receipt.receiptNumber,
          documentDate: receipt.date?.toISOString() ?? null,
          totalAmount: receipt.amount,
          bookingEntries: bookingEntries.map((entry) => ({
            account: entry.account,
            text: entry.text,
            debit: entry.debit,
            credit: entry.credit,
          })),
        },
      },
    });

    if (
      receipt.voucherNumber != null &&
      voucherNumber >= company.nextVoucherNumber
    ) {
      await tx.company.update({
        where: { id: company.id },
        data: { nextVoucherNumber: voucherNumber + 1 },
      });
    }
});
  await archiveReceiptFile(receiptId);

  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/");
}


export async function updateDetectedDocumentEntries(
  documentId: number,
  entries: {
    id: number;
    account: string;
    text: string;
    debit: number;
    credit: number;
  }[],
  documentDate: string,
  documentAmount: string
) {
  const companyId = await requireActiveCompanyWriteAccess();
  const document =
  await prisma.aiDetectedDocument.findFirst({
    where: {
      id: documentId,
      receipt: {
        companyId,
      },
    },
      include: {
        receipt: {
          include: {
            company: {
              include: {
                accounts: {
                  where: {
                    isActive: true,
                  },
                },
              },
            },
          },
        },
      },
    });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  if (document.approvedAt) {
    throw new Error(
      "Ekki er hægt að breyta fylgiskjali eftir samþykkt."
    );
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Ekki er hægt að breyta fylgiskjali sem hefur verið afgreitt án bókunar.");
  }

  const allowedAccounts = new Set(
    document.receipt.company.accounts.map(
      (account) => account.number
    )
  );

  if (document.receipt.company.vatRegistered !== true) {
    const vatAccountNumbers = new Set(
      document.receipt.company.accounts
        .filter(isVatPostingAccount)
        .map((account) => account.number)
    );

    const selectedVatAccount = entries.find((entry) =>
      vatAccountNumbers.has(entry.account)
    )?.account;

    if (selectedVatAccount) {
      throw new Error(
        document.receipt.company.vatRegistered === false
          ? `Ekki er hægt að velja VSK-reikning ${selectedVatAccount} vegna þess að fyrirtækið er merkt „Nei, ekki VSK-skráð“.`
          : `Ekki er hægt að velja VSK-reikning ${selectedVatAccount} fyrr en VSK-skráningarstaða fyrirtækisins hefur verið staðfest.`
      );
    }
  }

  for (const entry of entries) {
    if (!allowedAccounts.has(entry.account)) {
      throw new Error(
        `Reikningslykill ${entry.account} er ekki í reikningslykli fyrirtækisins.`
      );
    }

    if (
      !Number.isFinite(entry.debit) ||
      !Number.isFinite(entry.credit) ||
      entry.debit < 0 ||
      entry.credit < 0
    ) {
      throw new Error(
        "Debet og kredit verða að vera gildar jákvæðar tölur."
      );
    }
  }

  const totalDebit = entries.reduce(
    (sum, entry) => sum + entry.debit,
    0
  );

  const totalCredit = entries.reduce(
    (sum, entry) => sum + entry.credit,
    0
  );

  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(
      "Bókunin stemmir ekki. Samtala debet og kredit verður að vera jöfn."
    );
  }

  const parsedAmount =
  documentAmount.trim() === ""
    ? null
    : Number(documentAmount);

if (
  parsedAmount !== null &&
  (!Number.isFinite(parsedAmount) || parsedAmount < 0)
) {
  throw new Error("Upphæð fylgiskjals er ekki gild.");
}

const parsedDate =
  documentDate.trim() === ""
    ? null
    : new Date(`${documentDate}T12:00:00.000Z`);

if (
  parsedDate !== null &&
  Number.isNaN(parsedDate.getTime())
) {
  throw new Error("Dagsetning fylgiskjals er ekki gild.");
}

const submittedIds = new Set(entries.map((entry) => entry.id));

const existingEntries = await prisma.aiDetectedDocumentEntry.findMany({
  where: {
    documentId,
  },
  select: {
    id: true,
  },
});

const entryIdsToDelete = existingEntries
  .map((entry) => entry.id)
  .filter((id) => !submittedIds.has(id));

await prisma.$transaction(async (tx) => {
  if (entryIdsToDelete.length > 0) {
    await tx.aiDetectedDocumentEntry.deleteMany({
      where: {
        documentId,
        id: {
          in: entryIdsToDelete,
        },
      },
    });
  }

  await tx.aiDetectedDocument.update({
    where: {
      id: documentId,
    },
    data: {
      date: parsedDate,
      totalAmount: parsedAmount,
    },
  });

  for (const entry of entries) {
    await tx.aiDetectedDocumentEntry.updateMany({
      where: {
        id: entry.id,
        documentId,
      },
      data: {
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
      },
    });
  }
});

  revalidatePath(
    `/fylgiskjol/${document.receiptId}`
  );
}
 export async function addDetectedDocumentEntry(documentId: number) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: {
      id: documentId,
    },
    select: {
      id: true,
      receiptId: true,
      approvedAt: true,
      disposedAt: true,
      disposition: true,
    },
  });

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  if (document.approvedAt) {
    throw new Error("Ekki er hægt að breyta fylgiskjali eftir bókun.");
  }

  if (document.disposedAt || document.disposition) {
    throw new Error("Ekki er hægt að breyta fylgiskjali sem hefur verið afgreitt án bókunar.");
  }

  await prisma.aiDetectedDocumentEntry.create({
    data: {
      documentId,
      account: "",
      text: "",
      debit: 0,
      credit: 0,
    },
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
}
export async function deleteDetectedDocumentEntry(entryId: number) {
  await requireActiveCompanyWriteAccess();
  const entry = await prisma.aiDetectedDocumentEntry.findUnique({
    where: {
      id: entryId,
    },
    include: {
      document: {
        select: {
          receiptId: true,
          approvedAt: true,
          disposedAt: true,
          disposition: true,
        },
      },
    },
  });

  if (!entry) {
    throw new Error("Bókunarlína fannst ekki.");
  }

  if (entry.document.approvedAt) {
    throw new Error("Ekki er hægt að breyta fylgiskjali eftir bókun.");
  }

  if (entry.document.disposedAt || entry.document.disposition) {
    throw new Error("Ekki er hægt að breyta fylgiskjali sem hefur verið afgreitt án bókunar.");
  }

  await prisma.aiDetectedDocumentEntry.delete({
    where: {
      id: entryId,
    },
  });

  revalidatePath(`/fylgiskjol/${entry.document.receiptId}`);
}
export async function deleteDetectedDocument(documentId: number) {
  const companyId = await requireActiveCompanyWriteAccess();
await requireCompanyDeleteAccess(companyId);
  const document = await prisma.aiDetectedDocument.findFirst({
  where: {
    id: documentId,
    receipt: {
      companyId,
    },
  },
});

  if (!document) {
    throw new Error("Greint fylgiskjal fannst ekki.");
  }

  if (document.approvedAt || document.voucherNumber) {
    throw new Error(
      "Ekki er hægt að eyða greindu fylgiskjali sem hefur þegar verið bókað."
    );
  }

  await prisma.aiDetectedDocument.delete({
    where: {
      id: documentId,
    },
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath("/fylgiskjol");
}
export async function cancelManualReceipt(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  await prisma.$transaction(async (tx) => {
    const receipt = await tx.receipt.findUnique({
      where: {
        id: receiptId,
      },
      include: {
        aiDetectedDocuments: true,
      },
    });

    if (!receipt) {
      throw new Error("Fylgiskjal fannst ekki.");
    }

    if (receipt.voucherNumber == null) {
      throw new Error("Fylgiskjalið er ekki með fylgiskjalsnúmer.");
    }

    const hasApprovedAiDocument =
      receipt.aiDetectedDocuments.some(
        (document) => document.approvedAt !== null
      );

    if (hasApprovedAiDocument) {
      throw new Error(
        "Ekki er hægt að afbóka AI-bókað fylgiskjal með þessari aðgerð."
      );
    }

    const releasedVoucherNumber = receipt.voucherNumber;
const company = await tx.company.findUnique({
  where: {
    id: receipt.companyId,
  },
  select: {
    nextVoucherNumber: true,
  },
});

if (!company) {
  throw new Error("Fyrirtæki fannst ekki.");
}
    await tx.receipt.update({
  where: {
    id: receiptId,
  },
  data: {
    voucherNumber: null,
    status: "CANCELLED",
    ocrStatus: `Afbókuð handvirk bókun. Fylgiskjalsnúmer ${releasedVoucherNumber} losað.`,
  },
});

if (company.nextVoucherNumber === releasedVoucherNumber + 1) {
  await tx.company.update({
    where: {
      id: receipt.companyId,
    },
    data: {
      nextVoucherNumber: releasedVoucherNumber,
    },
  });
}

});
  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
}
export async function deleteReceipt(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      aiDetectedDocuments: true,
      entries: true,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  // Ekki má eyða fylgiskjali sem hefur verið bókað
  const hasApprovedDocument = receipt.aiDetectedDocuments.some(
    (document) => document.approvedAt !== null
  );

  if (hasApprovedDocument || receipt.status === "APPROVED") {
    throw new Error(
      "Ekki er hægt að eyða fylgiskjali sem hefur þegar verið bókað."
    );
  }

  await prisma.receipt.delete({
    where: {
      id: receiptId,
    },
  });
  revalidatePath("/fylgiskjol");
}
  export async function markReceiptReviewed(receiptId: number) {
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.status === "APPROVED") {
    throw new Error("Ekki er hægt að breyta bókuðu fylgiskjali.");
  }

  await prisma.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "REVIEWED",
    },
  });

  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/stjornbord");
}

export async function markReceiptNeedsAttention(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  if (receipt.status === "APPROVED") {
    throw new Error("Ekki er hægt að breyta bókuðu fylgiskjali.");
  }

  await prisma.receipt.update({
    where: {
      id: receiptId,
    },
    data: {
      status: "NEEDS_ATTENTION",
    },
  });

  revalidatePath(`/fylgiskjol/${receiptId}`);
  revalidatePath("/fylgiskjol");
  revalidatePath("/stjornbord");
}

export async function repairDeleteLegacyReceipt(receiptId: number) {
  await requireActiveCompanyWriteAccess();
  const receipt = await prisma.receipt.findUnique({
    where: {
      id: receiptId,
    },
    include: {
      aiDetectedDocuments: true,
    },
  });

  if (!receipt) {
    throw new Error("Fylgiskjal fannst ekki.");
  }

  const hasVoucherNumber = receipt.aiDetectedDocuments.some(
    (document) => document.voucherNumber !== null
  );

  if (hasVoucherNumber) {
    throw new Error(
      "Ekki má nota viðgerðar-eyðingu á fylgiskjal sem hefur fengið fylgiskjalsnúmer."
    );
  }

  const hasLegacyApprovedDocuments = receipt.aiDetectedDocuments.some(
    (document) =>
      document.approvedAt !== null && document.voucherNumber === null
  );

  if (!hasLegacyApprovedDocuments) {
    throw new Error(
      "Þetta fylgiskjal er ekki í gamla ónúmeraða bókunarástandinu."
    );
  }

  await prisma.$transaction(async (tx) => {
    await tx.receiptEntry.deleteMany({
      where: {
        receiptId,
      },
    });

    await tx.aiDetectedDocument.deleteMany({
      where: {
        receiptId,
      },
    });

    await tx.receipt.delete({
      where: {
        id: receiptId,
      },
    });
  });

  revalidatePath("/");
  revalidatePath("/fylgiskjol");
}

export async function createLiabilityAccountForDetectedDocument(
  documentId: number,
  data: { number: string; name: string }
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: { receipt: true },
  });

  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");
  if (document.approvedAt || document.voucherNumber) {
    throw new Error("Ekki er hægt að breyta skuldalykli á bókuðu fylgiskjali.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const number = data.number.trim();
  const name = data.name.trim();
  if (!/^\d{3,6}$/.test(number)) {
    throw new Error("Reikningsnúmer þarf að vera 3–6 tölustafir.");
  }
  if (name.length < 2 || name.length > 120) {
    throw new Error("Skráðu gilt heiti skuldalykils.");
  }

  const existing = await prisma.account.findUnique({
    where: {
      companyId_number: {
        companyId: document.receipt.companyId,
        number,
      },
    },
  });
  if (existing) {
    throw new Error(`Reikningslykill ${number} er þegar til.`);
  }

  const user = await getEffectiveUser();
  if (!user) throw new Error("Innskráning er nauðsynleg.");

  await prisma.$transaction(async (tx) => {
    // Lesum skuldalínuna aftur INNI í transactioninu. BookingEntries geta verið
    // endursköpuð við AI-endurlestur og því má ekki treysta á entry-id sem var
    // sótt áður en transactionið hófst.
    const currentDocument = await tx.aiDetectedDocument.findUnique({
      where: { id: documentId },
      include: { bookingEntries: true },
    });
    if (!currentDocument) {
      throw new Error("Greint fylgiskjal fannst ekki lengur.");
    }
    if (currentDocument.approvedAt || currentDocument.voucherNumber) {
      throw new Error("Ekki er hægt að breyta skuldalykli á bókuðu fylgiskjali.");
    }

    const creditCandidates = [] as Array<{
      entryId: number;
      accountNumber: string;
      accountId: number;
    }>;

    for (const entry of currentDocument.bookingEntries) {
      if (!(Number(entry.credit) > 0 && Number(entry.debit) === 0)) continue;
      const account = await tx.account.findUnique({
        where: {
          companyId_number: {
            companyId: document.receipt.companyId,
            number: String(entry.account).trim(),
          },
        },
        select: { id: true, number: true, type: true },
      });
      if (
        account &&
        ["ACCOUNTS_PAYABLE", "SHORT_TERM_LIABILITY", "LONG_TERM_LIABILITY"].includes(
          account.type
        )
      ) {
        creditCandidates.push({
          entryId: entry.id,
          accountNumber: account.number,
          accountId: account.id,
        });
      }
    }

    if (creditCandidates.length !== 1) {
      throw new Error(
        "Skuldalínan er ekki ótvíræð. Veldu skuldareikning handvirkt áður en nýr lykill er stofnaður."
      );
    }

    // Athugum aftur innan transactionins svo tvísmellur/samhliða beiðni geti
    // ekki stofnað sama lykil tvisvar.
    const existingInTransaction = await tx.account.findUnique({
      where: {
        companyId_number: {
          companyId: document.receipt.companyId,
          number,
        },
      },
      select: { id: true },
    });
    if (existingInTransaction) {
      throw new Error(`Reikningslykill ${number} er þegar til.`);
    }

    const account = await tx.account.create({
      data: {
        companyId: document.receipt.companyId,
        number,
        name,
        type: "SHORT_TERM_LIABILITY",
        entryRole: "GENERAL",
        isActive: true,
        vatTreatment: "NONE",
        vatCode: "NO_VAT",
        vatDeductiblePercent: 0,
        vatRequiresConfirmation: false,
      },
    });

    const updated = await tx.aiDetectedDocumentEntry.updateMany({
      where: {
        id: creditCandidates[0].entryId,
        documentId,
      },
      data: { account: number },
    });
    if (updated.count !== 1) {
      // Kastið rúllar account.create líka til baka; engin hálf staða verður eftir.
      throw new Error(
        "Skuldalínan breyttist á meðan aðgerðin var í gangi. Endurhlaðið síðuna og reynið aftur."
      );
    }

    // Ef FinancialEvent hefur þegar verið materialized (t.d. við endurvinnslu),
    // færist staðfesti skuldalykillinn með. Annars verður hann festur við yfirferð.
    const eventLink = await tx.documentFinancialEvent.findFirst({
      where: { documentId, role: "PRIMARY" },
      select: { eventId: true },
    });
    if (eventLink) {
      await tx.financialEvent.update({
        where: { id: eventLink.eventId },
        data: { liabilityAccountId: account.id },
      });
    }

    await tx.auditEvent.create({
      data: {
        companyId: document.receipt.companyId,
        userId: user.id,
        entityType: "ACCOUNT",
        entityId: account.id,
        action: "CREATE_LIABILITY_ACCOUNT_FROM_DOCUMENT",
        parentEntityType: "AI_DETECTED_DOCUMENT",
        parentEntityId: document.id,
        source: "USER",
        description: `Skuldalykill ${number} – ${name} stofnaður og staðfestur fyrir skuldbindingu.`,
        beforeData: {
          bookingAccountNumber: creditCandidates[0].accountNumber,
        },
        afterData: {
          number,
          name,
          type: "SHORT_TERM_LIABILITY",
          bookingAccountNumber: number,
        },
      },
    });
  });

  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath(`/fyrirtaeki/${document.receipt.companyId}/reikningslyklar`);
}

export async function createAccountForDetectedDocument(
  documentId: number,
  data: {
    number: string;
    name: string;
    category: "REVENUE" | "ASSET" | "EXPENSE" | "LIABILITY";
  }
) {
  const document = await prisma.aiDetectedDocument.findUnique({
    where: { id: documentId },
    include: { receipt: true },
  });

  if (!document) throw new Error("Greint fylgiskjal fannst ekki.");
  if (document.approvedAt || document.voucherNumber) {
    throw new Error("Ekki er hægt að stofna lykil frá bókuðu fylgiskjali.");
  }

  await requireCompanyBookAccess(document.receipt.companyId);

  const number = data.number.trim();
  const name = data.name.trim();
  if (!/^\d{3,6}$/.test(number)) {
    throw new Error("Reikningsnúmer þarf að vera 3–6 tölustafir.");
  }
  if (name.length < 2 || name.length > 120) {
    throw new Error("Skráðu gilt heiti reikningslykils.");
  }

  const accountShape = {
    REVENUE: { type: "OTHER_REVENUE", entryRole: "REVENUE" },
    ASSET: { type: "ACCOUNTS_RECEIVABLE", entryRole: "GENERAL" },
    EXPENSE: { type: "OTHER_EXPENSE", entryRole: "EXPENSE" },
    LIABILITY: { type: "SHORT_TERM_LIABILITY", entryRole: "GENERAL" },
  } as const;
  const shape = accountShape[data.category];
  if (!shape) throw new Error("Ógild tegund reikningslykils.");

  const existing = await prisma.account.findUnique({
    where: { companyId_number: { companyId: document.receipt.companyId, number } },
  });
  if (existing) {
    throw new Error(`Reikningslykill ${number} er þegar til.`);
  }

  const user = await getEffectiveUser();
  const account = await prisma.account.create({
    data: {
      companyId: document.receipt.companyId,
      number,
      name,
      type: shape.type,
      entryRole: shape.entryRole,
      isActive: true,
      vatTreatment: "NONE",
      vatCode: "NO_VAT",
      vatDeductiblePercent: 0,
      vatRequiresConfirmation: false,
    },
  });

  await prisma.auditEvent.create({
    data: {
      companyId: document.receipt.companyId,
      userId: user?.id ?? null,
      entityType: "ACCOUNT",
      entityId: account.id,
      action: "CREATE_ACCOUNT_FROM_DOCUMENT",
      parentEntityType: "AI_DETECTED_DOCUMENT",
      parentEntityId: document.id,
      source: "USER",
      description: `Reikningslykill ${number} – ${name} stofnaður úr yfirferð fylgiskjals.`,
      afterData: { number, name, type: shape.type, entryRole: shape.entryRole },
    },
  });

  const result = await analyzeReceiptWithAI(document.receiptId);
  revalidatePath(`/fylgiskjol/${document.receiptId}`);
  revalidatePath(`/fyrirtaeki/${document.receipt.companyId}/reikningslyklar`);
  return result;
}
