import { getCompanyAccess } from "@/lib/core/access-control";
import DeleteDetectedDocumentButton from "@/components/DeleteDetectedDocumentButton";
import ApproveDocumentButton from "@/components/ApproveDocumentButton";
import {
  analyzeReceiptWithAI,
  reviewDetectedDocument,
  approveDetectedDocument,
  deleteDetectedDocument,
  deleteReceipt,
  markReceiptNeedsAttention,
  cancelManualReceipt,
  repairDeleteLegacyReceipt,
} from "@/app/actions/receiptActions";
import DetectedDocumentEntriesEditor from "@/components/DetectedDocumentEntriesEditor";

import { prisma } from "@/lib/prisma";
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
        {receipt.amount.toLocaleString("is-IS")} kr.
      </span>

      {receipt.filePath && (
  <>
    <a
      href={originalFileUrl ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
      className="ml-2 rounded border px-3 py-2 font-medium text-blue-600 hover:bg-blue-50"
    >
      Opna frumskjal
    </a>
{!receipt.aiDetectedDocuments.some(
  (document) => document.reviewedAt !== null
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
        Lesa fylgiskjal með AI
      </button>
    </form>
    )}
    {!receipt.aiDetectedDocuments.some(
  (document) => document.reviewedAt !== null
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
            {receipt.ocrStatus ?? "Ekki lesið"}
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
          Bókun
        </h2>

{visibleDocuments.some((document) => !document.reviewedAt) && (
  <div className="mb-4 rounded border border-red-300 bg-red-50 p-3 font-semibold text-red-700">
    🔒 Ekki hægt að bóka fyrr en fylgiskjalið hefur verið merkt yfirfarið.
  </div>
)}

        {visibleDocuments.length > 0 && (
  <div className="mb-4">
    {visibleDocuments.every(
      (document) => document.approvedAt
    ) ? (
              <div className="rounded border border-green-300 bg-green-50 p-3 text-green-700">
                ✓ Öll greind fylgiskjöl samþykkt
              </div>
            ) : (
              <div className="rounded border border-yellow-300 bg-yellow-50 p-3 text-yellow-700">
                Bíður eftir samþykkt allra
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
          ? `Debet ${entry.debit.toLocaleString(
              "is-IS"
            )} kr.`
          : ""}
      </span>

      <span>
        {entry.credit > 0
          ? `Kredit ${entry.credit.toLocaleString(
              "is-IS"
            )} kr.`
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
                ? receipt.aiDate.toLocaleDateString(
                    "is-IS"
                  )
                : "Engin tillaga"}
            </p>

            <p className="mt-1">
              <strong>Upphæð:</strong>{" "}
{selectedDocumentId && visibleDocuments[0]?.totalAmount != null
  ? `${visibleDocuments[0].totalAmount.toLocaleString(
      "is-IS"
    )} kr.`
  : receipt.aiAmount != null
    ? `${receipt.aiAmount.toLocaleString(
        "is-IS"
      )} kr.`
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
                          ? document.date.toLocaleDateString(
                              "is-IS"
                            )
                          : "Óþekkt"}
                      </p>

                      <p>
                        <strong>Upphæð:</strong>{" "}
                        {document.totalAmount != null
                          ? `${document.totalAmount.toLocaleString(
                              "is-IS"
                            )} kr.`
                          : "Óþekkt"}
                      </p>

                      <p className="mt-2 text-sm">
                        {document.summary}
                      </p>

                      <DetectedDocumentEntriesEditor
  documentId={document.id}
  entries={document.bookingEntries}
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
                              

                    {document.reviewedAt ? (
  <>
    <div className="mt-3 rounded border border-green-300 bg-green-50 p-3 text-green-700">
      ✓ Fylgiskjal yfirfarið
    </div>
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
                        <form
                          action={async () => {
                            "use server";
                            await reviewDetectedDocument(
                              document.id
                            );

                            const nextDocument = receipt.aiDetectedDocuments
  .filter(
    (item) =>
      item.id !== document.id &&
      !item.reviewedAt &&
      !item.approvedAt
  )
  .sort((a, b) => a.id - b.id)[0];

if (nextDocument) {
  redirect(
    `/fylgiskjol/${receipt.id}?document=${nextDocument.id}`
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