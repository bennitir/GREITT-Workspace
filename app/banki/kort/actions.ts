"use server";

import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

const CARD_STATEMENT_SOURCE = "PAYMENT_CARD_STATEMENT_XLSX";

async function cardContext() {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const companyId = Number(store.get("activeCompanyId")?.value);

  if (!token || !Number.isInteger(companyId) || companyId < 1) {
    throw new Error("Virkt fyrirtæki eða innskráning vantar.");
  }

  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });

  if (!session || session.expiresAt < new Date() || !session.user.isActive) {
    throw new Error("Innskráning er útrunnin.");
  }

  if (session.user.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: { userId_companyId: { userId: session.user.id, companyId } },
    });
    if (!access?.isActive) throw new Error("Aðgang vantar.");
  }

  return { companyId, userId: session.user.id };
}

async function requirePaymentCard(paymentCardId: number, companyId: number) {
  const card = await prisma.paymentCard.findFirst({
    where: { id: paymentCardId, companyId, isActive: true },
  });
  if (!card) throw new Error("Greiðslukort fannst ekki hjá virku fyrirtæki.");
  return card;
}

function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/ð/g, "d")
    .replace(/þ/g, "th")
    .replace(/æ/g, "ae")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function cell(row: unknown[], headers: Map<string, number>, ...names: string[]) {
  for (const name of names) {
    const index = headers.get(normalizeHeader(name));
    if (index !== undefined) return row[index];
  }
  return "";
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let valueText = String(value ?? "").replace(/kr\.?/gi, "").replace(/\s/g, "").trim();
  if (!valueText) return null;
  if (valueText.includes(",") && valueText.includes(".")) {
    valueText = valueText.replace(/\./g, "").replace(",", ".");
  } else if (valueText.includes(",")) {
    valueText = valueText.replace(",", ".");
  }
  const number = Number(valueText);
  return Number.isFinite(number) ? number : null;
}

function parseCardDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return new Date(value);
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value) as
      | { y: number; m: number; d: number; H?: number; M?: number; S?: number }
      | null;
    if (parsed) {
      return new Date(
        parsed.y,
        parsed.m - 1,
        parsed.d,
        parsed.H ?? 0,
        parsed.M ?? 0,
        Math.floor(parsed.S ?? 0),
      );
    }
  }

  const valueText = text(value);
  const match = valueText.match(
    /^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/,
  );
  if (!match) return null;

  return new Date(
    Number(match[3]),
    Number(match[2]) - 1,
    Number(match[1]),
    Number(match[4] ?? 0),
    Number(match[5] ?? 0),
    Number(match[6] ?? 0),
  );
}

function cardRowFingerprint(
  paymentCardId: number,
  date: Date,
  raw: Record<string, unknown>,
  amount: number,
) {
  const source = [
    paymentCardId,
    date.toISOString(),
    raw.merchantText ?? "",
    raw.merchantCategory ?? "",
    raw.foreignAmount ?? "",
    raw.currency ?? "",
    raw.exchangeRate ?? "",
    amount,
    raw.explanation ?? "",
    raw.cardPeriod ?? "",
  ].join("|");

  return createHash("sha256").update(source).digest("hex");
}

export async function createPaymentCard(formData: FormData) {
  const { companyId } = await cardContext();
  const name = text(formData.get("name"));
  const issuerName = text(formData.get("issuerName"));
  const network = text(formData.get("network"));
  const lastFour = text(formData.get("lastFour")).replace(/\D/g, "");

  if (!name) throw new Error("Heiti greiðslukorts vantar.");
  if (lastFour && lastFour.length !== 4) {
    throw new Error("Síðustu tölustafir korts þurfa að vera nákvæmlega fjórir.");
  }

  const existing = await prisma.paymentCard.findFirst({
    where: {
      companyId,
      isActive: true,
      name,
      lastFour: lastFour || null,
    },
  });
  if (existing) redirect(`/banki/kort/${existing.id}`);

  const card = await prisma.paymentCard.create({
    data: {
      companyId,
      name,
      issuerName: issuerName || null,
      network: network || null,
      lastFour: lastFour || null,
    },
  });

  redirect(`/banki/kort/${card.id}`);
}

