import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import BookedDocumentRow from "@/components/BookedDocumentRow";
import { getEffectiveUser } from "@/lib/core/access-control";

export default async function CompanyBookedDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    q?: string;
    sort?: string;
  }>;
}) {
  const { id } = await params;
  const { q, sort } = await searchParams;

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

  const sortOption = sort ?? "voucher-desc";
  const searchVoucherNumber = q ? Number(q) : null;

  const aiDocuments = await prisma.aiDetectedDocument.findMany({
    where: {
      receipt: {
        companyId,
      },
      approvedAt: {
        not: null,
      },
      voucherNumber:
        searchVoucherNumber !== null &&
        Number.isFinite(searchVoucherNumber)
          ? searchVoucherNumber
          : {
              not: null,
            },
    },
    include: {
      receipt: true,
      bookingEntries: true,
    },
  });

  const aiReceiptIds = new Set(
    aiDocuments.map((document) => document.receiptId)
  );

  const importedReceipts = await prisma.receipt.findMany({
    where: {
      companyId,
      status: "APPROVED",
      voucherNumber:
        searchVoucherNumber !== null &&
        Number.isFinite(searchVoucherNumber)
          ? searchVoucherNumber
          : {
              not: null,
            },
    },
    include: {
      entries: true,
    },
  });

  const bookedDocuments = [
    ...aiDocuments.map((document) => ({
      source: "AI" as const,
      id: document.id,
      receiptId: document.receiptId,
      voucherNumber: document.voucherNumber!,
      date: document.date,
      merchantName: document.merchantName,
      merchantKennitala: document.merchantKennitala,
      totalAmount: document.totalAmount,
      bookingEntries: document.bookingEntries,
    })),

    ...importedReceipts
      .filter((receipt) => !aiReceiptIds.has(receipt.id))
      .map((receipt) => ({
        source: "RECEIPT" as const,
        id: receipt.id,
        receiptId: receipt.id,
        voucherNumber: receipt.voucherNumber!,
        date: receipt.date,
        merchantName:
          receipt.merchantName ?? receipt.description,
        merchantKennitala: receipt.merchantKennitala,
        totalAmount: receipt.amount,
        bookingEntries: receipt.entries,
      })),
  ];

  bookedDocuments.sort((a, b) => {
    if (sortOption === "voucher-asc") {
      return a.voucherNumber - b.voucherNumber;
    }

    if (sortOption === "date-desc") {
      return (
        (b.date?.getTime() ?? 0) -
        (a.date?.getTime() ?? 0)
      );
    }

    if (sortOption === "date-asc") {
      return (
        (a.date?.getTime() ?? 0) -
        (b.date?.getTime() ?? 0)
      );
    }

    return b.voucherNumber - a.voucherNumber;
  });

  return (
    <main className="p-8">
      <Link
        href={`/fyrirtaeki/${company.id}/gogn`}
        className="text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        ← Til baka í gögn fyrirtækis
      </Link>

      <div className="mt-4">
        <h1 className="text-3xl font-bold">
          Bókuð fylgiskjöl
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
            Gögnin eru eingöngu til skoðunar.
          </p>
        </div>
      )}

      <form className="mt-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block font-semibold">
            Leita að fylgiskjali
          </span>

          <input
            type="number"
            name="q"
            defaultValue={q ?? ""}
            placeholder="t.d. 476"
            className="w-48 rounded border px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-semibold">
            Raða eftir
          </span>

          <select
            name="sort"
            defaultValue={sortOption}
            className="rounded border px-3 py-2"
          >
            <option value="voucher-desc">
              Fylgiskjal – nýjasta fyrst
            </option>

            <option value="voucher-asc">
              Fylgiskjal – elsta fyrst
            </option>

            <option value="date-desc">
              Dagsetning – nýjasta fyrst
            </option>

            <option value="date-asc">
              Dagsetning – elsta fyrst
            </option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Leita
        </button>

        {q && (
          <Link
            href={`/fyrirtaeki/${company.id}/gogn/fylgiskjol`}
            className="rounded border px-4 py-2 hover:bg-slate-50"
          >
            Hreinsa leit
          </Link>
        )}
      </form>

      <div className="mt-6 overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b p-3">
                Fylgiskjal
              </th>

              <th className="border-b p-3">
                Dagsetning
              </th>

              <th className="border-b p-3">
                Seljandi
              </th>

              <th className="border-b p-3">
                Kennitala
              </th>

              <th className="border-b p-3">
                Upphæð
              </th>

              <th className="border-b p-3">
                Bókun
              </th>
            </tr>
          </thead>

          <tbody>
            {bookedDocuments.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="p-6 text-center text-slate-500"
                >
                  Engin bókuð fylgiskjöl fundust.
                </td>
              </tr>
            ) : (
              bookedDocuments.map((document) => (
                <BookedDocumentRow
                  key={`${document.source}-${document.id}`}
                  href={
                    document.source === "RECEIPT"
                      ? `/fylgiskjol/bokud/${document.voucherNumber}`
                      : `/fylgiskjol/${document.receiptId}?document=${document.id}`
                  }
                >
                  <td className="border-b p-3 font-semibold">
                    {document.voucherNumber}
                  </td>

                  <td className="border-b p-3">
                    {document.date
                      ? formatDate(document.date)
                      : "—"}
                  </td>

                  <td className="border-b p-3">
                    {document.merchantName ?? "—"}
                  </td>

                  <td className="border-b p-3">
                    {document.merchantKennitala ?? "—"}
                  </td>

                  <td className="border-b p-3">
                    {formatNumber(document.totalAmount ?? 0)} kr.
                  </td>

                  <td className="border-b p-3">
                    {document.bookingEntries
                      .map((entry) => entry.account)
                      .join(", ")}
                  </td>
                </BookedDocumentRow>
              ))
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}