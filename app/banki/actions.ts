"use server";

import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function confirmBankImport(formData: FormData) {
  const cookieStore = await cookies();

  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  const batchId = Number(
    formData.get("batchId")
  );

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki valið.");
  }

  if (!batchId) {
    throw new Error("Innflutningsbunki vantar.");
  }

  const batch = await prisma.importBatch.findFirst({
    where: {
      id: batchId,
      companyId: activeCompanyId,
      sourceType: "BANK_XLSX",
    },
    include: {
      rows: {
        where: {
          status: {
            not: "ERROR",
          },
        },
        orderBy: {
          rowNumber: "asc",
        },
      },
      bankAccount: true,
    },
  });

  if (!batch || !batch.bankAccountId || !batch.bankAccount) {
    throw new Error("Bankainnflutningur fannst ekki.");
  }

  for (const row of batch.rows) {
    if (!row.date) {
      continue;
    }

    const raw = row.rawData
      ? JSON.parse(row.rawData)
      : {};

    const amount =
      row.credit > 0
        ? row.credit
        : -row.debit;

    const fingerprintSource = [
      batch.bankAccountId,
      row.date.toISOString(),
      raw.counterparty ?? "",
      raw.counterpartyKennitala ?? "",
      raw.reference ?? "",
      raw.textKey ?? "",
      amount,
      raw.balance ?? "",
    ].join("|");

    const fingerprint = createHash("sha256")
      .update(fingerprintSource)
      .digest("hex");

    await prisma.bankTransaction.upsert({
      where: {
        bankAccountId_fingerprint: {
          bankAccountId: batch.bankAccountId,
          fingerprint,
        },
      },
      update: {},
      create: {
        bankAccountId: batch.bankAccountId,
        date: row.date,
        text: row.text ?? "Bankafærsla",
        amount,
        reference: raw.reference || null,
        fingerprint,
        status: "UNRECONCILED",
      },
    });
  }

  await prisma.importBatch.update({
    where: {
      id: batch.id,
    },
    data: {
      status: "IMPORTED",
    },
  });

  redirect(`/banki/${batch.bankAccountId}`);
}

export async function createBankAccount(formData: FormData) {
  const cookieStore = await cookies();
  const activeCompanyId = Number(cookieStore.get("activeCompanyId")?.value);

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki valið.");
  }

  const accountNumber = String(formData.get("accountNumber") ?? "").trim();
  const iban = String(formData.get("iban") ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toUpperCase();

  if (!accountNumber) {
    throw new Error("Reikningsnúmer vantar.");
  }

  if (!iban) {
    throw new Error("IBAN vantar.");
  }

  await prisma.bankAccount.create({
    data: {
      companyId: activeCompanyId,
      name: "Reikningur",
      bankName: "Íslandsbanki",
      accountNumber,
      iban,
    },
  });

  redirect("/banki");
}

export async function createBankTransaction(formData: FormData) {
  const cookieStore = await cookies();
  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  const bankAccountId = Number(formData.get("bankAccountId"));
  const date = String(formData.get("date") ?? "");
  const text = String(formData.get("text") ?? "").trim();
  const amount = String(formData.get("amount") ?? "").trim();

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki valið.");
  }

  if (!bankAccountId || !date || !text || !amount) {
    throw new Error("Fylla þarf út alla reiti.");
  }

  const account = await prisma.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      companyId: activeCompanyId,
      isActive: true,
    },
  });

  if (!account) {
    throw new Error("Bankareikningur fannst ekki hjá virku fyrirtæki.");
  }

  await prisma.bankTransaction.create({
    data: {
      bankAccountId,
      date: new Date(`${date}T12:00:00`),
      text,
      amount,
    },
  });

  redirect(`/banki/${bankAccountId}`);
}

function parseIcelandicDate(value: unknown): Date | null {
  const text = String(value ?? "").trim();

  const match = text.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);

  if (!match) {
    return null;
  }

  const [, day, month, year] = match;

  return new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    12,
    0,
    0
  );
}

function parseIcelandicAmount(value: unknown): number | null {
  const text = String(value ?? "")
    .replace(/kr\./gi, "")
    .replace(/\s/g, "")
    .replace(/,/g, "")
    .trim();

  if (!text) {
    return null;
  }

  const amount = Number(text);

  return Number.isFinite(amount) ? amount : null;
}

export async function previewBankStatement(formData: FormData) {

    const cookieStore = await cookies();
const activeCompanyId = Number(
  cookieStore.get("activeCompanyId")?.value
);

const bankAccountId = Number(
  formData.get("bankAccountId")
);

if (!activeCompanyId) {
  throw new Error("Ekkert virkt fyrirtæki valið.");
}

if (!bankAccountId) {
  throw new Error("Bankareikning vantar.");
}

const account = await prisma.bankAccount.findFirst({
  where: {
    id: bankAccountId,
    companyId: activeCompanyId,
    isActive: true,
  },
});

if (!account) {
  throw new Error(
    "Bankareikningur fannst ekki hjá virku fyrirtæki."
  );
}
  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("Engin skrá valin.");
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  const workbook = XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
  });

  const firstSheetName = workbook.SheetNames[0];

  if (!firstSheetName) {
    throw new Error("Engin vinnublað fundust í skránni.");
  }

  const sheet = workbook.Sheets[firstSheetName];

  const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });

  const headerIndex = rows.findIndex(
    (row) =>
      Array.isArray(row) &&
      String(row[0]).trim().toLowerCase() === "dagsetning"
  );

  if (headerIndex === -1) {
    throw new Error("Fann ekki línu sem byrjar á Dagsetning.");
  }

  const headers = rows[headerIndex].map((value) =>
    String(value).trim()
  );

  const dataRows = rows
  .slice(headerIndex + 1)
  .filter(
    (row) =>
      Array.isArray(row) &&
      row.some((value) => String(value).trim() !== "")
  );

  const batch = await prisma.importBatch.create({
  data: {
    companyId: activeCompanyId,
    bankAccountId,
    fileName: file.name,
    sourceType: "BANK_XLSX",
    status: "NEW",
  },
});

for (let index = 0; index < dataRows.length; index++) {
  const row = dataRows[index];

  const date = parseIcelandicDate(row[0]);
  const counterparty = String(row[1] ?? "").trim();
  const counterpartyKennitala = String(row[2] ?? "").trim();
  const reference = String(row[3] ?? "").trim();
  const textKey = String(row[4] ?? "").trim();
  const amount = parseIcelandicAmount(row[5]);
  const balance = String(row[6] ?? "").trim();

  await prisma.importRow.create({
    data: {
      importBatchId: batch.id,
      rowNumber: index + 1,
      date,
      text: counterparty || textKey || reference || "Bankafærsla",
      debit: amount && amount < 0 ? Math.abs(amount) : 0,
      credit: amount && amount > 0 ? amount : 0,
      status: date && amount !== null ? "NEW" : "ERROR",
      errorMessage:
        !date
          ? "Dagsetning fannst ekki."
          : amount === null
            ? "Upphæð fannst ekki."
            : null,
      rawData: JSON.stringify({
        counterparty,
        counterpartyKennitala,
        reference,
        textKey,
        amount,
        balance,
      }),
    },
  });
}

redirect(`/banki/${bankAccountId}/innflutningur/${batch.id}`);
}