export async function previewPaymentCardStatement(formData: FormData) {
  const { companyId } = await cardContext();
  const paymentCardId = Number(formData.get("paymentCardId"));
  if (!paymentCardId) throw new Error("Greiðslukort vantar.");
  await requirePaymentCard(paymentCardId, companyId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Engin skrá valin.");
  if (!/\.(xlsx|xls)$/i.test(file.name)) {
    throw new Error("Kortayfirlitið þarf að vera XLSX eða XLS skrá.");
  }

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), {
    type: "buffer",
    cellDates: true,
  });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) throw new Error("Engin vinnublöð fundust í skránni.");

  const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[firstSheetName], {
    header: 1,
    raw: true,
    defval: "",
  });

  const headerIndex = rows.findIndex((row) => {
    if (!Array.isArray(row)) return false;
    const normalized = row.map(normalizeHeader);
    return normalized.includes("dagsetning") && normalized.includes("upphaedisk");
  });
  if (headerIndex === -1) {
    throw new Error("Fann ekki dálkana Dagsetning og Upphæð(ISK) í kortayfirlitinu.");
  }

  const headerRow = rows[headerIndex] as unknown[];
  const headers = new Map<string, number>();
  headerRow.forEach((value, index) => headers.set(normalizeHeader(value), index));

  const merchantHeader = ["Söluaðili eða skýring", "Merchant", "Description"].some((name) =>
    headers.has(normalizeHeader(name)),
  );
  if (!merchantHeader) {
    throw new Error("Fann ekki dálk fyrir söluaðila eða skýringu í kortayfirlitinu.");
  }

  const dataRows = rows.slice(headerIndex + 1).filter(
    (row) => Array.isArray(row) && row.some((value) => text(value) !== ""),
  ) as unknown[][];

  const batch = await prisma.importBatch.create({
    data: {
      companyId,
      paymentCardId,
      fileName: file.name,
      sourceType: CARD_STATEMENT_SOURCE,
      status: "PREVIEW",
    },
  });

  const preparedRows = dataRows.map((row, index) => {
    const date = parseCardDate(cell(row, headers, "Dagsetning", "Date"));
    const amount = parseNumber(cell(row, headers, "Upphæð(ISK)", "Upphæð", "Amount"));
    const merchantText = text(
      cell(row, headers, "Söluaðili eða skýring", "Merchant", "Description"),
    );

    const raw: Record<string, unknown> = {
      merchantText,
      merchantCategory: text(cell(row, headers, "Söluaðilaflokkun", "Merchant category")),
      foreignAmount: parseNumber(cell(row, headers, "Erlend upphæð", "Foreign amount")),
      currency: text(cell(row, headers, "Gjaldmiðill", "Currency")),
      exchangeRate: parseNumber(cell(row, headers, "Gengi", "Exchange rate")),
      explanation: text(cell(row, headers, "Skýring", "Explanation")),
      cardPeriod: text(cell(row, headers, "Korta tímabil", "Card period")),
      amount,
      originalHeaders: Object.fromEntries(
        headerRow.map((header, columnIndex) => [
          String(header || `column_${columnIndex + 1}`),
          row[columnIndex] ?? "",
        ]),
      ),
    };

    const fingerprint = date && amount !== null
      ? cardRowFingerprint(paymentCardId, date, raw, amount)
      : null;

    if (fingerprint) raw.fingerprint = fingerprint;

    return {
      index,
      date,
      amount,
      merchantText,
      raw,
      fingerprint,
    };
  });

  const fingerprints = preparedRows.flatMap((row) => row.fingerprint ? [row.fingerprint] : []);
  const existingTransactions = fingerprints.length
    ? await prisma.paymentCardTransaction.findMany({
        where: { paymentCardId, fingerprint: { in: fingerprints } },
        select: { fingerprint: true },
      })
    : [];
  const existingFingerprints = new Set(
    existingTransactions.flatMap((transaction) =>
      transaction.fingerprint ? [transaction.fingerprint] : []
    ),
  );

  const importRows = preparedRows.map(({ index, date, amount, merchantText, raw, fingerprint }) => {
    const isDuplicate = Boolean(fingerprint && existingFingerprints.has(fingerprint));
    const missingDate = !date;
    const missingAmount = amount === null;
    const missingMerchant = !merchantText;

    return {
      importBatchId: batch.id,
      rowNumber: headerIndex + index + 2,
      date,
      text: merchantText || null,
      debit: amount !== null && amount < 0 ? Math.abs(amount) : 0,
      credit: amount !== null && amount > 0 ? amount : 0,
      status: missingDate || missingAmount || missingMerchant
        ? "ERROR"
        : isDuplicate
          ? "DUPLICATE"
          : "NEW",
      errorMessage: missingDate
        ? "Dagsetning fannst ekki."
        : missingAmount
          ? "Upphæð fannst ekki."
          : missingMerchant
            ? "Söluaðili eða skýring fannst ekki."
            : isDuplicate
              ? "Þegar innflutt."
              : null,
      rawData: JSON.stringify(raw),
    };
  });

  if (importRows.length) {
    await prisma.importRow.createMany({ data: importRows });
  }

  redirect(`/banki/kort/${paymentCardId}/innflutningur/${batch.id}`);
}

