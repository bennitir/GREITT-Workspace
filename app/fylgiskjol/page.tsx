import { getEffectiveUser } from "@/lib/core/access-control";
import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { redirect } from "next/navigation";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

import PageHeader from "@/components/ui/PageHeader";
import EmptyState from "@/components/ui/EmptyState";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";

export default async function FylgiskjolPage() {
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

const receiptsUnsorted = await prisma.receipt.findMany({
  where: {
  companyId,
  status: {
    not: "APPROVED",
  },
},
  
  include: {
  company: true,
 aiDetectedDocuments: {
  orderBy: {
    id: "asc",
  },
},
},
});

const receipts = receiptsUnsorted.sort((a, b) => {
  const dateA = a.aiDate ?? a.date;
  const dateB = b.aiDate ?? b.date;

  if (!dateA && !dateB) return 0;
  if (!dateA) return 1;
  if (!dateB) return -1;

  return dateA.getTime() - dateB.getTime();
});
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
};
const displayItems: DisplayItem[] = [];

for (const receipt of receipts) {
  if (receipt.aiDetectedDocuments.length > 0) {
    for (const document of receipt.aiDetectedDocuments) {
      displayItems.push({
        key: `document-${document.id}`,
        receiptId: receipt.id,
        documentId: document.id,
        voucherNumber: document.voucherNumber,
        title: document.merchantName ?? "Óþekkt fylgiskjal",
        companyName: receipt.company.name,
        date: document.date,
        amount: document.totalAmount ?? 0,
       statusText: document.approvedAt
  ? "Bókað"
  : document.reviewedAt
    ? "Yfirfarið"
    : "Til yfirferðar",
      });
    }
  } else {
    displayItems.push({
      key: `receipt-${receipt.id}`,
      receiptId: receipt.id,
      documentId: null,
      voucherNumber: receipt.voucherNumber,
            title: receipt.description,
      companyName: receipt.company.name,
      date: receipt.aiDate ?? receipt.date,
      amount: receipt.amount,
      statusText:
  receipt.status === "APPROVED"
    ? "Bókað"
    : receipt.status === "REVIEWED"
      ? "Yfirfarið"
      : receipt.status,
    });
  }
}


displayItems.sort((a, b) => {
  const timeA = a.date?.getTime() ?? 0;
  const timeB = b.date?.getTime() ?? 0;

  return timeA - timeB;
});
const needsReviewItems = displayItems.filter(
  (item) =>
    item.statusText !== "Yfirfarið" &&
    item.statusText !== "Bókað"
);

const reviewedItems = displayItems.filter(
  (item) => item.statusText === "Yfirfarið"
);

const bookedItems = displayItems
  .filter((item) => item.statusText === "Bókað")
  .sort((a, b) => {
    const numberA = a.voucherNumber ?? Number.MAX_SAFE_INTEGER;
    const numberB = b.voucherNumber ?? Number.MAX_SAFE_INTEGER;

    return numberA - numberB;
  });
     function renderItems(items: DisplayItem[]) {
  return items.map((item) => {
    const href = item.documentId
      ? `/fylgiskjol/${item.receiptId}?document=${item.documentId}`
      : `/fylgiskjol/${item.receiptId}`;

    const statusClass =
      item.statusText === "Yfirfarið"
        ? "text-green-700"
        : item.statusText === "NEEDS_ATTENTION"
          ? "text-orange-700"
          : "text-red-600";

    const statusLabel =
      item.statusText === "NEW"
        ? "ÓYFIRFARIÐ"
        : item.statusText === "NEEDS_ATTENTION"
          ? "⚠ ÞARF SÉR SKOÐUN"
          : item.statusText;

    return (
      <div
        key={item.key}
        className="grid grid-cols-[110px_minmax(220px,1fr)_140px_140px_170px_140px] items-center gap-3 border-b px-3 py-2"
      >
        <div className="font-medium">
          {item.date
  ? formatDate(item.date)
  : "Óþekkt"}
        </div>

        <div className="min-w-0">
          <p className="truncate font-semibold">
            {item.title}
          </p>

          <p className="text-sm text-slate-500">
            Fylgiskjal:{" "}
            {item.voucherNumber ?? "EKKERT NÚMER"}
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
          <a
            href={href}
            className="inline-block rounded bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-700"
          >
            Opna
          </a>
        </div>
      </div>
    );
  });
}

  return (
    <main className="p-8">
      <PageHeader
        title="Óunnin fylgiskjöl"
        description="Fylgiskjöl sem bíða vinnslu, yfirferðar eða bókunar."
      />

      <div className="mb-6">
        <a
          href="/fylgiskjol/nytt"
          className="inline-block rounded bg-blue-600 px-4 py-2 text-white"
        >
          + Nýtt fylgiskjal
        </a>
      </div>

      <div className="space-y-8">
        {needsReviewItems.length > 0 && (
          <section>
            <h2 className="mb-3 text-2xl font-bold">
              Þarf yfirferð
            </h2>

            <div className="overflow-hidden rounded-lg border">
              {renderItems(needsReviewItems)}
            </div>
          </section>
        )}

        {reviewedItems.length > 0 && (
          <section>
            <h2 className="mb-3 text-2xl font-bold">
              Yfirfarið – bíður bókunar
            </h2>

            <div className="overflow-hidden rounded-lg border">
              {renderItems(reviewedItems)}
            </div>
          </section>
        )}

        {displayItems.length === 0 && (
          <EmptyState
            title="Engin fylgiskjöl komin inn"
            description="Næsta skref verður að bæta við fyrsta fylgiskjalinu."
          />
        )}
      </div>
    </main>
  );
}