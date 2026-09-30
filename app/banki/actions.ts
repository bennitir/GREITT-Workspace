"use server";

import { createHash } from "crypto";
import * as XLSX from "xlsx";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@/app/generated/prisma/client";
import { getCompanyAccess } from "@/lib/core/access-control";
import {
  confirmBankFinancialEventPayment as confirmBankFinancialEventPaymentCore,
} from "@/lib/financial-reconciliation/event-confirmation";
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

export async function confirmBankFinancialEventPayment(formData: FormData) {
  const companyId = Number(formData.get("companyId"));
  const bankTransactionId = Number(formData.get("bankTransactionId"));
  const eventId = Number(formData.get("eventId"));

  if (
    !Number.isSafeInteger(companyId) ||
    companyId < 1 ||
    !Number.isSafeInteger(bankTransactionId) ||
    bankTransactionId < 1 ||
    !Number.isSafeInteger(eventId) ||
    eventId < 1
  ) {
    throw new Error("INVALID_CONFIRMATION_ID");
  }

  const { userId } = await bankContext(companyId);
  const access = await getCompanyAccess(companyId);

  if (!access.allowed || !access.canReconcileBookkeeping) {
    throw new Error("RECONCILIATION_ACCESS_DENIED");
  }

  const result = await confirmBankFinancialEventPaymentCore({
    companyId,
    userId,
    bankTransactionId,
    eventId,
  });

  const bankTransaction = await prisma.bankTransaction.findUnique({
    where: { id: result.bankTransactionId },
    select: { bankAccountId: true },
  });

  revalidatePath("/banki");
  if (bankTransaction) {
    revalidatePath(`/banki/${bankTransaction.bankAccountId}`);
    revalidatePath(`/banki/${bankTransaction.bankAccountId}/afstemming`);
  }
  revalidatePath("/innsyn");

  return result;
}

