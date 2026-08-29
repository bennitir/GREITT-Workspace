import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

function dateKey(date: Date | null) {
  if (!date) return null;

  return date.toISOString().slice(0, 10);
}

export default async function AfstemmingPage({ params }: Props) {
  const { id } = await params;

  const cookieStore = await cookies();
  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  const bankAccountId = Number(id);

  if (!activeCompanyId || !bankAccountId) {
    notFound();
  }

  const account = await prisma.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      companyId: activeCompanyId,
      isActive: true,
    },
  });

  if (!account) {
    notFound();
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: account.id,
    },
    orderBy: {
      date: "desc",
    },
  });

  const bookedReceipts = await prisma.receipt.findMany({
    where: {
      companyId: activeCompanyId,
      voucherNumber: {
        not: null,
      },
      entries: {
        some: {},
      },
    },
    include: {
      entries: true,
    },
  });

  function daysBetween(a: Date, b: Date) {
  const millisecondsPerDay = 1000 * 60 * 60 * 24;

  return Math.abs(
    Math.round(
      (a.getTime() - b.getTime()) / millisecondsPerDay
    )
  );
}

  const reconciliationRows = transactions.map((transaction) => {
    const transactionDate = dateKey(transaction.date);
    const transactionAmount = Math.abs(Number(transaction.amount));

    const match = bookedReceipts.find((receipt) => {
      const receiptDate = dateKey(receipt.aiDate ?? receipt.date);

      const totalDebit = receipt.entries.reduce(
        (sum, entry) => sum + entry.debit,
        0
      );

      const totalCredit = receipt.entries.reduce(
        (sum, entry) => sum + entry.credit,
        0
      );

      const bookedAmount = Math.max(
        Math.abs(totalDebit),
        Math.abs(totalCredit)
      );

      const closeDate =
  receiptDate &&
  daysBetween(
    transaction.date,
    receipt.aiDate ?? receipt.date!
  ) <= 3;

      const sameAmount =
        Math.abs(transactionAmount - bookedAmount) < 0.01;

        const transactionName = normalizeText(transaction.text);

const receiptName = normalizeText(
  receipt.merchantName ?? receipt.description
);

const sameParty =
  transactionName &&
  receiptName &&
  (
    transactionName.includes(receiptName) ||
    receiptName.includes(transactionName)
  );

      return closeDate && sameAmount && sameParty;
    });



    return {
      transaction,
      match,
    };
  });

  const matchedCount = reconciliationRows.filter(
  ({ match }) => Boolean(match)
).length;

const unmatchedCount =
  reconciliationRows.length - matchedCount;


  function normalizeText(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\b(hf|ehf|sf|slf)\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">⚖️ Afstemming</h1>

      <div className="mt-6 max-w-5xl rounded-lg border p-6">
        <h2 className="text-xl font-semibold">
          {account.bankName}
        </h2>

        <p className="mt-1 text-gray-600">
          {account.accountNumber ?? "Reikningsnúmer ekki skráð"}
        </p>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
  <div className="rounded-lg border bg-gray-50 p-4">
    <p className="text-sm text-gray-600">Bankafærslur</p>
    <p className="mt-1 text-2xl font-bold">
      {reconciliationRows.length}
    </p>
  </div>

  <div className="rounded-lg border bg-green-50 p-4">
    <p className="text-sm text-green-700">Samsvarað</p>
    <p className="mt-1 text-2xl font-bold text-green-700">
      {matchedCount}
    </p>
  </div>

  <div className="rounded-lg border bg-red-50 p-4">
    <p className="text-sm text-red-700">Ósamsvarað</p>
    <p className="mt-1 text-2xl font-bold text-red-700">
      {unmatchedCount}
    </p>
  </div>
</div>

        <div className="mt-6 space-y-3">
          {reconciliationRows.length === 0 ? (
            <p className="text-gray-600">
              Engar bankafærslur til afstemmingar.
            </p>
          ) : (
            reconciliationRows.map(({ transaction, match }) => (
              <div
                key={transaction.id}
                className="rounded-lg border p-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold">
                      {transaction.text}
                    </p>

                    <p className="mt-1 text-sm text-gray-600">
                      {formatDate(transaction.date)}
                    </p>
                  </div>

                  <p className="font-semibold">
                    {formatNumber(Number(transaction.amount))} kr..
                  </p>
                </div>

                <div className="mt-3">
                  {match ? (
                    <>
                      <span className="inline-block rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-700">
                        🟢 Passar
                      </span>

                      <p className="mt-2 text-sm text-gray-600">
                        Fylgiskjal nr.{" "}
                        <strong>{match.voucherNumber}</strong>
                        {" – "}
                        {match.description}
                      </p>
                    </>
                  ) : (
                    <span className="inline-block rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-700">
                      🔴 Engin samsvörun
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </main>
  );
}