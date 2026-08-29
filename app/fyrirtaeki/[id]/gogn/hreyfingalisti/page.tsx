import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import PrintButton from "@/components/PrintButton";
import Link from "next/link";
import { redirect } from "next/navigation";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";

const formatKr = (amount: number) =>
  formatNumber(amount, {
    maximumFractionDigits: 0,
  });

export default async function CompanyLedgerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    account?: string;
    from?: string;
    to?: string;
    sort?: string;
  }>;
}) {
  const { id } = await params;
  const { account, from, to, sort } = await searchParams;

  const companyId = Number(id);
  const accountSearch = account?.trim() ?? "";

  const sortOption = sort ?? "date";

  const fromDate = from
    ? new Date(`${from}T00:00:00.000Z`)
    : null;

  const toDate = to
    ? new Date(`${to}T23:59:59.999Z`)
    : null;

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  if (activeUser.role !== "ADMIN") {
    const access =
      await prisma.userCompany.findUnique({
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

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
      kennitala: true,
      isActive: true,
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
    aiDocuments.map(
      (document) => document.receiptId
    )
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
        id: `AI-${document.id}-${entry.id}`,
        voucherNumber: document.voucherNumber!,
        date: document.date,
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
      }))
    ),

    ...otherReceipts.flatMap((receipt) =>
      receipt.entries.map((entry) => ({
        id: `RECEIPT-${receipt.id}-${entry.id}`,
        voucherNumber: receipt.voucherNumber!,
        date: receipt.aiDate ?? receipt.date,
        account: entry.account,
        text: entry.text,
        debit: entry.debit,
        credit: entry.credit,
      }))
    ),
  ]
    .filter((row) => {
      if (
        accountSearch &&
        !row.account
          .toLowerCase()
          .includes(accountSearch.toLowerCase())
      ) {
        return false;
      }

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
    })
    .sort((a, b) => {
      if (sortOption === "voucher") {
        const voucherDifference =
          a.voucherNumber - b.voucherNumber;

        if (voucherDifference !== 0) {
          return voucherDifference;
        }

        return (
          (a.date?.getTime() ?? 0) -
          (b.date?.getTime() ?? 0)
        );
      }

      const dateDifference =
        (a.date?.getTime() ?? 0) -
        (b.date?.getTime() ?? 0);

      if (dateDifference !== 0) {
        return dateDifference;
      }

      return a.voucherNumber - b.voucherNumber;
    });

  const totalDebit = rows.reduce(
    (sum, row) => sum + row.debit,
    0
  );

  const totalCredit = rows.reduce(
    (sum, row) => sum + row.credit,
    0
  );

  const groupedRows = rows.reduce<
    Array<{
      key: string;
      date: Date | null;
      voucherNumber: number;
      entries: typeof rows;
    }>
  >((groups, row) => {
    const key =
      `${row.voucherNumber}-${row.date?.toISOString().slice(0, 10) ?? "no-date"}`;

    const lastGroup = groups[groups.length - 1];

    if (lastGroup?.key === key) {
      lastGroup.entries.push(row);
    } else {
      groups.push({
        key,
        date: row.date,
        voucherNumber: row.voucherNumber,
        entries: [row],
      });
    }

    return groups;
  }, []);

  return (
    <main className="p-8">
      <Link
        href={`/fyrirtaeki/${company.id}/gogn`}
        className="text-sm font-medium text-blue-700 hover:text-blue-900 print:hidden"
      >
        ← Til baka í gögn fyrirtækis
      </Link>

      <div className="hidden print:block">
        <p className="text-xl font-bold">
          GLÖGGT
        </p>

        <p className="mt-1 text-sm">
          Hreyfingalisti
        </p>

        <p className="mt-1 text-sm">
          {company.name} · {company.kennitala}
        </p>

        <p className="mt-1 text-sm">
          Tímabil: {from ?? "—"} – {to ?? "—"}
        </p>

        <p className="mt-1 text-sm">
          Reikningur: {accountSearch || "Allir"}
        </p>
      </div>

      <div className="mt-4 print:hidden">
        <h1 className="text-3xl font-bold">
          Hreyfingalisti
        </h1>

        <p className="mt-1 text-slate-600">
          {company.name} · {company.kennitala}
        </p>
      </div>

      {!company.isActive && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            LESHAMUR
          </p>

          <p className="mt-1 text-sm text-amber-800">
            Hreyfingarnar eru eingöngu til
            skoðunar og útprentunar.
          </p>
        </div>
      )}

      <form
        method="GET"
        className="mt-6 flex flex-wrap items-end gap-3 print:hidden"
      >
        <label>
          <span className="mb-1 block font-semibold">
            Frá
          </span>

          <IcelandicDateInput
            name="from"
            defaultValue={from ?? ""}
            submitFormat="iso"
          />
        </label>

        <label>
          <span className="mb-1 block font-semibold">
            Til
          </span>

          <IcelandicDateInput
            name="to"
            defaultValue={to ?? ""}
            submitFormat="iso"
          />
        </label>

        <label>
          <span className="mb-1 block font-semibold">
            Reikningur
          </span>

          <input
            type="text"
            name="account"
            defaultValue={accountSearch}
            placeholder="t.d. 2520"
            className="w-48 rounded border px-3 py-2"
          />
        </label>

        <label>
          <span className="mb-1 block font-semibold">
            Raða eftir
          </span>

          <select
            name="sort"
            defaultValue={sortOption}
            className="rounded border px-3 py-2"
          >
            <option value="date">
              Dagsetningu
            </option>

            <option value="voucher">
              Fylgiskjali
            </option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Leita
        </button>

        {(accountSearch ||
          from ||
          to ||
          sortOption !== "date") && (
          <Link
            href={`/fyrirtaeki/${company.id}/gogn/hreyfingalisti`}
            className="rounded border px-4 py-2 hover:bg-slate-50"
          >
            Hreinsa
          </Link>
        )}
      </form>

      <div className="mt-6 grid gap-3 md:grid-cols-3 print:hidden">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-slate-500">
            Færslulínur
          </p>

          <p className="mt-1 text-2xl font-bold">
            {rows.length}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm text-slate-500">
            Debet
          </p>

          <p className="mt-1 text-2xl font-bold">
            {formatKr(totalDebit)} kr.
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm text-slate-500">
                Kredit
              </p>

              <p className="mt-1 text-2xl font-bold">
                {formatKr(totalCredit)} kr.
              </p>
            </div>

            <PrintButton />
          </div>
        </div>
      </div>

      <div className="hidden print:block">
        <p className="mt-2 text-sm font-semibold">
          Færslulínur: {rows.length}
          {" · "}Debet: {formatKr(totalDebit)} kr.
          {" · "}Kredit: {formatKr(totalCredit)} kr.
        </p>
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="ledger-print-table w-full border-collapse text-left">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b p-3">
                Dagsetning
              </th>

              <th className="border-b p-3">
                Fylgiskjal
              </th>

              <th className="border-b p-3">
                Reikningur
              </th>

              <th className="border-b p-3">
                Texti
              </th>

              <th className="border-b p-3 text-right">
                Debet
              </th>

              <th className="border-b p-3 text-right">
                Kredit
              </th>
            </tr>
          </thead>

          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-slate-500"
                >
                  Engar bókhaldshreyfingar fundust.
                </td>
              </tr>
            ) : (
              groupedRows.map((group) => (
                <tr key={group.key}>
                  <td className="border-b p-3 align-top">
                    {group.date
                      ? formatDate(group.date)
                      : "—"}
                  </td>

                  <td className="border-b p-3 align-top font-semibold">
                    {group.voucherNumber}
                  </td>

                  <td className="border-b p-3 align-top font-semibold">
                    {group.entries.map((entry) => (
                      <div key={`account-${entry.id}`}>
                        {entry.account}
                      </div>
                    ))}
                  </td>

                  <td className="border-b p-3 align-top">
                    {group.entries.map((entry) => (
                      <div key={`text-${entry.id}`}>
                        {entry.text}
                      </div>
                    ))}
                  </td>

                  <td className="border-b p-3 align-top text-right whitespace-nowrap">
                    {group.entries.map((entry) => (
                      <div key={`debit-${entry.id}`}>
                        {entry.debit
                          ? `${formatKr(entry.debit)} kr.`
                          : "—"}
                      </div>
                    ))}
                  </td>

                  <td className="border-b p-3 align-top text-right whitespace-nowrap">
                    {group.entries.map((entry) => (
                      <div key={`credit-${entry.id}`}>
                        {entry.credit
                          ? `${formatKr(entry.credit)} kr.`
                          : "—"}
                      </div>
                    ))}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}