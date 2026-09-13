"use server";

import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

async function bankContext(requestedCompanyId?: number) {
  const store = await cookies();
  const token = store.get("sessionToken")?.value;
  const cookieCompanyId = Number(store.get("activeCompanyId")?.value);
  const companyId = requestedCompanyId ?? cookieCompanyId;

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

async function requireBankAccount(bankAccountId: number, companyId: number) {
  const account = await prisma.bankAccount.findFirst({
    where: { id: bankAccountId, companyId, isActive: true },
  });
  if (!account) throw new Error("Bankareikningur fannst ekki hjá virku fyrirtæki.");
  return account;
}

export async function createBankAccount(formData: FormData) {
  const { companyId } = await bankContext();
  const name = String(formData.get("name") ?? "").trim();
  const bankName = String(formData.get("bankName") ?? "").trim();
  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const iban = String(formData.get("iban") ?? "").trim().replace(/\s+/g, "").toUpperCase();

  if (!name || !bankName || !accountNumber) {
    throw new Error("Heiti, banki og reikningsnúmer þurfa að vera skráð.");
  }

  const existing = await prisma.bankAccount.findFirst({
    where: { companyId, accountNumber, isActive: true },
  });
  if (existing) redirect(`/banki/${existing.id}`);

  const account = await prisma.bankAccount.create({
    data: { companyId, name, bankName, accountNumber, iban: iban || null },
  });
  redirect(`/banki/${account.id}`);
}

export async function createBankTransaction(formData: FormData) {
  const { companyId } = await bankContext();
  const bankAccountId = Number(formData.get("bankAccountId"));
  const date = String(formData.get("date") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();
  if (!bankAccountId || !date || !text || !amount) throw new Error("Fylla þarf út alla reiti.");
  await requireBankAccount(bankAccountId, companyId);
  await prisma.bankTransaction.create({
    data: { bankAccountId, date: new Date(`${date}T12:00:00`), text, amount },
  });
  redirect(`/banki/${bankAccountId}`);
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

function parseDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    const result = new Date(value);
    result.setHours(12, 0, 0, 0);
    return result;
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed) return new Date(parsed.y, parsed.m - 1, parsed.d, 12, 0, 0);
  }
  const text = String(value ?? "").trim();
  const match = text.match(/^(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})$/);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 12, 0, 0);
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "").replace(/kr\.?/gi, "").replace(/\s/g, "").trim();
  if (!text) return null;
  if (text.includes(",") && text.includes(".")) text = text.replace(/\./g, "").replace(",", ".");
  else if (text.includes(",")) text = text.replace(",", ".");
  const amount = Number(text);
  return Number.isFinite(amount) ? amount : null;
}

function cell(row: unknown[], headers: Map<string, number>, ...names: string[]) {
  for (const name of names) {
    const index = headers.get(normalizeHeader(name));
    if (index !== undefined) return row[index];
  }
  return "";
}

function text(value: unknown) {
  return String(value ?? "").trim();
}

function bankRowFingerprint(bankAccountId: number, date: Date, raw: Record<string, unknown>, amount: number) {
  const fingerprintSource = [
    bankAccountId,
    date.toISOString().slice(0, 10),
    raw.valueDate ?? "",
    raw.bankCode ?? "",
    raw.rbNumber ?? "",
    raw.category ?? "",
    raw.transactionNumber ?? "",
    raw.reference ?? "",
    raw.textKey ?? "",
    raw.paymentExplanation ?? "",
    raw.counterpartyKennitala ?? "",
    raw.counterparty ?? "",
    amount,
  ].join("|");

  return createHash("sha256").update(fingerprintSource).digest("hex");
}

