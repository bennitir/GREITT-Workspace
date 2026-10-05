import crypto from "node:crypto";
import path from "node:path";
import { prisma } from "../lib/prisma";
import { supabaseAdmin } from "../lib/supabase";
import { extractTextFromPdfBuffer } from "../lib/core/pdf-text";

const COMPANY_NAME = "Sturla Ólafsson";
const BUCKET = "fylgiskjol";
const TARGET_START = new Date("2026-07-01T00:00:00.000Z");
const TARGET_END = new Date("2026-09-01T00:00:00.000Z");
const MAX_ORPHAN_PDFS_TO_INSPECT = 200;

type StorageFile = {
  storagePath: string;
  size: number | null;
  updatedAt: string | null;
};

function normalize(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("is-IS")
    .replace(/\s+/g, " ")
    .trim();
}

function isNovaText(value: unknown) {
  const text = normalize(value);
  return /\bnova\b/.test(text) || text.includes("nova hf");
}

function inTargetWindow(date: Date | string | null | undefined) {
  if (!date) return false;
  const value = date instanceof Date ? date : new Date(date);
  return Number.isFinite(value.getTime()) && value >= TARGET_START && value < TARGET_END;
}

function textHasJulAug2026(text: string) {
  const normalized = normalize(text);
  return (
    /\b(?:0?[1-9]|[12]\d|3[01])[.\-/]0?7[.\-/]2026\b/.test(normalized) ||
    /\b(?:0?[1-9]|[12]\d|3[01])[.\-/]0?8[.\-/]2026\b/.test(normalized) ||
    normalized.includes("júlí 2026") ||
    normalized.includes("juli 2026") ||
    normalized.includes("ágúst 2026") ||
    normalized.includes("agust 2026")
  );
}

function sha256(bytes: Uint8Array) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

async function listStorageFilesRecursively(prefix: string): Promise<StorageFile[]> {
  const files: StorageFile[] = [];
  const queue = [prefix];

  while (queue.length > 0) {
    const current = queue.shift()!;
    let offset = 0;

    while (true) {
      const { data, error } = await supabaseAdmin.storage.from(BUCKET).list(current, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });

      if (error) {
        throw new Error(`STORAGE_LIST_FAILED:${current}:${error.message}`);
      }

      const rows = data ?? [];
      for (const item of rows) {
        const itemPath = current ? `${current}/${item.name}` : item.name;
        const isFolder = item.id == null && item.metadata == null;

        if (isFolder) {
          queue.push(itemPath);
          continue;
        }

        files.push({
          storagePath: itemPath,
          size:
            item.metadata && typeof item.metadata === "object" && "size" in item.metadata
              ? Number((item.metadata as { size?: unknown }).size ?? 0) || null
              : null,
          updatedAt: item.updated_at ?? item.created_at ?? null,
        });
      }

      if (rows.length < 100) break;
      offset += rows.length;
    }
  }

  return files;
}

function summarizeDocument(document: {
  id: number;
  merchantName: string | null;
  date: Date | null;
  receiptNumber: string | null;
  totalAmount: number | null;
  approvedAt: Date | null;
  voucherNumber: number | null;
  disposition: string | null;
  dispositionReason: string | null;
  disposedAt: Date | null;
  disposedById: number | null;
  summary: string;
  bookingEntries: Array<{ account: string; text: string; debit: number; credit: number }>;
}) {
  return {
    id: document.id,
    merchantName: document.merchantName,
    date: document.date?.toISOString().slice(0, 10) ?? null,
    receiptNumber: document.receiptNumber,
    totalAmount: document.totalAmount,
    approvedAt: document.approvedAt?.toISOString() ?? null,
    voucherNumber: document.voucherNumber,
    disposition: document.disposition,
    dispositionReason: document.dispositionReason,
    disposedAt: document.disposedAt?.toISOString() ?? null,
    disposedById: document.disposedById,
    accounts: document.bookingEntries.map((entry) => entry.account),
    summary: document.summary.slice(0, 160),
  };
}

