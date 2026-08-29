import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";
import Link from "next/link";
import { redirect } from "next/navigation";

export default async function CompanyTrialBalancePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    from?: string;
    to?: string;
  }>;
}) {
  const { id } = await params;
  const companyId = Number(id);

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  if (activeUser.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: activeUser.id,
          companyId,
        },
      },
    });

    if (!access || !access.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const { from, to } = await searchParams;

  const fromDate = from
    ? new Date(`${from}T00:00:00.000Z`)
    : null;

  const toDate = to
    ? new Date(`${to}T23:59:59.999Z`)
    : null;

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
      accounts: {
        where: {
          isActive: true,
        },
        orderBy: {
          number: "asc",
        },
        select: {
          id: true,
          number: true,
          name: true,
        },
      },
    },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const aiDocuments =
    await prisma.aiDetectedDocument.findMany({
      where: {
        receipt: {
          companyId,
        },
        approvedAt: {
          not: null,
        },
        voucherNumber: {
          not: null,
        },
      },
      include: {
        bookingEntries: true,
      },
    });

  const aiReceiptIds = new Set(
    aiDocuments.map((document) => document.receiptId)
  );

  const otherReceipts =
    await prisma.receipt.findMany({
      where: {
        companyId,
        status: "APPROVED",
        voucherNumber: {
          not: null,
        },
        id: {
          notIn: Array.from(aiReceiptIds),
        },
      },
      include: {
        entries: true,
      },
    });

  const rows = [
    ...aiDocuments.flatMap((document) =>
      document.bookingEntries.map((entry) => ({
        date: document.date,
        account: entry.account,
        debit: entry.debit,
        credit: entry.credit,
      }))
    ),

    ...otherReceipts.flatMap((receipt) =>
      receipt.entries.map((entry) => ({
        date: receipt.aiDate ?? receipt.date,
        account: entry.account,
        debit: entry.debit,
        credit: entry.credit,
      }))
    ),
  ];

  const filteredRows = rows.filter((row) => {
    if (
      fromDate &&
      row.date &&
      row.date < fromDate
    ) {
      return false;
    }

    if (
      toDate &&
      row.date &&
      row.date > toDate
    ) {
      return false;
    }

    if ((fromDate || toDate) && !row.date) {
      return false;
    }

    return true;
  });

  const totalDebit = filteredRows.reduce(
    (sum, row) => sum + row.debit,
    0
  );

  const totalCredit = filteredRows.reduce(
    (sum, row) => sum + row.credit,
    0
  );

  const difference = totalDebit - totalCredit;

  return (
    <main className="mx-auto max-w-6xl p-6">
      <div className="mb-6">
        <Link
          href={`/fyrirtaeki/${company.id}/gogn`}
          className="text-blue-700 hover:underline"
        >
          ← Til baka í gögn
        </Link>
      </div>

      <h1 className="text-3xl font-bold">
        Stöðulisti / Prufujöfnuður
      </h1>

      <p className="mt-2 text-slate-600">
        {company.name}
      </p>

      {fromDate && toDate && (
        <p className="mt-1 text-sm text-slate-500">
          Tímabil: {formatDate(fromDate)} –{" "}
          {formatDate(toDate)}
        </p>
      )}

      <form className="mt-6 flex flex-wrap items-end gap-4">
        <div>
          <label
            htmlFor="from"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Frá
          </label>

          <IcelandicDateInput
            name="from"
            defaultValue={from ?? ""}
            submitFormat="iso"
          />
        </div>

        <div>
          <label
            htmlFor="to"
            className="mb-1 block text-sm font-medium text-slate-700"
          >
            Til
          </label>

          <IcelandicDateInput
            name="to"
            defaultValue={to ?? ""}
            submitFormat="iso"
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-700"
        >
          Sýna tímabil
        </button>

        {(from || to) && (
          <Link
            href={`/fyrirtaeki/${company.id}/gogn/stodulisti`}
            className="rounded-lg border px-4 py-2 font-medium hover:bg-slate-50"
          >
            Hreinsa tímabil
          </Link>
        )}
      </form>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-slate-500">
            Samtals debet
          </div>

          <div className="mt-1 text-xl font-bold">
            {formatNumber(totalDebit)} kr.
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-slate-500">
            Samtals kredit
          </div>

          <div className="mt-1 text-xl font-bold">
            {formatNumber(totalCredit)} kr.
          </div>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="text-sm text-slate-500">
            Mismunur
          </div>

          <div className="mt-1 text-xl font-bold">
            {formatNumber(difference)} kr.
          </div>

          <div className="mt-1 text-sm font-semibold">
            {difference === 0
              ? "✓ Prufujöfnuður stemmir"
              : "⚠ Prufujöfnuður stemmir ekki"}
          </div>
        </div>
      </div>

      <div className="mt-8 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b px-4 py-3 text-left">
                Lykill
              </th>

              <th className="border-b px-4 py-3 text-left">
                Heiti
              </th>

              <th className="border-b px-4 py-3 text-right">
                Debet
              </th>

              <th className="border-b px-4 py-3 text-right">
                Kredit
              </th>

              <th className="border-b px-4 py-3 text-right">
                Staða
              </th>
            </tr>
          </thead>

          <tbody>
            {company.accounts.map((account) => {
              const accountRows = filteredRows.filter(
                (row) =>
                  row.account === account.number
              );

              const debit = accountRows.reduce(
                (sum, row) => sum + row.debit,
                0
              );

              const credit = accountRows.reduce(
                (sum, row) => sum + row.credit,
                0
              );

              const balance = debit - credit;

              return (
                <tr key={account.id}>
                  <td className="border-b px-4 py-3 font-medium">
                    {account.number}
                  </td>

                  <td className="border-b px-4 py-3">
                    {account.name}
                  </td>

                  <td className="border-b px-4 py-3 text-right">
                    {formatNumber(debit)} kr.
                  </td>

                  <td className="border-b px-4 py-3 text-right">
                    {formatNumber(credit)} kr.
                  </td>

                  <td className="border-b px-4 py-3 text-right font-semibold">
                    {formatNumber(balance)} kr.
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}