export async function previewBankStatement(formData: FormData) {
  const { companyId } = await bankContext();
  const bankAccountId = Number(formData.get("bankAccountId"));
  if (!bankAccountId) throw new Error("Bankareikning vantar.");
  await requireBankAccount(bankAccountId, companyId);

  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Engin skrá valin.");
  if (!/\.(xlsx|xls)$/i.test(file.name)) throw new Error("Bankayfirlitið þarf að vera XLSX eða XLS skrá.");

  const workbook = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: "buffer", cellDates: true });
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
    return normalized.includes("dags") || normalized.includes("dagsetning");
  });
  if (headerIndex === -1) throw new Error("Fann ekki dálk fyrir dagsetningu í bankayfirlitinu.");

  const headerRow = rows[headerIndex] as unknown[];
  const headers = new Map<string, number>();
  headerRow.forEach((value, index) => headers.set(normalizeHeader(value), index));
  const hasAmount = headers.has("upphaed") || headers.has("amount");
  if (!hasAmount) throw new Error("Fann ekki Upphæð-dálk í bankayfirlitinu.");

  const dataRows = rows.slice(headerIndex + 1).filter(
    (row) => Array.isArray(row) && row.some((value) => text(value) !== "")
  ) as unknown[][];

  const batch = await prisma.importBatch.create({
    data: { companyId, bankAccountId, fileName: file.name, sourceType: "BANK_STATEMENT_XLSX", status: "PREVIEW" },
  });

  const preparedRows = dataRows.map((row, index) => {
    const date = parseDate(cell(row, headers, "Dags", "Dagsetning", "Date"));
    const amount = parseAmount(cell(row, headers, "Upphæð", "Amount"));
    const raw: Record<string, unknown> = {
      valueDate: text(cell(row, headers, "Vaxtad", "Vaxtadagur")),
      bankCode: text(cell(row, headers, "Banki")),
      rbNumber: text(cell(row, headers, "RB. Nr.", "RB Nr")),
      category: text(cell(row, headers, "Fl.")),
      transactionNumber: text(cell(row, headers, "Tnr/Seðilnr.", "Tnr Seðilnr")),
      reference: text(cell(row, headers, "Tilvísun")),
      textKey: text(cell(row, headers, "Textalykill")),
      paymentExplanation: text(cell(row, headers, "Skýring greiðslu")),
      counterpartyKennitala: text(cell(row, headers, "Kennitala")),
      counterparty: text(cell(row, headers, "Texti", "Mótaðili")),
      amount,
      originalHeaders: Object.fromEntries(headerRow.map((h, i) => [String(h || `column_${i + 1}`), row[i] ?? ""])),
    };
    const fingerprint = date && amount !== null ? bankRowFingerprint(bankAccountId, date, raw, amount) : null;
    const displayText = String(raw.counterparty || raw.paymentExplanation || raw.textKey || raw.reference || "Bankafærsla");
    return { row, index, date, amount, raw, fingerprint, displayText };
  });

  const fingerprints = preparedRows.flatMap((row) => row.fingerprint ? [row.fingerprint] : []);
  const existingTransactions = fingerprints.length
    ? await prisma.bankTransaction.findMany({
        where: { bankAccountId, fingerprint: { in: fingerprints } },
        select: { fingerprint: true },
      })
    : [];
  const existingFingerprints = new Set(existingTransactions.flatMap((tx) => tx.fingerprint ? [tx.fingerprint] : []));

  const importRows = preparedRows.map(({ index, date, amount, raw, fingerprint, displayText }) => {
    const isDuplicate = Boolean(fingerprint && existingFingerprints.has(fingerprint));
    return {
      importBatchId: batch.id,
      rowNumber: index + 1,
      date,
      text: displayText,
      debit: amount !== null && amount < 0 ? Math.abs(amount) : 0,
      credit: amount !== null && amount > 0 ? amount : 0,
      status: !date || amount === null ? "ERROR" : isDuplicate ? "DUPLICATE" : "NEW",
      errorMessage: !date ? "Dagsetning fannst ekki." : amount === null ? "Upphæð fannst ekki." : isDuplicate ? "Þegar innflutt." : null,
      rawData: JSON.stringify(raw),
    };
  });

  if (importRows.length) await prisma.importRow.createMany({ data: importRows });
  redirect(`/banki/${bankAccountId}/innflutningur/${batch.id}`);
}

export async function cancelBankImport(formData: FormData) {
  const { companyId } = await bankContext();
  const batchId = Number(formData.get("batchId"));
  if (!batchId) throw new Error("Innflutningsbunki vantar.");

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, companyId, sourceType: "BANK_STATEMENT_XLSX" },
    select: { id: true, bankAccountId: true, status: true },
  });
  if (!batch || !batch.bankAccountId) throw new Error("Bankainnflutningur fannst ekki.");
  await requireBankAccount(batch.bankAccountId, companyId);

  if (batch.status === "PREVIEW") {
    await prisma.importBatch.delete({ where: { id: batch.id } });
  }

  redirect(`/banki/${batch.bankAccountId}`);
}

export async function confirmBankImport(formData: FormData) {
  const { companyId } = await bankContext();
  const batchId = Number(formData.get("batchId"));
  if (!batchId) throw new Error("Innflutningsbunki vantar.");

  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, companyId, sourceType: "BANK_STATEMENT_XLSX" },
    include: { rows: { where: { status: { not: "ERROR" } }, orderBy: { rowNumber: "asc" } }, bankAccount: true },
  });
  if (!batch || !batch.bankAccountId || !batch.bankAccount) throw new Error("Bankainnflutningur fannst ekki.");
  await requireBankAccount(batch.bankAccountId, companyId);

  let imported = 0;
  let duplicates = 0;
  for (const row of batch.rows) {
    if (!row.date || !row.rawData) continue;
    const raw = JSON.parse(row.rawData) as Record<string, unknown>;
    const amount = row.credit > 0 ? row.credit : -row.debit;
    const fingerprint = bankRowFingerprint(batch.bankAccountId, row.date, raw, amount);

    const existing = await prisma.bankTransaction.findUnique({
      where: { bankAccountId_fingerprint: { bankAccountId: batch.bankAccountId, fingerprint } },
      select: { id: true },
    });
    if (existing) {
      duplicates++;
      continue;
    }

    await prisma.bankTransaction.create({
      data: {
        bankAccountId: batch.bankAccountId,
        date: row.date,
        text: row.text ?? "Bankafærsla",
        amount,
        reference: typeof raw.reference === "string" && raw.reference ? raw.reference : null,
        fingerprint,
        sourceType: "BANK_STATEMENT_XLSX",
        sourceFileName: batch.fileName,
        sourceRawData: row.rawData,
        status: "UNRECONCILED",
      },
    });
    imported++;
  }

  await prisma.importBatch.update({
    where: { id: batch.id },
    data: { status: duplicates > 0 ? `IMPORTED:${imported}:DUPLICATES:${duplicates}` : `IMPORTED:${imported}` },
  });
  redirect(`/banki/${batch.bankAccountId}`);
}
