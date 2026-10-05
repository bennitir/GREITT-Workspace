import { getEffectiveUser } from "@/lib/core/access-control";
import { formatDate, formatNumber } from "@/lib/locale";
import { redirect } from "next/navigation";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { uiText } from "@/lib/i18n/ui";
import { archiveReconciliationText } from "@/lib/i18n/archive-reconciliation";

import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

type SearchParams = {
  q?: string;
  sort?: string;
  status?: string;
  reconciliation?: string;
};

export default async function SkjalasafnPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const { q, sort, status, reconciliation } = await searchParams;

  const sortOption = sort ?? "date-desc";
  const statusOption = status ?? "all";
  const reconciliationOption = reconciliation ?? "all";
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

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: activeUser.id },
    select: { interfaceLanguage: true },
  });
  const t = uiText(userSettings?.interfaceLanguage);
  const rt = archiveReconciliationText(userSettings?.interfaceLanguage);

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

  type ArchiveReconciliationEvidence = {
    reconciliationId: number;
    reconciliationType: string;
    confirmedAt: Date | null;
    sourceLabel: string;
    sourceDetail: string | null;
    sourceHref: string | null;
  };

  const documentIds = receipts.flatMap((receipt) =>
    receipt.aiDetectedDocuments.map((document) => document.id),
  );

  const legacyEntryToReceiptId = new Map<number, number>();
  for (const receipt of receipts) {
    if (receipt.aiDetectedDocuments.length === 0) {
      for (const entry of receipt.entries) {
        legacyEntryToReceiptId.set(entry.id, receipt.id);
      }
    }
  }

  const legacyEntryIds = [...legacyEntryToReceiptId.keys()];
  const documentSourceKeys = documentIds.map(String);
  const legacyEntrySourceKeys = legacyEntryIds.map(String);

  const reconciliationSourceClauses = [
    ...(documentSourceKeys.length > 0
      ? [
          {
            sourceType: "AI_DETECTED_DOCUMENT",
            sourceKey: { in: documentSourceKeys },
          },
        ]
      : []),
    ...(legacyEntrySourceKeys.length > 0
      ? [
          {
            sourceType: "RECEIPT_ENTRY",
            sourceKey: { in: legacyEntrySourceKeys },
          },
        ]
      : []),
  ];

  const confirmedReconciliations =
    reconciliationSourceClauses.length > 0
      ? await prisma.financialReconciliation.findMany({
          where: {
            companyId,
            status: "CONFIRMED",
            participants: {
              some: {
                OR: reconciliationSourceClauses,
              },
            },
          },
          select: {
            id: true,
            reconciliationType: true,
            confirmedAt: true,
            participants: {
              select: {
                sourceType: true,
                sourceKey: true,
                role: true,
              },
            },
          },
        })
      : [];

  const bankTransactionIds = Array.from(
    new Set(
      confirmedReconciliations.flatMap((reconciliation) =>
        reconciliation.participants
          .filter((participant) => participant.sourceType === "BANK_TRANSACTION")
          .map((participant) => Number(participant.sourceKey))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ),
  );

  const paymentCardTransactionIds = Array.from(
    new Set(
      confirmedReconciliations.flatMap((reconciliation) =>
        reconciliation.participants
          .filter(
            (participant) =>
              participant.sourceType === "PAYMENT_CARD_TRANSACTION",
          )
          .map((participant) => Number(participant.sourceKey))
          .filter((id) => Number.isSafeInteger(id) && id > 0),
      ),
    ),
  );

  const bankTransactions =
    bankTransactionIds.length > 0
      ? await prisma.bankTransaction.findMany({
          where: { id: { in: bankTransactionIds } },
          select: {
            id: true,
            bankAccountId: true,
            date: true,
            amount: true,
            text: true,
            bankAccount: {
              select: {
                name: true,
                bankName: true,
              },
            },
          },
        })
      : [];

  const paymentCardTransactions =
    paymentCardTransactionIds.length > 0
      ? await prisma.paymentCardTransaction.findMany({
          where: { id: { in: paymentCardTransactionIds } },
          select: {
            id: true,
            paymentCardId: true,
            date: true,
            amount: true,
            merchantText: true,
            paymentCard: {
              select: {
                name: true,
                issuerName: true,
              },
            },
          },
        })
      : [];

  const bankTransactionById = new Map(
    bankTransactions.map((transaction) => [transaction.id, transaction]),
  );
  const paymentCardTransactionById = new Map(
    paymentCardTransactions.map((transaction) => [transaction.id, transaction]),
  );

  const reconciliationByDocumentId = new Map<
    number,
    ArchiveReconciliationEvidence
  >();
  const reconciliationByLegacyReceiptId = new Map<
    number,
    ArchiveReconciliationEvidence
  >();

  const shouldReplaceEvidence = (
    current: ArchiveReconciliationEvidence | undefined,
    next: ArchiveReconciliationEvidence,
  ) => {
    if (!current) {
      return true;
    }

    return (
      (next.confirmedAt?.getTime() ?? 0) >
      (current.confirmedAt?.getTime() ?? 0)
    );
  };

  for (const reconciliation of confirmedReconciliations) {
    const bankParticipant = reconciliation.participants.find(
      (participant) => participant.sourceType === "BANK_TRANSACTION",
    );
    const cardParticipant = reconciliation.participants.find(
      (participant) => participant.sourceType === "PAYMENT_CARD_TRANSACTION",
    );

    let sourceLabel: string = rt.other;
    let sourceDetail: string | null = null;
    let sourceHref: string | null = null;

    if (cardParticipant) {
      const transaction = paymentCardTransactionById.get(
        Number(cardParticipant.sourceKey),
      );

      if (transaction) {
        sourceLabel = transaction.paymentCard.name || rt.card;
        sourceDetail = `${formatDate(transaction.date)} · ${formatNumber(
          Math.abs(Number(transaction.amount.toString())),
        )} kr.`;
        sourceHref = `/banki/kort/${transaction.paymentCardId}`;
      } else {
        sourceLabel = rt.card;
      }
    } else if (bankParticipant) {
      const transaction = bankTransactionById.get(
        Number(bankParticipant.sourceKey),
      );

      if (transaction) {
        sourceLabel = transaction.bankAccount.name || rt.bank;
        sourceDetail = `${formatDate(transaction.date)} · ${formatNumber(
          Math.abs(Number(transaction.amount.toString())),
        )} kr.`;
        sourceHref = `/banki/${transaction.bankAccountId}/afstemming`;
      } else {
        sourceLabel = rt.bank;
      }
    }

    const evidence: ArchiveReconciliationEvidence = {
      reconciliationId: reconciliation.id,
      reconciliationType: reconciliation.reconciliationType,
      confirmedAt: reconciliation.confirmedAt,
      sourceLabel,
      sourceDetail,
      sourceHref,
    };

    for (const participant of reconciliation.participants) {
      if (participant.sourceType === "AI_DETECTED_DOCUMENT") {
        const documentId = Number(participant.sourceKey);
        if (!Number.isSafeInteger(documentId) || documentId <= 0) {
          continue;
        }

        const current = reconciliationByDocumentId.get(documentId);
        if (shouldReplaceEvidence(current, evidence)) {
          reconciliationByDocumentId.set(documentId, evidence);
        }
      }

      if (participant.sourceType === "RECEIPT_ENTRY") {
        const entryId = Number(participant.sourceKey);
        const receiptId = legacyEntryToReceiptId.get(entryId);
        if (!receiptId) {
          continue;
        }

        const current = reconciliationByLegacyReceiptId.get(receiptId);
        if (shouldReplaceEvidence(current, evidence)) {
          reconciliationByLegacyReceiptId.set(receiptId, evidence);
        }
      }
    }
  }

  type ArchiveStatus =
    | "BOOKED"
    | "SUPPORTING"
    | "INSIGHT"
    | "OUTSIDE_BUSINESS"
    | "DUPLICATE"
    | "FINALIZED";

  type ArchiveReconciliationStatus =
    | "RECONCILED"
    | "UNRECONCILED"
    | "NOT_APPLICABLE";

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
    reconciliationStatus: ArchiveReconciliationStatus;
    reconciliationEvidence: ArchiveReconciliationEvidence | null;
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
        let statusLabel: string = t.finalized;
        let statusClass = "text-slate-700";
        let detail: string | null =
          document.dispositionReason ?? null;

        if (isBooked) {
          archiveStatus = "BOOKED";
          statusLabel = t.bookedStatus;
          statusClass = "text-green-700";

          if (document.voucherNumber !== null) {
            detail = `${t.voucherNumber} ${document.voucherNumber}`;
          }
        } else {
          switch (document.disposition) {
            case "SUPPORTING_RESOLVED":
              archiveStatus = "SUPPORTING";
              statusLabel = t.supportingStatus;
              statusClass = "text-blue-700";
              break;

            case "INSIGHT_ONLY":
              archiveStatus = "INSIGHT";
              statusLabel = t.insightFilter;
              statusClass = "text-violet-700";
              break;

            case "OUTSIDE_BUSINESS":
              archiveStatus = "OUTSIDE_BUSINESS";
              statusLabel = t.outsideBusinessStatus;
              statusClass = "text-slate-600";
              break;

            case "DUPLICATE_RESOLVED":
              archiveStatus = "DUPLICATE";
              statusLabel = t.duplicateResolved;
              statusClass = "text-amber-700";
              detail =
                document.duplicateVoucherNumber !== null
                  ? `${t.duplicateOfVoucher} ${document.duplicateVoucherNumber}`
                  : document.dispositionReason ?? null;
              break;

            default:
              archiveStatus = "FINALIZED";
              statusLabel = t.finalized;
              statusClass = "text-slate-700";
              break;
          }
        }

        const reconciliationEvidence =
          reconciliationByDocumentId.get(document.id) ?? null;

        const reconciliationStatus: ArchiveReconciliationStatus =
          !isBooked
            ? "NOT_APPLICABLE"
            : reconciliationEvidence
              ? "RECONCILED"
              : "UNRECONCILED";

        archiveItems.push({
          key: `document-${document.id}`,
          receiptId: receipt.id,
          documentId: document.id,
          voucherNumber: document.voucherNumber,
          title:
            document.merchantName ??
            receipt.merchantName ??
            receipt.description ??
            t.unknownDocument,
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
          reconciliationStatus,
          reconciliationEvidence,
        });
      }
    } else {
      const isBooked =
        receipt.status === "APPROVED" ||
        receipt.voucherNumber !== null;

      if (!isBooked) {
        continue;
      }

      const reconciliationEvidence =
        reconciliationByLegacyReceiptId.get(receipt.id) ?? null;

      archiveItems.push({
        key: `receipt-${receipt.id}`,
        receiptId: receipt.id,
        documentId: null,
        voucherNumber: receipt.voucherNumber,
        title:
          receipt.merchantName ??
          receipt.description ??
          t.unknownDocument,
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
        statusLabel: t.bookedStatus,
        statusClass: "text-green-700",
        detail:
          receipt.voucherNumber !== null
            ? `${t.voucherNumber} ${receipt.voucherNumber}`
            : null,
        bookingAccounts: receipt.entries.map(
          (entry) => entry.account,
        ),
        reconciliationStatus: reconciliationEvidence
          ? "RECONCILED"
          : "UNRECONCILED",
        reconciliationEvidence,
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

    if (statusOption === "duplicates") {
      return item.status === "DUPLICATE";
    }

    return true;
  });

  const reconciliationFilteredItems = statusFilteredItems.filter((item) => {
    if (reconciliationOption === "all") {
      return true;
    }

    if (reconciliationOption === "reconciled") {
      return item.reconciliationStatus === "RECONCILED";
    }

    if (reconciliationOption === "unreconciled") {
      return item.reconciliationStatus === "UNRECONCILED";
    }

    if (reconciliationOption === "booked-unreconciled") {
      return (
        item.status === "BOOKED" &&
        item.reconciliationStatus === "UNRECONCILED"
      );
    }

    if (reconciliationOption === "not-applicable") {
      return item.reconciliationStatus === "NOT_APPLICABLE";
    }

    return true;
  });

  const filteredItems = reconciliationFilteredItems.filter((item) => {
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

  const duplicateCount = archiveItems.filter(
    (item) => item.status === "DUPLICATE",
  ).length;

  const reconciledCount = archiveItems.filter(
    (item) => item.reconciliationStatus === "RECONCILED",
  ).length;

  const unreconciledCount = archiveItems.filter(
    (item) => item.reconciliationStatus === "UNRECONCILED",
  ).length;

  const bookedUnreconciledCount = archiveItems.filter(
    (item) =>
      item.status === "BOOKED" &&
      item.reconciliationStatus === "UNRECONCILED",
  ).length;

  const notApplicableCount = archiveItems.filter(
    (item) => item.reconciliationStatus === "NOT_APPLICABLE",
  ).length;

  return (
    <main className="p-8">
      <PageHeader
        title={t.archiveTitle}
        description={t.archiveDescription}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <Link
          href="/fylgiskjol"
          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          <span aria-hidden="true">←</span>
          {t.backPending}
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
          {t.allDocuments} ({archiveItems.length})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=booked"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "booked"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t.bookedFilter} ({bookedCount})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=supporting"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "supporting"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t.supportingDocuments} ({supportingCount})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=insight"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "insight"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t.insightFilter} ({insightCount})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=outside-business"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "outside-business"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t.outsideAccounting} ({outsideBusinessCount})
        </Link>

        <Link
          href="/fylgiskjol/skjalasafn?status=duplicates"
          className={`rounded border px-3 py-2 text-sm font-semibold transition ${
            statusOption === "duplicates"
              ? "border-blue-600 bg-blue-600 text-white"
              : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
          }`}
        >
          {t.duplicateFilter} ({duplicateCount})
        </Link>
      </div>

      <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-3">
        <p className="mb-2 text-sm font-semibold text-slate-700">
          {rt.filterLabel}
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/fylgiskjol/skjalasafn?reconciliation=all"
            className={`rounded border px-3 py-2 text-sm font-semibold transition ${
              reconciliationOption === "all"
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {rt.all} ({archiveItems.length})
          </Link>

          <Link
            href="/fylgiskjol/skjalasafn?reconciliation=reconciled"
            className={`rounded border px-3 py-2 text-sm font-semibold transition ${
              reconciliationOption === "reconciled"
                ? "border-green-700 bg-green-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {rt.reconciled} ({reconciledCount})
          </Link>

          <Link
            href="/fylgiskjol/skjalasafn?reconciliation=unreconciled"
            className={`rounded border px-3 py-2 text-sm font-semibold transition ${
              reconciliationOption === "unreconciled"
                ? "border-amber-700 bg-amber-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {rt.unreconciled} ({unreconciledCount})
          </Link>

          <Link
            href="/fylgiskjol/skjalasafn?reconciliation=booked-unreconciled"
            className={`rounded border px-3 py-2 text-sm font-semibold transition ${
              reconciliationOption === "booked-unreconciled"
                ? "border-orange-700 bg-orange-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {rt.bookedUnreconciled} ({bookedUnreconciledCount})
          </Link>

          <Link
            href="/fylgiskjol/skjalasafn?reconciliation=not-applicable"
            className={`rounded border px-3 py-2 text-sm font-semibold transition ${
              reconciliationOption === "not-applicable"
                ? "border-slate-600 bg-slate-600 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
            }`}
          >
            {rt.notApplicable} ({notApplicableCount})
          </Link>
        </div>
      </div>

      <form className="mb-6 flex flex-wrap items-end gap-3">
        <input
          type="hidden"
          name="status"
          value={statusOption}
        />
        <input
          type="hidden"
          name="reconciliation"
          value={reconciliationOption}
        />

        <label className="block">
          <span className="mb-1 block font-semibold">
            {t.searchArchive}
          </span>

          <input
            type="text"
            name="q"
            defaultValue={q ?? ""}
            placeholder={t.searchPlaceholder}
            className="w-72 rounded border px-3 py-2"
          />
        </label>

        <label className="block">
          <span className="mb-1 block font-semibold">
            {t.sortBy}
          </span>

          <select
            name="sort"
            defaultValue={sortOption}
            className="rounded border px-3 py-2"
          >
            <option value="date-desc">
              {t.dateNewest}
            </option>

            <option value="date-asc">
              {t.dateOldest}
            </option>

            <option value="voucher-desc">
              {t.voucherNewest}
            </option>

            <option value="voucher-asc">
              {t.voucherOldest}
            </option>
          </select>
        </label>

        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
        >
          {t.search}
        </button>

        {(q || sort || statusOption !== "all" || reconciliationOption !== "all") && (
          <Link
            href="/fylgiskjol/skjalasafn"
            className="rounded border px-4 py-2 hover:bg-slate-50"
          >
            {t.clear}
          </Link>
        )}
      </form>

      {filteredItems.length === 0 ? (
        <EmptyState
          title={t.noDocumentsFound}
          description={
            archiveItems.length === 0
              ? t.archiveEmpty
              : t.noSearchMatches
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-white">
          <table className="w-full border-collapse text-left">
            <thead className="bg-slate-50">
              <tr>
                <th className="border-b p-3">
                  {t.date}
                </th>

                <th className="border-b p-3">
                  {t.document}
                </th>

                <th className="border-b p-3">
                  {t.kennitala}
                </th>

                <th className="border-b p-3 text-right">
                  {t.amount}
                </th>

                <th className="border-b p-3">
                  {t.status}
                </th>

                <th className="border-b p-3">
                  {rt.reconciliation}
                </th>

                <th className="border-b p-3">
                  {t.booking}
                </th>

                <th className="border-b p-3 text-right">
                  {t.action}
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
                    className="group hover:bg-blue-50"
                  >
                    <td className="border-b p-0 whitespace-nowrap">
                      <Link href={href} className="block p-3">
                        {item.date
                          ? formatDate(item.date)
                          : "—"}
                      </Link>
                    </td>

                    <td className="border-b p-0">
                      <Link href={href} className="block p-3">
                        <span className="font-semibold text-blue-700 group-hover:underline">
                          {item.title}
                        </span>

                        {item.detail && (
                          <p className="mt-1 text-sm text-slate-500">
                            {item.detail}
                          </p>
                        )}
                      </Link>
                    </td>

                    <td className="border-b p-0 whitespace-nowrap">
                      <Link href={href} className="block p-3">
                        {item.merchantKennitala ?? "—"}
                      </Link>
                    </td>

                    <td className="border-b p-0 text-right whitespace-nowrap font-semibold">
                      <Link href={href} className="block p-3">
                        {formatNumber(item.amount)} kr.
                      </Link>
                    </td>

                    <td
                      className={`border-b p-0 whitespace-nowrap font-semibold ${item.statusClass}`}
                    >
                      <Link href={href} className="block p-3">
                        {item.statusLabel}
                      </Link>
                    </td>

                    <td className="border-b p-0 align-top">
                      {item.reconciliationStatus === "RECONCILED" ? (
                        item.reconciliationEvidence?.sourceHref ? (
                          <Link
                            href={item.reconciliationEvidence.sourceHref}
                            className="block p-3 text-green-700 hover:underline"
                            title={rt.openReconciliation}
                          >
                            <span className="font-semibold">{rt.reconciled}</span>
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                              {item.reconciliationEvidence.sourceLabel}
                              {item.reconciliationEvidence.sourceDetail
                                ? ` · ${item.reconciliationEvidence.sourceDetail}`
                                : ""}
                            </span>
                          </Link>
                        ) : (
                          <div className="p-3 text-green-700">
                            <span className="font-semibold">{rt.reconciled}</span>
                            <span className="mt-1 block text-xs font-normal text-slate-500">
                              {item.reconciliationEvidence?.sourceLabel ??
                                rt.reconciledCountHelp}
                            </span>
                          </div>
                        )
                      ) : item.reconciliationStatus === "UNRECONCILED" ? (
                        <div
                          className="p-3 font-semibold text-amber-700"
                          title={rt.unreconciledHelp}
                        >
                          {rt.unreconciled}
                        </div>
                      ) : (
                        <div className="p-3 text-slate-500">
                          {rt.notApplicable}
                        </div>
                      )}
                    </td>

                    <td className="border-b p-0">
                      <Link href={href} className="block p-3">
                        {item.status === "DUPLICATE"
                          ? t.duplicateNoBooking
                          : item.bookingAccounts.length > 0
                            ? item.bookingAccounts.join(", ")
                            : "—"}
                      </Link>
                    </td>

                    <td className="border-b p-0 text-right">
                      <Link
                        href={href}
                        className="flex items-center justify-end gap-2 p-3 font-medium text-blue-700 group-hover:underline"
                      >
                        {t.open.replace(" →", "")}
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