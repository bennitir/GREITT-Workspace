import { getEffectiveUser } from "@/lib/core/access-control";
import { formatDate, formatNumber } from "@/lib/locale";
import { redirect } from "next/navigation";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

type SearchParams = {
  q?: string;
  sort?: string;
  status?: string;
};

export default async function SkjalasafnPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, sort, status } = await searchParams;

  const sortOption = sort ?? "date-desc";
  const statusOption = status ?? "all";
  const searchText = q?.trim() ?? "";

  const searchVoucherNumber =
    searchText !== "" && Number.isFinite(Number(searchText))
      ? Number(searchText)
      : null;

  const cookieStore = await cookies();

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  const companyId = activeCompanyId
    ? Number(activeCompanyId)
    : null;

  if (!companyId) {
    redirect("/fyrirtaeki");
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

  const moduleSettings = await getCompanyModuleSettings(companyId);

  const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
    (module) => module.id,
  );

  if (!enabledModuleIds.includes("bokhald")) {
    redirect("/");
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      companyId,
    },
    include: {
      company: true,
      entries: true,
      aiDetectedDocuments: {
        include: {
          bookingEntries: true,
        },
        orderBy: {
          id: "asc",
        },
      },
    },
    orderBy: {
      id: "desc",
    },
  });

  type ArchiveStatus =
    | "BOOKED"
    | "SUPPORTING"
    | "INSIGHT"
    | "OUTSIDE_BUSINESS"
    | "FINALIZED";

  type ArchiveItem = {
    key: string;
    receiptId: number;
    documentId: number | null;
    voucherNumber: number | null;
    title: string;
    merchantKennitala: string | null;
    companyName: string;
    date: Date | null;
    amount: number;
    status: ArchiveStatus;
    statusLabel: string;
    statusClass: string;
    detail: string | null;
    bookingAccounts: string[];
  };

  const archiveItems: ArchiveItem[] = [];

  for (const receipt of receipts) {
    if (receipt.aiDetectedDocuments.length > 0) {
      for (const document of receipt.aiDetectedDocuments) {
        const isBooked =
          document.approvedAt !== null ||
          document.voucherNumber !== null;

        const isDisposed =
          document.disposedAt !== null ||
          document.disposition !== null;

        if (!isBooked && !isDisposed) {
          continue;
        }

        let archiveStatus: ArchiveStatus = "FINALIZED";
        let statusLabel = "Afgreitt";
        let statusClass = "text-slate-700";
        let detail: string | null =
          document.dispositionReason ?? null;

        if (isBooked) {
          archiveStatus = "BOOKED";
          statusLabel = "Bókað";
          statusClass = "text-green-700";

          if (document.voucherNumber !== null) {
            detail = `Fylgiskjal nr. ${document.voucherNumber}`;
          }
        } else {
          switch (document.disposition) {
            case "SUPPORTING_RESOLVED":
              archiveStatus = "SUPPORTING";
              statusLabel = "Stuðningsskjal";
              statusClass = "text-blue-700";
              break;

            case "INSIGHT_ONLY":
              archiveStatus = "INSIGHT";
              statusLabel = "Innsýn";
              statusClass = "text-violet-700";
              break;

            case "OUTSIDE_BUSINESS":
              archiveStatus = "OUTSIDE_BUSINESS";
              statusLabel = "Utan bókhalds";
              statusClass = "text-slate-600";
              break;

            default:
              archiveStatus = "FINALIZED";
              statusLabel = "Afgreitt";
              statusClass = "text-slate-700";
              break;
          }
        }

        archiveItems.push({
          key: `document-${document.id}`,
          receiptId: receipt.id,
          documentId: document.id,
          voucherNumber: document.voucherNumber,
          title:
            document.merchantName ??
            receipt.merchantName ??
            receipt.description ??
            "Óþekkt fylgiskjal",
          merchantKennitala:
            document.merchantKennitala ??
            receipt.merchantKennitala ??
            null,
          companyName: receipt.company.name,
          date:
            document.date ??
            receipt.aiDate ??
            receipt.date,
          amount:
            document.totalAmount ??
            receipt.aiAmount ??
            receipt.amount ??
            0,
          status: archiveStatus,
          statusLabel,
          statusClass,
          detail,
          bookingAccounts: document.bookingEntries.map(
            (entry) => entry.account,
          ),
        });
      }
    } else {
      const isBooked =
        receipt.status === "APPROVED" ||
        receipt.voucherNumber !== null;

      if (!isBooked) {
        continue;
      }

      archiveItems.push({
        key: `receipt-${receipt.id}`,
        receiptId: receipt.id,
        documentId: null,
        voucherNumber: receipt.voucherNumber,
        title:
          receipt.merchantName ??
          receipt.description ??
          "Óþekkt fylgiskjal",
        merchantKennitala:
          receipt.merchantKennitala ?? null,
        companyName: receipt.company.name,
        date:
          receipt.aiDate ??
          receipt.date,
        amount:
          receipt.aiAmount ??
          receipt.amount ??
          0,
        status: "BOOKED",
        statusLabel: "Bókað",
        statusClass: "text-green-700",
        detail:
          receipt.voucherNumber !== null
            ? `Fylgiskjal nr. ${receipt.voucherNumber}`
            : null,
        bookingAccounts: receipt.entries.map(
          (entry) => entry.account,
        ),
      });
    }
  }

  const statusFilteredItems = archiveItems.filter((item) => {
    if (statusOption === "all") {
      return true;
    }

    if (statusOption === "booked") {
      return item.status === "BOOKED";
    }

    if (statusOption === "supporting") {
      return item.status === "SUPPORTING";
    }

    if (statusOption === "insight") {
      return item.status === "INSIGHT";
    }

    if (statusOption === "outside-business") {
      return item.status === "OUTSIDE_BUSINESS";
    }

    return true;
  });

  const filteredItems = statusFilteredItems.filter((item) => {
    if (!searchText) {
      return true;
    }

    const normalizedSearch = searchText.toLocaleLowerCase("is-IS");

    const matchesVoucher =
      searchVoucherNumber !== null &&
      item.voucherNumber === searchVoucherNumber;

    const matchesTitle = item.title
      .toLocaleLowerCase("is-IS")
      .includes(normalizedSearch);

    const matchesKennitala =
      item.merchantKennitala
        ?.toLocaleLowerCase("is-IS")
        .includes(normalizedSearch) ?? false;

    const matchesDetail =
      item.detail
        ?.toLocaleLowerCase("is-IS")
        .includes(normalizedSearch) ?? false;

    const matchesAccount = item.bookingAccounts.some((account) =>
      account
        .toLocaleLowerCase("is-IS")
        .includes(normalizedSearch),
    );

    return (
      matchesVoucher ||
      matchesTitle ||
      matchesKennitala ||
      matchesDetail ||
      matchesAccount
    );
  });

  filteredItems.sort((a, b) => {
    if (sortOption === "voucher-desc") {
      const voucherA = a.voucherNumber ?? -1;
      const voucherB = b.voucherNumber ?? -1;

      if (voucherA !== voucherB) {
        return voucherB - voucherA;
      }
    }

    if (sortOption === "voucher-asc") {
      const voucherA =
        a.voucherNumber ?? Number.MAX_SAFE_INTEGER;
      const voucherB =
        b.voucherNumber ?? Number.MAX_SAFE_INTEGER;

      if (voucherA !== voucherB) {
        return voucherA - voucherB;
      }
    }

    if (sortOption === "date-asc") {
      const timeA = a.date?.getTime() ?? 0;
      const timeB = b.date?.getTime() ?? 0;

      if (timeA !== timeB) {
        return timeA - timeB;
      }
    }

    if (sortOption === "date-desc") {
      const timeA = a.date?.getTime() ?? 0;
      const timeB = b.date?.getTime() ?? 0;

      if (timeA !== timeB) {
        return timeB - timeA;
      }
    }

    return b.receiptId - a.receiptId;
  });

  const bookedCount = archiveItems.filter(
    (item) => item.status === "BOOKED",
  ).length;

  const supportingCount = archiveItems.filter(
    (item) => item.status === "SUPPORTING",
  ).length;

  const insightCount = archiveItems.filter(
    (item) => item.status === "INSIGHT",
  ).length;

  const outsideBusinessCount = archiveItems.filter(
    (item) => item.status === "OUTSIDE_BUSINESS",
  ).length;

  return (
    <main className="p-8">
      <PageHeader
        title="Skjalasafn"
        description="Bókuð og afgreidd skjöl fyrirtækisins á einum stað."
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/fylgiskjol"
          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          <span aria-hidden="true">←</span>
          Óunnin fylgiskjöl
        </Link>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <Link
          href="/fylgiskjol/skjalasafn"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "all"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Öll skjöl ({archiveItems.length})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=booked"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "booked"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Bókuð ({bookedCount})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=supporting"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "supporting"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Stuðningsskjöl ({supportingCount})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=insight"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "insight"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Innsýn ({insightCount})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=outside-business"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "outside-business"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          Utan bókhalds ({outsideBusinessCount})
        </Link>
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <input
          type="hidden"
          name="status"
          value={statusOption}
        />

        <label className="block">
          <span className="mb-1 block font-semibold">
            Leita í skjalasafni
          </span>

          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Nr., seljandi, kt. eða lykill"
            className="w-72 rounded border px-3 py-2"
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
            <option value="date-desc">
              Dagsetning – nýjasta fyrst
            </option>

            <option value="date-asc">
              Dagsetning – elsta fyrst
            </option>

            <option value="voucher-desc">
              Fylgiskjal – nýjasta fyrst
            </option>

            <option value="voucher-asc">
              Fylgiskjal – elsta fyrst
            </option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          Leita
        </button>

        {(q || sort || statusOption !== "all") && (
          <Link
            href="/fylgiskjol/skjalasafn"
            className="rounded border px-4 py-2 hover:bg-slate-50"
          >
            Hreinsa
          </Link>
        )}
      </form>

      {filteredItems.length === 0 ? (
        <EmptyState
          title="Engin skjöl fundust"
          description={
            archiveItems.length === 0
              ? "Skjalasafnið er enn tómt."
              : "Engin skjöl passa við valda leit eða síu."
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="border-b p-3">
                  Dagsetning
                </th>

                <th className="border-b p-3">
                  Skjal
                </th>

                <th className="border-b p-3">
                  Kennitala
                </th>

                <th className="border-b p-3 text-right">
                  Upphæð
                </th>

                <th className="border-b p-3">
                  Staða
                </th>

                <th className="border-b p-3">
                  Bókun
                </th>

                <th className="border-b p-3 text-right">
                  Aðgerð
                </th>
              </tr>
            </thead>

            <tbody>
              {filteredItems.map((item) => {
                const href = item.documentId
                  ? `/fylgiskjol/${item.receiptId}?document=${item.documentId}`
                  : `/fylgiskjol/${item.receiptId}`;

                return (
                  <tr
                    key={item.key}
                    className="hover:bg-blue-50"
                  >
                    <td className="border-b p-3 whitespace-nowrap">
                      {item.date
                        ? formatDate(item.date)
                        : "—"}
                    </td>

                    <td className="border-b p-3">
                      <Link
                        href={href}
                        className="font-semibold text-blue-700 hover:underline"
                      >
                        {item.title}
                      </Link>

                      {item.detail && (
                        <p className="mt-1 text-sm text-slate-500">
                          {item.detail}
                        </p>
                      )}
                    </td>

                    <td className="border-b p-3 whitespace-nowrap">
                      {item.merchantKennitala ?? "—"}
                    </td>

                    <td className="border-b p-3 text-right whitespace-nowrap font-semibold">
                      {formatNumber(item.amount)} kr.
                    </td>

                    <td
                      className={`border-b p-3 whitespace-nowrap font-semibold ${item.statusClass}`}
                    >
                      {item.statusLabel}
                    </td>

                    <td className="border-b p-3">
                      {item.bookingAccounts.length > 0
                        ? item.bookingAccounts.join(", ")
                        : "—"}
                    </td>

                    <td className="border-b p-3 text-right">
                      <Link
                        href={href}
                        className="inline-flex items-center gap-2 rounded px-3 py-2 font-medium text-blue-700 hover:bg-blue-100"
                      >
                        Opna
                        <span aria-hidden="true">→</span>
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}