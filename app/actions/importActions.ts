"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { requireCompanyUploadAccess } from "@/lib/core/access-control";

export async function createImportBatch(formData: FormData) {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);

  await requireCompanyUploadAccess(companyId);

  const file = formData.get("file");

  if (!(file instanceof File)) {
    throw new Error("Skrá vantar.");
  }

  if (!file.name) {
    throw new Error("Skráarnafn vantar.");
  }

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension !== "csv" && extension !== "xlsx" && extension !== "xls") {
    throw new Error("Aðeins CSV eða Excel skrár eru leyfðar.");
  }

  const fileText = await file.text();

  const lines = fileText
  .split(/\r?\n/)
  .filter((line) => line.trim().length > 0);

  const [headerLine, ...dataLines] = lines;

if (!headerLine || dataLines.length === 0) {
  throw new Error("CSV skráin inniheldur engar bókunarlínur.");
}

const headers = headerLine.split(",").map((header) => header.trim());

const expectedHeaders = [
  "voucherNumber",
  "date",
  "account",
  "text",
  "debit",
  "credit",
];

if (headers.join(",") !== expectedHeaders.join(",")) {
  throw new Error("CSV fyrirsagnir eru ekki á réttu sniði.");
}

const parsedRows = dataLines.map((line, index) => {
  const values = line.split(",");

  if (values.length !== expectedHeaders.length) {
    throw new Error(`Rangt dálkafjöldaform á línu ${index + 2}.`);
  }

  const [
    voucherNumber,
    date,
    account,
    text,
    debit,
    credit,
  ] = values.map((value) => value.trim());

  return {
    rowNumber: index + 2,
    voucherNumber: voucherNumber ? Number(voucherNumber) : null,
    date: date ? new Date(date) : null,
    account: account || null,
    text: text || null,
    debit: debit ? Number(debit) : 0,
    credit: credit ? Number(credit) : 0,
    status: "NEW",
    rawData: line,
  };
});

  const importBatch = await prisma.importBatch.create({
  data: {
    companyId,
    fileName: file.name,
    sourceType: extension === "csv" ? "CSV" : "EXCEL",
    status: "NEW",
    rows: {
      create: parsedRows,
    },
  },
});

  redirect(`/innflutningur/${importBatch.id}`);
}

export async function validateImportBatch(importBatchId: number) {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki.");
  }

  const companyId = Number(activeCompanyId);

  await requireCompanyUploadAccess(companyId);

  const importBatch = await prisma.importBatch.findFirst({
    where: {
      id: importBatchId,
      companyId,
    },
    include: {
      rows: true,
    },
  });

  if (!importBatch) {
    throw new Error("Innflutningur fannst ekki.");
  }

  const totalDebit = importBatch.rows.reduce(
  (sum, row) => sum + row.debit,
  0
);

const totalCredit = importBatch.rows.reduce(
  (sum, row) => sum + row.credit,
  0
);

if (Math.abs(totalDebit - totalCredit) >= 0.01) {
  throw new Error("Debet og kredit stemma ekki.");
}

const accountNumbers = [
  ...new Set(
    importBatch.rows
      .map((row) => row.account)
      .filter((account): account is string => Boolean(account))
  ),
];

const existingAccounts = await prisma.account.findMany({
  where: {
    companyId,
    number: {
      in: accountNumbers,
    },
  },
  select: {
    number: true,
  },
});

const existingAccountNumbers = new Set(
  existingAccounts.map((account) => account.number)
);

const missingAccounts = accountNumbers.filter(
  (account) => !existingAccountNumbers.has(account)
);

if (missingAccounts.length > 0) {
  throw new Error(
    `Reikningslyklar finnast ekki: ${missingAccounts.join(", ")}`
  );
}

await prisma.importBatch.update({
  where: {
    id: importBatch.id,
  },
  data: {
    status: "VALIDATED",
  },
});

return {
  success: true,
};
}

export async function postImportBatch(importBatchId: number) {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    throw new Error("Ekkert virkt fyrirtæki.");
  }

  const companyId = Number(activeCompanyId);

  await requireCompanyUploadAccess(companyId);

  const importBatch = await prisma.importBatch.findFirst({
    where: {
      id: importBatchId,
      companyId,
    },
    include: {
      rows: true,
    },
  });

  if (!importBatch) {
    throw new Error("Innflutningur fannst ekki.");
  }

  if (importBatch.status !== "VALIDATED") {
    throw new Error(
      "Innflutningur verður að vera yfirfarinn áður en hægt er að bóka hann."
    );
  }

  const totalDebit = importBatch.rows.reduce(
  (sum, row) => sum + row.debit,
  0
);

const totalCredit = importBatch.rows.reduce(
  (sum, row) => sum + row.credit,
  0
);

if (Math.abs(totalDebit - totalCredit) >= 0.01) {
  throw new Error("Debet og kredit stemma ekki.");
}

