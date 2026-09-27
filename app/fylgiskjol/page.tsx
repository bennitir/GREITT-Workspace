import {
  getRequestAuthContext,
  getRequestCompanyModuleSettings,
  getRequestUserCompany,
  getRequestUserInterfaceSettings,
} from "@/lib/core/request-context";
import { isCompanyModuleEnabled } from "@/lib/core/company-modules";
import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { uiText } from "@/lib/i18n/ui";

import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";

export default async function FylgiskjolPage() {
  const context = await getRequestAuthContext();
  const activeUser = context.effectiveUser;

  if (!activeUser) {
    redirect("/innskraning");
  }

  const userSettings = await getRequestUserInterfaceSettings(activeUser.id);
  const t = uiText(userSettings?.interfaceLanguage);

  const companyId = context.activeCompanyId;

  if (!companyId) {
    redirect("/fyrirtaeki");
  }

  // Varðveitir fyrri hegðun þessarar síðu: aðgangur miðast við effective user.
  if (activeUser.role !== "ADMIN") {
    const access = await getRequestUserCompany(activeUser.id, companyId);

    if (!access?.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const moduleSettings = await getRequestCompanyModuleSettings(companyId);

  if (!isCompanyModuleEnabled("bokhald", moduleSettings)) {
    redirect("/");
  }

  /*
   * Afkastaregla fyrir biðlistann:
   * - sækja aðeins óafgreidd greind undirskjöl;
   * - sækja handvirk/ógreind fylgiskjöl sér;
   * - ekki flytja öll afgreidd undirskjöl yfir netið til að henda þeim síðan í JS.
   *
   * Þetta varðveitir fyrri sýnilega hegðun: parent Receipt þarf áfram að vera
   * ó-APPROVED og greint skjal telst sýnilegt aðeins meðan það er hvorki
   * bókað né sett í endanlega disposition.
   */
  const [pendingDocuments, manualReceipts] = await Promise.all([
    prisma.aiDetectedDocument.findMany({
      where: {
        disposedAt: null,
        disposition: null,
        approvedAt: null,
        voucherNumber: null,
        receipt: {
          companyId,
          status: {
            not: "APPROVED",
          },
        },
      },
      select: {
        id: true,
        merchantName: true,
        date: true,
        totalAmount: true,
        reviewedAt: true,
        needsAttentionAt: true,
        duplicateMarkedAt: true,
        duplicateVoucherNumber: true,
        receipt: {
          select: {
            id: true,
            company: {
              select: {
                name: true,
              },
            },
          },
        },
      },
    }),
    prisma.receipt.findMany({
      where: {
        companyId,
        status: {
          not: "APPROVED",
        },
        aiDetectedDocuments: {
          none: {},
        },
      },
      select: {
        id: true,
        date: true,
        aiDate: true,
        description: true,
        amount: true,
        voucherNumber: true,
        status: true,
        company: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  type DisplayItem = {
    key: string;
    receiptId: number;
    documentId: number | null;
    voucherNumber: number | null;
    title: string;
    companyName: string;
    date: Date | null;
    amount: number;
    statusText: string;
    duplicateVoucherNumber: number | null;
  };

  const displayItems: DisplayItem[] = [
    ...pendingDocuments.map((document) => ({
      key: `document-${document.id}`,
      receiptId: document.receipt.id,
      documentId: document.id,
      voucherNumber: null,
      title: document.merchantName ?? t.unknownDocument,
      companyName: document.receipt.company.name,
      date: document.date,
      amount: document.totalAmount ?? 0,
      statusText: document.reviewedAt
        ? "Yfirfarið"
        : document.needsAttentionAt
          ? "NEEDS_ATTENTION"
          : document.duplicateMarkedAt
            ? "DUPLICATE_CANDIDATE"
            : "Til yfirferðar",
      duplicateVoucherNumber: document.duplicateVoucherNumber,
    })),
    ...manualReceipts.map((receipt) => ({
      key: `receipt-${receipt.id}`,
      receiptId: receipt.id,
      documentId: null,
      voucherNumber: receipt.voucherNumber,
      title: receipt.description,
      companyName: receipt.company.name,
      date: receipt.aiDate ?? receipt.date,
      amount: receipt.amount,
      statusText:
        receipt.status === "REVIEWED"
          ? "Yfirfarið"
          : receipt.status,
      duplicateVoucherNumber: null,
    })),
  ];

  displayItems.sort((a, b) => {
    const timeA = a.date?.getTime() ?? 0;
    const timeB = b.date?.getTime() ?? 0;

    return timeA - timeB;
  });

  const needsReviewItems = displayItems.filter(
    (item) =>
      item.statusText !== "Yfirfarið" &&
      item.statusText !== "NEEDS_ATTENTION",
  );

  const reviewedItems = displayItems.filter(
    (item) => item.statusText === "Yfirfarið",
  );

  const attentionItems = displayItems.filter(
    (item) => item.statusText === "NEEDS_ATTENTION",
  );

  function renderItems(items: DisplayItem[]) {
    return items.map((item) => {
      const href = item.documentId
        ? `/fylgiskjol/${item.receiptId}?document=${item.documentId}`
        : `/fylgiskjol/${item.receiptId}`;

      const statusClass =
        item.statusText === "Yfirfarið"
          ? "text-green-700"
          : item.statusText === "DUPLICATE_CANDIDATE"
            ? "text-amber-700"
            : item.statusText === "NEEDS_ATTENTION"
              ? "text-orange-700"
              : "text-red-600";

      const statusLabel =
        item.statusText === "NEW"
          ? t.statusUnreviewed
          : item.statusText === "NEEDS_ATTENTION"
            ? t.statusNeedsAttention
            : item.statusText === "Yfirfarið"
              ? t.statusReviewed
              : item.statusText === "DUPLICATE_CANDIDATE"
                ? t.duplicateCandidate
                : item.statusText === "Til yfirferðar"
                  ? t.statusForReview
                  : item.statusText;

      return (
        <a
          key={item.key}
          href={href}
          className="group grid cursor-pointer grid-cols-[110px_minmax(220px,1fr)_140px_140px_170px_140px] items-center gap-3 border-b px-3 py-2 transition-colors last:border-b-0 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
        >
          <div className="font-medium">
            {item.date
              ? formatDate(item.date)
              : t.unknown}
          </div>

          <div className="min-w-0">
            <p className="truncate font-semibold group-hover:text-blue-700">
              {item.title}
            </p>

            <p className="text-sm text-slate-500">
              {item.duplicateVoucherNumber !== null
                ? `${t.duplicateOfVoucher} ${item.duplicateVoucherNumber}`
                : `${t.voucher}: ${item.voucherNumber ?? t.noVoucher}`}
            </p>
          </div>

          <div className="text-right font-semibold">
            {formatNumber(item.amount)} kr.
          </div>

          <div className={`font-semibold ${statusClass}`}>
            {statusLabel}
          </div>

          <div className="text-sm text-slate-500">
            {item.companyName}
          </div>

          <div className="text-right">
            <span className="inline-flex items-center gap-2 rounded px-3 py-2 font-medium text-blue-700 transition group-hover:bg-blue-100 group-hover:text-blue-800">
              {t.open.replace(" →", "")}
              <span aria-hidden="true">→</span>
            </span>
          </div>
        </a>
      );
    });
  }

  return (
    <main className="p-8">
      <PageHeader
        title={t.pendingTitle}
        description={t.pendingDescription}
      />

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <a
          href="/fylgiskjol/nytt"
          className="inline-block rounded bg-blue-600 px-4 py-2 font-medium text-white transition hover:bg-blue-700"
        >
          {t.newDocument}
        </a>

        <a
          href="/fylgiskjol/skjalasafn"
          className="inline-flex items-center gap-2 rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-700 transition hover:border-slate-400 hover:bg-slate-50"
        >
          {t.archive}
          <span aria-hidden="true">→</span>
        </a>
      </div>

      <div className="space-y-8">
        {needsReviewItems.length > 0 && (
          <section>
            <h2 className="mb-3 text-2xl font-bold">
              {t.needsReview}
            </h2>

            <div className="overflow-hidden rounded-lg border">
              {renderItems(needsReviewItems)}
            </div>
          </section>
        )}

        {reviewedItems.length > 0 && (
          <section>
            <h2 className="mb-3 text-2xl font-bold">
              {t.reviewedWaiting}
            </h2>

            <div className="overflow-hidden rounded-lg border">
              {renderItems(reviewedItems)}
            </div>
          </section>
        )}

        {attentionItems.length > 0 && (
          <section>
            <div className="mb-3">
              <h2 className="text-2xl font-bold">
                {t.needsAttentionDeferred}
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                {t.needsAttentionDeferredHelp}
              </p>
            </div>

            <div className="overflow-hidden rounded-lg border border-amber-200 bg-amber-50/30">
              {renderItems(attentionItems)}
            </div>
          </section>
        )}

        {displayItems.length === 0 && (
          <EmptyState
            title={t.noPendingTitle}
            description={t.noPendingDescription}
          />
        )}
      </div>
    </main>
  );
}