async function main() {
  console.log("=== NOVA JULÍ–ÁGÚST 2026 — READ-ONLY DIAGNOSTIC ===");
  console.log("Engar DB- eða Storage-breytingar eru framkvæmdar.\n");

  const companies = await prisma.company.findMany({
    where: { name: COMPANY_NAME },
    select: { id: true, name: true },
  });

  if (companies.length !== 1) {
    console.log(`STOPP: fann ${companies.length} fyrirtæki með nákvæma heitinu "${COMPANY_NAME}".`);
    console.log(companies);
    process.exitCode = 2;
    return;
  }

  const company = companies[0];
  console.log(`Fyrirtæki: ${company.name} (#${company.id})`);
  console.log("Markmið: finna Nova-skjöl fyrir júlí/ágúst 2026 og vísbendingar um eyðingu.\n");

  const receipts = await prisma.receipt.findMany({
    where: {
      companyId: company.id,
      OR: [
        { merchantName: { contains: "Nova", mode: "insensitive" } },
        { description: { contains: "Nova", mode: "insensitive" } },
        { sourceText: { contains: "Nova", mode: "insensitive" } },
        { ocrText: { contains: "Nova", mode: "insensitive" } },
        {
          aiDetectedDocuments: {
            some: {
              OR: [
                { merchantName: { contains: "Nova", mode: "insensitive" } },
                { summary: { contains: "Nova", mode: "insensitive" } },
              ],
            },
          },
        },
      ],
    },
    select: {
      id: true,
      date: true,
      aiDate: true,
      createdAt: true,
      status: true,
      description: true,
      amount: true,
      merchantName: true,
      fileName: true,
      fileHash: true,
      storagePath: true,
      sourceText: true,
      ocrText: true,
      aiDetectedDocuments: {
        select: {
          id: true,
          merchantName: true,
          date: true,
          receiptNumber: true,
          totalAmount: true,
          approvedAt: true,
          voucherNumber: true,
          disposition: true,
          dispositionReason: true,
          disposedAt: true,
          disposedById: true,
          summary: true,
          bookingEntries: {
            select: { account: true, text: true, debit: true, credit: true },
          },
        },
        orderBy: [{ date: "asc" }, { id: "asc" }],
      },
    },
    orderBy: [{ date: "asc" }, { id: "asc" }],
  });

  const targetReceipts = receipts.filter((receipt) => {
    const source = `${receipt.description}\n${receipt.sourceText ?? ""}\n${receipt.ocrText ?? ""}`;
    return (
      inTargetWindow(receipt.date) ||
      inTargetWindow(receipt.aiDate) ||
      receipt.aiDetectedDocuments.some((document) => inTargetWindow(document.date)) ||
      textHasJulAug2026(source)
    );
  });

  console.log("1) Nova sem er enn í gagnagrunninum");
  if (targetReceipts.length === 0) {
    console.log("   Engin Nova-færsla fannst sem tengist júlí/ágúst 2026.");
  } else {
    for (const receipt of targetReceipts) {
      console.log(
        JSON.stringify(
          {
            receiptId: receipt.id,
            receiptDate: receipt.date?.toISOString().slice(0, 10) ?? null,
            aiDate: receipt.aiDate?.toISOString().slice(0, 10) ?? null,
            createdAt: receipt.createdAt.toISOString(),
            status: receipt.status,
            merchantName: receipt.merchantName,
            amount: receipt.amount,
            fileName: receipt.fileName,
            storagePath: receipt.storagePath,
            fileHash: receipt.fileHash,
            documents: receipt.aiDetectedDocuments.map(summarizeDocument),
          },
          null,
          2,
        ),
      );
    }
  }

  const auditEvents = await prisma.auditEvent.findMany({
    where: {
      companyId: company.id,
      createdAt: {
        gte: new Date("2026-01-01T00:00:00.000Z"),
      },
    },
    select: {
      id: true,
      action: true,
      source: true,
      description: true,
      entityType: true,
      entityId: true,
      parentEntityType: true,
      parentEntityId: true,
      metadata: true,
      afterData: true,
      createdAt: true,
      userId: true,
      user: { select: { name: true, email: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const novaAudit = auditEvents.filter((event) => {
    const text = JSON.stringify({
      action: event.action,
      description: event.description,
      metadata: event.metadata,
      afterData: event.afterData,
    });
    return isNovaText(text) && textHasJulAug2026(text);
  });

  console.log("\n2) Rekjanleg Nova-afgreiðsla / audit");
  if (novaAudit.length === 0) {
    console.log("   Enginn Nova audit-atburður fannst með júlí/ágúst 2026 í varðveittum gögnum.");
  } else {
    for (const event of novaAudit) {
      console.log(
        JSON.stringify(
          {
            auditEventId: event.id,
            action: event.action,
            source: event.source,
            createdAt: event.createdAt.toISOString(),
            userId: event.userId,
            userName: event.user?.name ?? null,
            userEmail: event.user?.email ?? null,
            entityType: event.entityType,
            entityId: event.entityId,
            parentEntityType: event.parentEntityType,
            parentEntityId: event.parentEntityId,
            description: event.description,
            metadata: event.metadata,
            afterData: event.afterData,
          },
          null,
          2,
        ),
      );
    }
  }

  console.log("\n3) Supabase Storage vs. Receipt.storagePath");
  const allDbPaths = new Set(
    (
      await prisma.receipt.findMany({
        where: { companyId: company.id, storagePath: { not: null } },
        select: { storagePath: true },
      })
    )
      .map((row) => row.storagePath)
      .filter((value): value is string => Boolean(value)),
  );

  const storageFiles = await listStorageFilesRecursively(String(company.id));
  const orphanFiles = storageFiles.filter((file) => !allDbPaths.has(file.storagePath));

  console.log(`   Storage-skrár fyrirtækis: ${storageFiles.length}`);
  console.log(`   Skrár án samsvarandi Receipt.storagePath: ${orphanFiles.length}`);

  const orphanCandidates = orphanFiles
    .filter((file) => /\.pdf$/i.test(file.storagePath))
    .slice(0, MAX_ORPHAN_PDFS_TO_INSPECT);

  if (orphanFiles.filter((file) => /\.pdf$/i.test(file.storagePath)).length > MAX_ORPHAN_PDFS_TO_INSPECT) {
    console.log(
      `   ATH: fleiri en ${MAX_ORPHAN_PDFS_TO_INSPECT} munaðarlaus PDF; aðeins fyrstu ${MAX_ORPHAN_PDFS_TO_INSPECT} eru textalesin.`,
    );
  }

  const orphanNova: Array<Record<string, unknown>> = [];

  for (const file of orphanCandidates) {
    const baseNameLooksNova = isNovaText(path.basename(file.storagePath));

    const { data, error } = await supabaseAdmin.storage.from(BUCKET).download(file.storagePath);
    if (error || !data) {
      if (baseNameLooksNova) {
        orphanNova.push({
          storagePath: file.storagePath,
          reason: "FILENAME_MATCH_BUT_DOWNLOAD_FAILED",
          storageError: error?.message ?? "NO_DATA",
        });
      }
      continue;
    }

    const bytes = new Uint8Array(await data.arrayBuffer());
    let text = "";
    let textError: string | null = null;
    try {
      text = await extractTextFromPdfBuffer(bytes);
    } catch (error) {
      textError = error instanceof Error ? error.message : String(error);
    }

    const nova = baseNameLooksNova || isNovaText(text);
    const target = textHasJulAug2026(text);

    if (nova && (target || baseNameLooksNova)) {
      orphanNova.push({
        storagePath: file.storagePath,
        size: file.size,
        updatedAt: file.updatedAt,
        sha256: sha256(bytes),
        novaFoundIn: baseNameLooksNova ? "FILENAME" : "PDF_TEXT",
        julAug2026FoundInText: target,
        pdfTextAvailable: Boolean(text.trim()),
        pdfTextError: textError,
        textPreview: text.trim().replace(/\s+/g, " ").slice(0, 500) || null,
      });
    }
  }

  console.log("\n4) Munaðarlaus Nova-skjöl í Storage");
  if (orphanNova.length === 0) {
    console.log(
      "   Engin munaðarlaus Nova PDF fannst með læsilegu júlí/ágúst evidence. Þetta sannar þó ekki að skjal hafi aldrei verið til ef PDF var skannað án textalags.",
    );
  } else {
    for (const item of orphanNova) {
      console.log(JSON.stringify(item, null, 2));
    }
  }

  console.log("\n=== NIÐURSTAÐA ===");
  if (targetReceipts.length > 0) {
    console.log("- Nova júlí/ágúst finnst enn í DB: skoða status/disposition/booking hér að ofan.");
  } else {
    console.log("- Nova júlí/ágúst fannst ekki í núverandi DB.");
  }

  if (novaAudit.length > 0) {
    console.log("- Rekjanleg USER-afgreiðsla fannst í AuditEvent: þar sést notandi og aðgerð.");
  } else {
    console.log("- Engin rekjanleg Nova USER-afgreiðsla fannst fyrir júlí/ágúst.");
  }

  if (orphanNova.length > 0) {
    console.log(
      "- Nova-lík frumskrá fannst í Storage án Receipt.storagePath. Það er sterk vísbending um að DB-færslu hafi verið eytt/hún horfið eftir upload.",
    );
  } else {
    console.log(
      "- Engin skýr Nova orphan fannst í textalesanlegu Storage. Ef frumskjal var mynd/skannað PDF getur það samt þurft sjónræna skoðun.",
    );
  }

  console.log(
    "\nATH: núverandi hard-delete actions fyrir óbókuð Receipt/AiDetectedDocument skrá ekki sjálfkrafa delete-audit. Því getur rannsóknin sýnt sterkar vísbendingar um hard-delete en ekki alltaf hver ýtti á Eyða.",
  );
}

main()
  .catch((error) => {
    console.error("\nDIAGNOSTIC_FAILED");
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