const accountNumbers = [
  ...new Set(
    importBatch.rows
      .map((row) => row.account)
      .filter((account): account is string => Boolean(account))
  ),
];

const existingAccounts = await prisma.account.findMany({
  where: {
    companyId,
    number: {
      in: accountNumbers,
    },
  },
  select: {
    number: true,
  },
});

const existingAccountNumbers = new Set(
  existingAccounts.map((account) => account.number)
);

const missingAccounts = accountNumbers.filter(
  (account) => !existingAccountNumbers.has(account)
);

if (missingAccounts.length > 0) {
  throw new Error(
    `Reikningslyklar finnast ekki: ${missingAccounts.join(", ")}`
  );
}

const rowsByVoucher = new Map<number, typeof importBatch.rows>();

for (const row of importBatch.rows) {
  if (row.voucherNumber == null) {
    throw new Error(
      `Fylgiskjalsnúmer vantar á línu ${row.rowNumber}.`
    );
  }

  const rows = rowsByVoucher.get(row.voucherNumber) ?? [];
  rows.push(row);
  rowsByVoucher.set(row.voucherNumber, rows);
}

const importedVoucherNumbers = Array.from(rowsByVoucher.keys());

const existingVouchers = await prisma.receipt.findMany({
  where: {
    companyId,
    voucherNumber: {
      in: importedVoucherNumbers,
    },
  },
  select: {
    voucherNumber: true,
  },
});

if (existingVouchers.length > 0) {
  const duplicateNumbers = existingVouchers
    .map((receipt) => receipt.voucherNumber)
    .filter((number): number is number => number !== null);

  throw new Error(
    `Fylgiskjalsnúmer eru þegar til: ${duplicateNumbers.join(", ")}`
  );
}

const highestImportedVoucherNumber =
  importedVoucherNumbers.length > 0
    ? Math.max(...importedVoucherNumbers)
    : null;

    
for (const [voucherNumber, rows] of rowsByVoucher) {
  const voucherDebit = rows.reduce(
    (sum, row) => sum + row.debit,
    0
  );

  const voucherCredit = rows.reduce(
    (sum, row) => sum + row.credit,
    0
  );

  if (Math.abs(voucherDebit - voucherCredit) >= 0.01) {
    throw new Error(
      `Fylgiskjal ${voucherNumber} stemmir ekki í debet og kredit.`
    );
  }
}

  await prisma.$transaction(async (tx) => {
    for (const [voucherNumber, rows] of rowsByVoucher) {
      const firstRow = rows[0];

      if (!firstRow) {
        throw new Error(
          `Engar línur fundust fyrir fylgiskjal ${voucherNumber}.`
        );
      }

      if (rows.some((row) => !row.account)) {
        throw new Error(
          `Reikningslykil vantar á fylgiskjal ${voucherNumber}.`
        );
      }

      const voucherAmount = rows.reduce(
        (sum, row) => sum + row.debit,
        0
      );

      const receipt = await tx.receipt.create({
        data: {
          date: firstRow.date,
          description:
            firstRow.text?.trim() ||
            `Innflutt fylgiskjal ${voucherNumber}`,
          amount: voucherAmount,
          status: "APPROVED",
          voucherNumber,
          companyId,
        },
      });

      try {
        await tx.voucherNumberReservation.create({
          data: {
            companyId,
            voucherNumber,
            sourceType: "IMPORT_BATCH",
            sourceId: importBatch.id,
          },
        });
      } catch {
        throw new Error(
          `Fylgiskjalsnúmer ${voucherNumber} var tekið á meðan innflutningur fór fram.`
        );
      }

      await tx.receiptEntry.createMany({
        data: rows.map((row) => ({
          account: row.account!,
          text:
            row.text?.trim() ||
            `Innflutningur fylgiskjal ${voucherNumber}`,
          debit: row.debit,
          credit: row.credit,
          receiptId: receipt.id,
        })),
      });

      await tx.importRow.updateMany({
        where: {
          importBatchId: importBatch.id,
          voucherNumber,
        },
        data: {
          status: "POSTED",
          errorMessage: null,
        },
      });
    }

    await tx.importBatch.update({
      where: {
        id: importBatch.id,
      },
      data: {
        status: "POSTED",
      },
    });

    if (highestImportedVoucherNumber !== null) {
      const company = await tx.company.findUnique({
        where: {
          id: companyId,
        },
        select: {
          nextVoucherNumber: true,
        },
      });

      if (!company) {
        throw new Error("Fyrirtæki fannst ekki.");
      }

      if (
        company.nextVoucherNumber <=
        highestImportedVoucherNumber
      ) {
        await tx.company.update({
          where: {
            id: companyId,
          },
          data: {
            nextVoucherNumber:
              highestImportedVoucherNumber + 1,
          },
        });
      }
    }
  });
}