export async function cancelPaymentCardImport(formData: FormData) {
  const { companyId } = await cardContext();
  const batchId = Number(formData.get("batchId"));
  if (!batchId) throw new Error("Innflutningsbunki vantar.");

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, companyId, sourceType: CARD_STATEMENT_SOURCE },
    select: { id: true, paymentCardId: true },
  });
  if (!batch?.paymentCardId) throw new Error("Kortainnflutningur fannst ekki.");

  await requirePaymentCard(batch.paymentCardId, companyId);
  await prisma.importBatch.delete({ where: { id: batch.id } });
  redirect(`/banki/kort/${batch.paymentCardId}`);
}

export async function confirmPaymentCardImport(formData: FormData) {
  const { companyId } = await cardContext();
  const batchId = Number(formData.get("batchId"));
  if (!batchId) throw new Error("Innflutningsbunki vantar.");

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, companyId, sourceType: CARD_STATEMENT_SOURCE },
    include: {
      rows: { orderBy: { rowNumber: "asc" } },
      paymentCard: true,
    },
  });
  if (!batch?.paymentCardId || !batch.paymentCard) {
    throw new Error("Kortainnflutningur fannst ekki.");
  }
  await requirePaymentCard(batch.paymentCardId, companyId);

  let imported = 0;
  let duplicates = 0;

  for (const row of batch.rows) {
    if (row.status === "DUPLICATE") {
      duplicates++;
      continue;
    }
    if (row.status !== "NEW" || !row.date || !row.text || !row.rawData) continue;

    const raw = JSON.parse(row.rawData) as Record<string, unknown>;
    const amount = parseNumber(raw.amount);
    const fingerprint = text(raw.fingerprint);
    if (amount === null || !fingerprint) continue;

    const existing = await prisma.paymentCardTransaction.findUnique({
      where: {
        paymentCardId_fingerprint: {
          paymentCardId: batch.paymentCardId,
          fingerprint,
        },
      },
      select: { id: true },
    });
    if (existing) {
      duplicates++;
      continue;
    }

    await prisma.paymentCardTransaction.create({
      data: {
        paymentCardId: batch.paymentCardId,
        date: row.date,
        merchantText: row.text,
        merchantCategory: text(raw.merchantCategory) || null,
        foreignAmount: parseNumber(raw.foreignAmount),
        currency: text(raw.currency) || null,
        exchangeRate: parseNumber(raw.exchangeRate),
        amount,
        explanation: text(raw.explanation) || null,
        cardPeriod: text(raw.cardPeriod) || null,
        fingerprint,
        sourceType: CARD_STATEMENT_SOURCE,
        sourceFileName: batch.fileName,
        sourceRawData: row.rawData,
        status: "UNRECONCILED",
      },
    });
    imported++;
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: {
      status: duplicates > 0
        ? `IMPORTED:${imported}:DUPLICATES:${duplicates}`
        : `IMPORTED:${imported}`,
    },
  });

  redirect(`/banki/kort/${batch.paymentCardId}`);
}
