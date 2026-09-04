import { getCompanyAccess } from "@/lib/core/access-control";
import { createInsightJobForDocument } from "@/app/actions/insightActions";
import DeleteDetectedDocumentButton from "@/components/DeleteDetectedDocumentButton";
import ApproveDocumentButton from "@/components/ApproveDocumentButton";
import {
  analyzeReceiptWithAI,
  reviewDetectedDocument,
  markDetectedDocumentOutsideBusiness,
  retainDetectedDocumentForInsight,
  resolveDetectedDocumentAsSupporting,
  confirmInsightEntityAccountLink,
  approveDetectedDocument,
  deleteDetectedDocument,
  deleteReceipt,
  markReceiptNeedsAttention,
  cancelManualReceipt,
  repairDeleteLegacyReceipt,
} from "@/app/actions/receiptActions";
import DetectedDocumentEntriesEditor from "@/components/DetectedDocumentEntriesEditor";

import { prisma } from "@/lib/prisma";
import Link from "next/link";
import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { supabaseAdmin } from "@/lib/supabase";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
export default async function ReceiptPage({
    params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ document?: string }>;
}) {
    const cookieStore = await cookies();
  const activeUserId = cookieStore.get("activeUserId")?.value;

  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

if (!activeCompanyId) {
  redirect("/fyrirtaeki");
}

const companyId = Number(activeCompanyId);
const accounts = await prisma.account.findMany({
  where: {
    companyId,
    isActive: true,
  },
  select: {
    number: true,
    name: true,
    type: true,
    entryRole: true,
    vatTreatment: true,
  },
  orderBy: {
    number: "asc",
  },
});


const companyAccess = await getCompanyAccess(companyId);
const canBook = companyAccess.canBook ?? false;
const canDelete = companyAccess.canDelete ?? false;
const canEdit = companyAccess.canWrite ?? false;

  const activeUser = activeUserId
    ? await prisma.user.findUnique({
        where: {
          id: Number(activeUserId),
        },
      })
    : null;

    const { id } = await params;
  
  const { document: documentParam } = await searchParams;

  const selectedDocumentId = documentParam
    ? Number(documentParam)
    : null;

  const receipt = await prisma.receipt.findFirst({
  where: {
    id: Number(id),
    companyId,
  },
  include: {
    company: true,
    entries: true,
    aiDetectedDocuments: {
      include: {
        bookingEntries: true,
        insightProcessingItems: {
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
          include: {
            job: {
              select: {
                id: true,
                status: true,
                processingVersion: true,
                createdAt: true,
                startedAt: true,
                completedAt: true,
              },
            },
          },
        },
        entityLinks: {
          include: {
            entity: {
              include: {
                accountLinks: {
                  where: {
                    role: "LIABILITY_PRINCIPAL",
                    status: "CONFIRMED",
                  },
                  include: {
                    account: true,
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
if (!receipt) {
  notFound();
}
let originalFileUrl = receipt.filePath ?? null;

if (receipt.storagePath) {
  const { data } = await supabaseAdmin.storage
  .from("fylgiskjol")
  .createSignedUrl(receipt.storagePath, 60 * 10);

  if (data?.signedUrl) {
    originalFileUrl = data.signedUrl;
  }
}

const moduleSettings = await getCompanyModuleSettings(receipt.companyId);

const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
  (module) => module.id,
);

if (!enabledModuleIds.includes("bokhald")) {
  redirect("/");
}

if (activeUser && activeUser.role !== "ADMIN") {
  const hasAccess = await prisma.userCompany.findFirst({
    where: {
      userId: activeUser.id,
      companyId: receipt.companyId,
      isActive: true,
    },
  });

  if (!hasAccess) {
    notFound();
  }
}
  const selectedDocument = selectedDocumentId
  ? receipt.aiDetectedDocuments.find(
      (document) => document.id === selectedDocumentId
    )
  : null;

const visibleDocuments = selectedDocument
  ? [selectedDocument]
  : receipt.aiDetectedDocuments;

const getNextUnresolvedDocument = (currentDocumentId: number) =>
  receipt.aiDetectedDocuments
    .filter(
      (item) =>
        item.id !== currentDocumentId &&
        !item.reviewedAt &&
        !item.approvedAt &&
        !item.disposedAt
    )
    .sort((a, b) => a.id - b.id)[0] ?? null;
  
    return (
  <main className="w-full max-w-[1400px] mx-auto p-4">
    <div className="mb-4 flex flex-wrap items-center gap-3 border-b pb-4">
      <span className="font-semibold">
        {receipt.company.name}
      </span>

      <span className="text-slate-400">•</span>

      {receipt.filePath && (
        <>
          <span>
            <strong>Skjal:</strong>{" "}
            {receipt.fileName
              ? `${receipt.fileName.slice(0, 6)}...pdf`
              : "Óþekkt skjal"}
          </span>

          <span className="text-slate-400">•</span>
        </>
      )}

      <span className="font-semibold">
  {formatNumber(receipt.amount)} kr.
</span>

      {receipt.filePath && (
  <>
    <Link
  href={`/fylgiskjol/${receipt.id}/frumskjal`}
      className="ml-2 rounded border px-3 py-2 font-medium text-blue-600 hover:bg-blue-50"
    >
      Opna frumskjal
    </Link>
{!receipt.aiDetectedDocuments.some(
  (document) =>
    document.voucherNumber !== null ||
    document.disposedAt !== null
) && (
    <form
      action={async () => {
        "use server";
        await analyzeReceiptWithAI(receipt.id);
        redirect(`/fylgiskjol/${receipt.id}`);
      }}
      className="m-0"
    >
      <button
        type="submit"
        className="rounded bg-blue-600 px-4 py-2 text-white"
      >
        {receipt.aiDetectedDocuments.length > 0
          ? "Lesa fylgiskjal aftur með AI"
          : "Lesa fylgiskjal með AI"}
      </button>
    </form>
    )}
    {!receipt.aiDetectedDocuments.some(
  (document) => document.reviewedAt !== null || document.disposedAt !== null
) && (
  <form
  action={async () => {
    "use server";
    await deleteReceipt(receipt.id);
    redirect("/fylgiskjol");
  }}
  className="mt-0"
>
  <button
    type="submit"
    className="rounded bg-red-600 px-4 py-2 text-white"
  >
    Eyða fylgiskjali
  </button>
</form>
)}
  </>
)}
    </div>
{receipt.status === "APPROVED" &&
  receipt.voucherNumber != null &&
  receipt.aiDetectedDocuments.length === 0 && (
    <form
      action={async () => {
        "use server";
        await cancelManualReceipt(receipt.id);
      }}
      className="mt-4"
    >
      <button
        type="submit"
        className="rounded bg-amber-600 px-4 py-2 font-semibold text-white hover:bg-amber-700"
      >
        Afbóka handvirka bókun
      </button>
    </form>
  )}


      
      <div className="grid grid-cols-1 lg:grid-cols-2 items-start gap-4 mt-6">
        {/* VINSTRI DÁLKUR - OCR */}
        <div className="space-y-4">
        <div className="border rounded-lg p-4">
          <h2 className="text-xl font-semibold mb-3">
            OCR lestur
          </h2>

          <p>
            <strong>Staða:</strong>{" "}
            {receipt.company.vatRegistered === false && receipt.ocrStatus
              ? receipt.ocrStatus
                  .replace(/\s*Athuga VSK-tímabil\.?/gi, "")
                  .trim()
              : receipt.ocrStatus ?? "Ekki lesið"}
          </p>

          <p className="mt-1">
            <strong>Fjöldi fylgiskjala:</strong>{" "}
            {receipt.documentCount ?? "Óþekkt"}
          </p>

          <p className="mt-1">
            <strong>Öryggi:</strong>{" "}
            {receipt.ocrConfidence != null
              ? `${Math.round(
                  receipt.ocrConfidence * 100
                )}%`
              : "Óþekkt"}
          </p>

          <p className="mt-1">
            <strong>Söluaðili:</strong>{" "}
            {receipt.merchantName ?? "Óþekktur"}
          </p>

          {receipt.ocrText && (
            <div className="mt-3">
              <strong>Lesinn texti:</strong>

              <pre className="mt-2 whitespace-pre-wrap rounded bg-gray-50 p-3 text-sm">
                {receipt.ocrText}
              </pre>
            </div>
          )}


        </div>
         <div className="border rounded-lg p-4">
        <h2 className="text-xl font-semibold mb-3">
          {visibleDocuments.some((document) => document.documentRole === "BOOKABLE") ? "Bókun" : "Afgreiðsla"}
        </h2>

{visibleDocuments.some((document) => document.documentRole === "BOOKABLE" && !document.reviewedAt && !document.disposedAt) && (
  <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 font-semibold text-red-700">
    🔒 Ekki hægt að bóka fyrr en fylgiskjalið hefur verið merkt yfirfarið.
  </div>
)}

        {visibleDocuments.length > 0 && (
  <div className="mb-4">
    {visibleDocuments.every(
      (document) => document.approvedAt || document.disposedAt
    ) ? (
              <div className="rounded border border-green-300 bg-green-50 p-3 text-green-700">
                ✓ Öll greind fylgiskjöl afgreidd
              </div>
            ) : (
              <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-yellow-700">
                Bíður eftir afgreiðslu allra
                fylgiskjala
              </div>
            )}
          </div>
        )}
        <div className="space-y-3">
  {receipt.entries.map((entry) => (
    <div
      key={entry.id}
      className="grid grid-cols-3 gap-4 border-b py-2 font-semibold"
    >
      <span>
        {entry.account} {entry.text}
      </span>

      <span>
        {entry.debit > 0
  ? `Debet ${formatNumber(entry.debit)} kr.`
  : ""}
      </span>

      <span>
        {entry.credit > 0
  ? `Kredit ${formatNumber(entry.credit)} kr.`
  : ""}
      </span>
    </div>
  ))}
</div>
        </div>
</div>
                        {/* HÆGRI DÁLKUR */}
        <div className="space-y-4 lg:col-start-2 lg:row-start-1">
          <div className="border rounded-lg p-4">
            <h2 className="text-xl font-semibold mb-3">
              Tillaga AI
            </h2>

            <p>
              <strong>Dagsetning:</strong>{" "}
              {receipt.aiDate
  ? formatDate(receipt.aiDate)
  : "Engin tillaga"}
            </p>

            <p className="mt-1">
              <strong>Upphæð:</strong>{" "}
{selectedDocumentId && visibleDocuments[0]?.totalAmount != null
  ? `${formatNumber(visibleDocuments[0].totalAmount)} kr.`
  : receipt.aiAmount != null
    ? `${formatNumber(receipt.aiAmount)} kr.`
    : "Engin tillaga"}
            </p>
          </div>

          {visibleDocuments.length > 0 && (
            <div className="border rounded-lg p-4">
              <h2 className="text-xl font-semibold mb-3">
                Greind fylgiskjöl
              </h2>

              <div className="space-y-4">
                {visibleDocuments.map(
                  (document, index) => (
                    <div
                      key={document.id}
                      className="rounded border p-3"
                    >
                      <h3 className="font-semibold">
                        Fylgiskjal {index + 1}
                        {document.merchantName
                          ? ` – ${document.merchantName}`
                          : ""}
                      </h3>

                      <p className="mt-2">
                        <strong>
                          Fylgiskjalsnúmer:
                        </strong>{" "}
                        {document.voucherNumber ??
                          "Ekki úthlutað"}
                      </p>

                    <p className="mt-2">
  <strong>Dagsetning:</strong>{" "}
  {document.date
    ? formatDate(document.date)
    : "Óþekkt"}
</p>

<p>
  <strong>Upphæð:</strong>{" "}
  {document.totalAmount != null
    ? `${formatNumber(document.totalAmount)} kr.`
    : "Óþekkt"}
</p>
                      <p className="mt-2 text-sm">
                        {document.summary}
                      </p>

                      {(() => {
                        const latestInsightItem =
                          document.insightProcessingItems[0] ?? null;

                        const latestCompletedInsightItem =
                          document.insightProcessingItems.find(
                            (item) => item.status === "COMPLETED",
                          ) ?? null;

                        const hasValidCompletedInsight =
                          latestCompletedInsightItem !== null;

                        const latestAttemptFailed =
                          latestInsightItem?.status === "FAILED" ||
                          latestInsightItem?.job.status ===
                            "COMPLETED_WITH_ERRORS";

                        const latestAttemptProcessing =
                          latestInsightItem?.status === "PROCESSING";

                        const latestAttemptPending =
                          latestInsightItem?.status === "PENDING";

                        const statusText = hasValidCompletedInsight
                          ? "Innsýn lokið"
                          : latestAttemptProcessing
                            ? "Innsýn er að vinna skjalið…"
                            : latestAttemptPending
                              ? "Bíður eftir Innsýn-vinnslu"
                              : latestAttemptFailed
                                ? "Innsýn-vinnsla mistókst"
                                : "Ekki unnið með Innsýn";

                        const statusClass = hasValidCompletedInsight
                          ? "border-green-300 bg-green-50 text-green-800"
                          : latestAttemptProcessing
                            ? "border-blue-300 bg-blue-50 text-blue-800"
                            : latestAttemptPending
                              ? "border-amber-300 bg-amber-50 text-amber-900"
                              : latestAttemptFailed
                                ? "border-red-300 bg-red-50 text-red-800"
                                : "border-slate-300 bg-slate-50 text-slate-700";

                        const displayedInsightItem =
                          latestCompletedInsightItem ?? latestInsightItem;

                        return (
                          <div
                            className={`mt-4 rounded border p-4 ${statusClass}`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <div className="font-semibold">
                                  Innsýn
                                </div>

                                <p className="mt-1 text-sm">
                                  {statusText}
                                </p>

                                {hasValidCompletedInsight &&
                                  latestAttemptFailed &&
                                  latestInsightItem &&
                                  latestCompletedInsightItem &&
                                  latestInsightItem.id !==
                                    latestCompletedInsightItem.id && (
                                    <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                                      <strong>Athugið:</strong>{" "}
                                      Síðari endurvinnslutilraun mistókst,
                                      en fyrri gild Innsýn-niðurstaða er
                                      áfram varðveitt.
                                      {latestInsightItem.errorMessage && (
                                        <span className="block mt-1">
                                          Villa:{" "}
                                          {latestInsightItem.errorMessage}
                                        </span>
                                      )}
                                    </div>
                                  )}

                                {!hasValidCompletedInsight &&
                                  latestInsightItem?.errorMessage && (
                                    <p className="mt-2 text-sm">
                                      <strong>Villa:</strong>{" "}
                                      {latestInsightItem.errorMessage}
                                    </p>
                                  )}
                              </div>

                              {canEdit &&
                                (!latestInsightItem ||
                                  latestAttemptFailed) && (
                                  <form
                                    action={async () => {
                                      "use server";

                                      await createInsightJobForDocument(
                                        document.id,
                                      );

                                      redirect(
                                        `/fylgiskjol/${receipt.id}?document=${document.id}`,
                                      );
                                    }}
                                  >
                                    <button
                                      type="submit"
                                      className="rounded bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800"
                                    >
                                      {latestAttemptFailed
                                        ? "Reyna Innsýn aftur"
                                        : "Keyra Innsýn"}
                                    </button>
                                  </form>
                                )}
                            </div>

                            {displayedInsightItem && (
                              <p className="mt-3 text-xs opacity-80">
                                Gild vinnsla: vinnsluverk #
                                {displayedInsightItem.job.id} ·{" "}
                                {displayedInsightItem.processingVersion}
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {document.entityLinks
                        .filter(
                          (link) =>
                            link.role === "LOAN" &&
                            link.entity.entityType === "LOAN"
                        )
                        .map((link) => {
                          const confirmedAccount =
                            link.entity.accountLinks[0]?.account ?? null;

                          return (
                            <div
                              key={`loan-account-${link.entity.id}`}
                              className="mt-4 rounded border border-blue-200 bg-blue-50 p-4"
                            >
                              <div className="font-semibold text-blue-900">
                                Lánatenging
                              </div>

                              <p className="mt-1 text-sm text-blue-900">
                                <strong>Lán:</strong>{" "}
                                {link.entity.identifierValue ?? link.entity.name}
                              </p>

                              {confirmedAccount ? (
                                <div className="mt-3 rounded border border-green-300 bg-green-50 p-3 text-sm text-green-800">
                                  ✓ Staðfestur skuldareikningur:{" "}
                                  <strong>
                                    {confirmedAccount.number} – {confirmedAccount.name}
                                  </strong>
                                </div>
                              ) : canBook ? (
                                <form
                                  action={async (formData) => {
                                    "use server";
                                    const accountNumber = String(
                                      formData.get("loanAccountNumber") ?? ""
                                    );
                                    await confirmInsightEntityAccountLink(
                                      document.id,
                                      link.entity.id,
                                      accountNumber
                                    );
                                    redirect(
                                      `/fylgiskjol/${receipt.id}?document=${document.id}`
                                    );
                                  }}
                                  className="mt-3"
                                >
                                  <label
                                    htmlFor={`loan-account-${document.id}-${link.entity.id}`}
                                    className="block text-sm font-semibold text-blue-900"
                                  >
                                    Veldu skuldareikning fyrir þetta lán
                                  </label>

                                  <select
                                    id={`loan-account-${document.id}-${link.entity.id}`}
                                    name="loanAccountNumber"
                                    required
                                    defaultValue=""
                                    className="mt-2 w-full rounded border border-blue-300 bg-white px-3 py-2"
                                  >
                                    <option value="" disabled>
                                      Veldu reikning…
                                    </option>
                                    {accounts
                                      .filter(
                                        (account) =>
                                          account.type === "SHORT_TERM_LIABILITY" ||
                                          account.type === "LONG_TERM_LIABILITY"
                                      )
                                      .map((account) => (
                                        <option key={account.number} value={account.number}>
                                          {account.number} – {account.name}
                                        </option>
                                      ))}
                                  </select>

                                  <button
                                    type="submit"
                                    className="mt-2 rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
                                  >
                                    Staðfesta skuldareikning láns
                                  </button>

                                  <p className="mt-2 text-xs text-blue-800">
                                    GLÖGGT mun nota þessa tengingu fyrir sama lán
                                    framvegis. Lestu skjalið aftur eftir staðfestingu
                                    til að búa til öruggar bókunarlínur.
                                  </p>
                                </form>
                              ) : (
                                <p className="mt-2 text-sm text-blue-900">
                                  Skuldareikningur lánsins hefur ekki verið staðfestur.
                                </p>
                              )}
                            </div>
                          );
                        })}

                      {document.disposedAt ? (
  <div className="mt-4 rounded border border-slate-300 bg-slate-50 p-4">
    <div className="font-semibold text-slate-800">
      {document.disposition === "INSIGHT_ONLY"
        ? "Varðveitt fyrir Innsýn – ekki bókfært"
        : document.disposition === "SUPPORTING_RESOLVED"
          ? "Afgreitt sem stuðningsskjal – ekki bókfært"
          : "Ekki bókfært – utan rekstrar"}
    </div>
    {document.dispositionReason && (
      <p className="mt-2 text-sm text-slate-700">
        <strong>Ástæða:</strong> {document.dispositionReason}
      </p>
    )}
    <p className="mt-1 text-sm text-slate-600">
      <strong>Afgreitt:</strong> {formatDate(document.disposedAt)}
    </p>
  </div>
) : document.documentRole === "BOOKABLE" ? (
  <DetectedDocumentEntriesEditor
    documentId={document.id}
    entries={document.bookingEntries}
    accounts={accounts}
    vatRegistered={receipt.company.vatRegistered}
    date={document.date}
    totalAmount={document.totalAmount}
    reviewedAt={document.reviewedAt}
    approvedAt={document.approvedAt}
    voucherNumber={document.voucherNumber}
    duplicateOfDocumentId={document.duplicateOfDocumentId}
    duplicateVoucherNumber={document.duplicateVoucherNumber}
    duplicateMarkedAt={document.duplicateMarkedAt}
    canBook={canBook}
    canEdit={canEdit}
  />
) : null}
                              

                    {document.disposedAt ? (
  <>
    <div className="mt-3 rounded border border-slate-300 bg-slate-50 p-3 text-slate-700">
      Skjalið hefur verið afgreitt án bókunar og er varðveitt með rekjanleika.
    </div>
    {(() => {
      const nextDocument = getNextUnresolvedDocument(document.id);
      return nextDocument ? (
        <Link
          href={`/fylgiskjol/${receipt.id}?document=${nextDocument.id}`}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
        >
          <span>Næsta skjal</span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null;
    })()}
  </>
) : document.reviewedAt ? (
  <>
    <div className="mt-3 rounded border border-green-300 bg-green-50 p-3 text-green-700">
      ✓ Fylgiskjal yfirfarið
    </div>
    {(() => {
      const nextDocument = getNextUnresolvedDocument(document.id);
      return nextDocument ? (
        <Link
          href={`/fylgiskjol/${receipt.id}?document=${nextDocument.id}`}
          className="mt-3 flex w-full items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 font-semibold text-blue-800 transition hover:border-blue-300 hover:bg-blue-100"
        >
          <span>Næsta skjal</span>
          <span aria-hidden="true">→</span>
        </Link>
      ) : null;
    })()}
    {!document.approvedAt && !document.voucherNumber && (
  <DeleteDetectedDocumentButton
  canDelete={canDelete}
  reviewedAt={document.reviewedAt}
  onDelete={async () => {
    "use server";
    await deleteDetectedDocument(document.id);
  }}
/>
)}

{document.approvedAt &&
  !document.voucherNumber &&
  (!activeUser || activeUser.role === "ADMIN") && (
    <form
      action={async () => {
        "use server";

        await repairDeleteLegacyReceipt(receipt.id);
        redirect("/fylgiskjol");
      }}
      className="mt-3"
    >
      <button
        type="submit"
        className="rounded bg-red-700 px-4 py-2 font-semibold text-white hover:bg-red-800"
      >
        Eyða gömlu ónúmeruðu prufubókuninni
      </button>
    </form>
  )}
  </>
) : (
 
     <>               
                        {document.documentRole === "BOOKABLE" && (
                        <form
                          action={async () => {
                            "use server";

                            await reviewDetectedDocument(document.id);

                            const nextDocument =
                              await prisma.aiDetectedDocument.findFirst({
                                where: {
                                  id: {
                                    not: document.id,
                                  },
                                  reviewedAt: null,
                                  approvedAt: null,
                                  disposedAt: null,
                                  receipt: {
                                    companyId: receipt.companyId,
                                  },
                                },
                                orderBy: [
                                  {
                                    date: "asc",
                                  },
                                  {
                                    id: "asc",
                                  },
                                ],
                                select: {
                                  id: true,
                                  receiptId: true,
                                },
                              });

                            if (nextDocument) {
                              redirect(
                                `/fylgiskjol/${nextDocument.receiptId}?document=${nextDocument.id}`
                              );
                            }

                            redirect("/fylgiskjol");
                          }}
                          className="mt-3"
                        >
                          <button
  type="submit"
  disabled={document.bookingEntries.length === 0}
  className="rounded bg-green-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:opacity-50"
>
  Merkja yfirfarið
</button>
                        </form>
                        )}

                        {canBook && document.documentRole === "INSIGHT_SOURCE" && (
                          <form
                            action={async () => {
                              "use server";

                              await retainDetectedDocumentForInsight(
                                document.id,
                                "Varðveitt sem Innsýn-gagn án bókunar."
                              );

                              const nextDocument =
                                await prisma.aiDetectedDocument.findFirst({
                                  where: {
                                    id: { not: document.id },
                                    reviewedAt: null,
                                    approvedAt: null,
                                    disposedAt: null,
                                    receipt: { companyId: receipt.companyId },
                                  },
                                  orderBy: [{ date: "asc" }, { id: "asc" }],
                                  select: { id: true, receiptId: true },
                                });

                              if (nextDocument) {
                                redirect(
                                  `/fylgiskjol/${nextDocument.receiptId}?document=${nextDocument.id}`
                                );
                              }

                              redirect("/fylgiskjol");
                            }}
                            className="mt-3 rounded border border-indigo-200 bg-indigo-50 p-3"
                          >
                            <p className="text-sm text-indigo-900">
                              Skjalið verður varðveitt fyrir Innsýn en engin bókun eða fylgiskjalsnúmer verður stofnað.
                            </p>
                            <button
                              type="submit"
                              className="mt-2 rounded bg-indigo-700 px-4 py-2 font-semibold text-white hover:bg-indigo-800"
                            >
                              Varðveita fyrir Innsýn – ekki bóka
                            </button>
                          </form>
                        )}

                        {canBook && document.documentRole === "SUPPORTING" && (
                          <form
                            action={async () => {
                              "use server";

                              await resolveDetectedDocumentAsSupporting(
                                document.id,
                                "Afgreitt sem stuðningsskjal án sjálfstæðrar bókunar."
                              );

                              const nextDocument =
                                await prisma.aiDetectedDocument.findFirst({
                                  where: {
                                    id: { not: document.id },
                                    reviewedAt: null,
                                    approvedAt: null,
                                    disposedAt: null,
                                    receipt: { companyId: receipt.companyId },
                                  },
                                  orderBy: [{ date: "asc" }, { id: "asc" }],
                                  select: { id: true, receiptId: true },
                                });

                              if (nextDocument) {
                                redirect(
                                  `/fylgiskjol/${nextDocument.receiptId}?document=${nextDocument.id}`
                                );
                              }

                              redirect("/fylgiskjol");
                            }}
                            className="mt-3 rounded border border-blue-200 bg-blue-50 p-3"
                          >
                            <p className="text-sm text-blue-900">
                              Skjalið styður annan fjárhagsatburð og verður varðveitt án sjálfstæðrar bókunar.
                            </p>
                            <button
                              type="submit"
                              className="mt-2 rounded bg-blue-700 px-4 py-2 font-semibold text-white hover:bg-blue-800"
                            >
                              Afgreiða sem stuðningsskjal
                            </button>
                          </form>
                        )}

                        {canBook && document.documentRole !== "INSIGHT_SOURCE" && document.documentRole !== "SUPPORTING" && (
                          <form
                            action={async (formData) => {
                              "use server";

                              const reason = String(
                                formData.get("outsideBusinessReason") ?? ""
                              ).trim();

                              await markDetectedDocumentOutsideBusiness(
                                document.id,
                                reason
                              );

                              const nextDocument =
                                await prisma.aiDetectedDocument.findFirst({
                                  where: {
                                    id: {
                                      not: document.id,
                                    },
                                    reviewedAt: null,
                                    approvedAt: null,
                                    disposedAt: null,
                                    receipt: {
                                      companyId: receipt.companyId,
                                    },
                                  },
                                  orderBy: [
                                    {
                                      date: "asc",
                                    },
                                    {
                                      id: "asc",
                                    },
                                  ],
                                  select: {
                                    id: true,
                                    receiptId: true,
                                  },
                                });

                              if (nextDocument) {
                                redirect(
                                  `/fylgiskjol/${nextDocument.receiptId}?document=${nextDocument.id}`
                                );
                              }

                              redirect("/fylgiskjol");
                            }}
                            className="mt-3 rounded border border-slate-300 bg-slate-50 p-3"
                          >
                            <label
                              htmlFor={`outside-business-reason-${document.id}`}
                              className="block text-sm font-semibold text-slate-800"
                            >
                              Ástæða fyrir því að skjalið á ekki að tilheyra þessu umhverfi
                            </label>

                            <textarea
                              id={`outside-business-reason-${document.id}`}
                              name="outsideBusinessReason"
                              required
                              rows={2}
                              placeholder="T.d. persónuleg trygging sem tengist ekki rekstri."
                              className="mt-2 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
                            />

                            <button
                              type="submit"
                              className="mt-2 rounded bg-slate-700 px-4 py-2 font-semibold text-white hover:bg-slate-800"
                            >
                              Afgreiða utan þessa umhverfis
                            </button>
                          </form>
                        )}

                        {document.documentRole !== "INSIGHT_SOURCE" &&
                          document.documentRole !== "SUPPORTING" && (
                        <form
  action={async () => {
    "use server";
    await markReceiptNeedsAttention(receipt.id);
  }}
  className="mt-2"
>
  <button
    type="submit"
    className="rounded bg-amber-500 px-4 py-2 text-white hover:bg-amber-600"
  >
    Þarf skoðun
  </button>
</form>
                        )}
</>
                      )}
                    </div>
                  )
                )}
              </div>
            </div>
          )}
        </div>
      </div>

     

        
      
    </main>
  );
}