export async function confirmFinancialEventPaymentAllocation(formData: FormData) {
  const allocationId = Number(formData.get("allocationId"));
  if (!Number.isInteger(allocationId) || allocationId < 1) {
    throw new Error("Ógild greiðsluúthlutun.");
  }

  // Fyrsta uppfletting finnur aðeins fyrirtækið sem á færsluna svo heimildir
  // séu staðfestar áður en nokkur breyting er gerð. Allar fjárhagslegar
  // forsendur eru síðan lesnar aftur inni í SERIALIZABLE transaction.
  const target = await prisma.financialEventPaymentAllocation.findUnique({
    where: { id: allocationId },
    select: {
      payment: {
        select: {
          event: { select: { companyId: true } },
        },
      },
    },
  });

  if (!target) throw new Error("Greiðsluúthlutun fannst ekki.");

  const companyId = target.payment.event.companyId;
  const { userId } = await bankContext(companyId);
  const access = await getCompanyAccess(companyId);

  if (!access.allowed || !access.canReconcileBookkeeping) {
    throw new Error("Þú hefur ekki heimild til að afstemma greiðslur.");
  }

  const confirmedAt = new Date();

  const result = await prisma.$transaction(
    async (tx) => {
      const allocation = await tx.financialEventPaymentAllocation.findUnique({
        where: { id: allocationId },
        include: {
          payment: {
            include: {
              event: true,
              bankTransaction: {
                include: { bankAccount: true },
              },
            },
          },
          scheduleItem: true,
        },
      });

      if (!allocation) throw new Error("Greiðsluúthlutun fannst ekki.");

      const { payment, scheduleItem } = allocation;
      const { event, bankTransaction } = payment;

      if (event.companyId !== companyId) {
        throw new Error("Fyrirtæki greiðslu breyttist við staðfestingu.");
      }
      if (bankTransaction.bankAccount.companyId !== companyId) {
        throw new Error("Bankafærsla tilheyrir ekki sama fyrirtæki og skuldbindingin.");
      }
      if (scheduleItem.eventId !== event.id) {
        throw new Error("Gjalddagi tilheyrir ekki sömu skuldbindingu og greiðslan.");
      }
      if (allocation.status !== "PROPOSED") {
        throw new Error("Aðeins má staðfesta greiðsluúthlutun sem er PROPOSED.");
      }
      if (payment.status !== "PROPOSED") {
        throw new Error("Greiðslan sjálf er ekki lengur PROPOSED.");
      }
      if (scheduleItem.status === "CANCELLED") {
        throw new Error("Ekki má staðfesta greiðslu á felldan gjalddaga.");
      }
      if (
        payment.currency !== event.currency ||
        scheduleItem.currency !== event.currency
      ) {
        throw new Error("Gjaldmiðill greiðslu, skuldbindingar og gjalddaga stemmir ekki.");
      }

      const zero = new Prisma.Decimal(0);
      const allocationAmount = allocation.amount;
      const paymentAmount = payment.amount;
      const scheduleAmount = scheduleItem.amount;
      const bankAmount = bankTransaction.amount.abs();

      if (
        allocationAmount.lte(zero) ||
        paymentAmount.lte(zero) ||
        scheduleAmount.lte(zero) ||
        bankAmount.lte(zero)
      ) {
        throw new Error("Upphæðir í greiðsluafstemmingu verða að vera stærri en núll.");
      }
      if (allocationAmount.gt(paymentAmount)) {
        throw new Error("Úthlutun er hærri en greiðslan.");
      }
      if (allocationAmount.gt(scheduleAmount)) {
        throw new Error("Úthlutun er hærri en gjalddaginn.");
      }
      if (paymentAmount.gt(bankAmount)) {
        throw new Error("Greiðslan er hærri en bankafærslan.");
      }

      const [otherPaymentAllocations, otherScheduleAllocations, otherBankPayments] =
        await Promise.all([
          tx.financialEventPaymentAllocation.aggregate({
            where: {
              paymentId: payment.id,
              status: "CONFIRMED",
              id: { not: allocation.id },
            },
            _sum: { amount: true },
          }),
          tx.financialEventPaymentAllocation.aggregate({
            where: {
              scheduleItemId: scheduleItem.id,
              status: "CONFIRMED",
              id: { not: allocation.id },
            },
            _sum: { amount: true },
          }),
          tx.financialEventPayment.aggregate({
            where: {
              bankTransactionId: bankTransaction.id,
              status: "CONFIRMED",
              id: { not: payment.id },
            },
            _sum: { amount: true },
          }),
        ]);

      const paymentConfirmedAfter = (
        otherPaymentAllocations._sum.amount ?? zero
      ).plus(allocationAmount);
      const schedulePaidAfter = (
        otherScheduleAllocations._sum.amount ?? zero
      ).plus(allocationAmount);

      if (paymentConfirmedAfter.gt(paymentAmount)) {
        throw new Error("Staðfestar úthlutanir fara yfir greiðsluupphæð.");
      }
      if (schedulePaidAfter.gt(scheduleAmount)) {
        throw new Error("Staðfestar greiðslur fara yfir gjalddagaupphæð.");
      }

      const paymentFullyConfirmed = paymentConfirmedAfter.eq(paymentAmount);
      const scheduleStatus = schedulePaidAfter.eq(scheduleAmount)
        ? "PAID"
        : schedulePaidAfter.gt(zero)
          ? "PARTIALLY_PAID"
          : "OPEN";

      const bankConfirmedAfter = (
        otherBankPayments._sum.amount ?? zero
      ).plus(paymentFullyConfirmed ? paymentAmount : zero);

      if (bankConfirmedAfter.gt(bankAmount)) {
        throw new Error("Staðfestar greiðslutengingar fara yfir bankafærsluna.");
      }

      const bankFullyReconciled = bankConfirmedAfter.eq(bankAmount);

      await tx.financialEventPaymentAllocation.update({
        where: { id: allocation.id },
        data: {
          status: "CONFIRMED",
          confirmedAt,
        },
      });

      await tx.financialEventScheduleItem.update({
        where: { id: scheduleItem.id },
        data: {
          paidAmount: schedulePaidAfter,
          status: scheduleStatus,
        },
      });

      if (paymentFullyConfirmed) {
        await tx.financialEventPayment.update({
          where: { id: payment.id },
          data: {
            status: "CONFIRMED",
            confirmedAt,
          },
        });
      }

      if (bankFullyReconciled) {
        await tx.bankTransaction.update({
          where: { id: bankTransaction.id },
          data: { status: "RECONCILED" },
        });
      }

      await tx.auditEvent.create({
        data: {
          companyId,
          userId,
          entityType: "FinancialEventPaymentAllocation",
          entityId: allocation.id,
          action: "CONFIRM_PAYMENT_ALLOCATION",
          parentEntityType: "FinancialEventPayment",
          parentEntityId: payment.id,
          source: "USER",
          description: `Greiðsluúthlutun ${allocation.id} staðfest á gjalddaga ${scheduleItem.sequence}.`,
          beforeData: {
            allocationStatus: allocation.status,
            paymentStatus: payment.status,
            scheduleStatus: scheduleItem.status,
            schedulePaidAmount: scheduleItem.paidAmount.toString(),
            bankTransactionStatus: bankTransaction.status,
          },
          afterData: {
            allocationStatus: "CONFIRMED",
            paymentStatus: paymentFullyConfirmed ? "CONFIRMED" : payment.status,
            scheduleStatus,
            schedulePaidAmount: schedulePaidAfter.toString(),
            bankTransactionStatus: bankFullyReconciled
              ? "RECONCILED"
              : bankTransaction.status,
          },
          metadata: {
            eventId: event.id,
            paymentId: payment.id,
            scheduleItemId: scheduleItem.id,
            bankTransactionId: bankTransaction.id,
            allocationAmount: allocationAmount.toString(),
            paymentConfirmedAmount: paymentConfirmedAfter.toString(),
            bankConfirmedAmount: bankConfirmedAfter.toString(),
            reconciliationVersion: "financial-event-payment-v1",
          },
        },
      });

      return {
        allocationId: allocation.id,
        paymentId: payment.id,
        scheduleItemId: scheduleItem.id,
        bankTransactionId: bankTransaction.id,
        allocationStatus: "CONFIRMED",
        paymentStatus: paymentFullyConfirmed ? "CONFIRMED" : payment.status,
        scheduleStatus,
        schedulePaidAmount: schedulePaidAfter.toString(),
        bankTransactionStatus: bankFullyReconciled
          ? "RECONCILED"
          : bankTransaction.status,
        bankAccountId: bankTransaction.bankAccountId,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );

  revalidatePath("/banki");
  revalidatePath(`/banki/${result.bankAccountId}`);
  revalidatePath("/innsyn");

  return result;
}
