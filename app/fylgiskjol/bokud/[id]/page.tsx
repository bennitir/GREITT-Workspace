import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { supabaseAdmin } from "@/lib/supabase";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
export default async function BokudFylgiskjalPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const voucherNumber = Number(id);

  const cookieStore = await cookies();
const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

if (!activeCompanyId) {
  redirect("/fyrirtaeki");
}

const companyId = Number(activeCompanyId);

const moduleSettings = await getCompanyModuleSettings(companyId);

const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
  (module) => module.id,
);

if (!enabledModuleIds.includes("bokhald")) {
  redirect("/");
}

  if (!Number.isFinite(voucherNumber)) {
    notFound();
  }

  const aiDocument = await prisma.aiDetectedDocument.findFirst({
  where: {
    voucherNumber,
    receipt: {
      companyId,
    },
    approvedAt: {
      not: null,
    },
  },
  include: {
    receipt: true,
    bookingEntries: true,
  },
});

const importedReceipt = !aiDocument
  ? await prisma.receipt.findFirst({
      where: {
        companyId,
        voucherNumber,
        status: "APPROVED",
      },
      include: {
        entries: true,
      },
    })
  : null;

if (!aiDocument && !importedReceipt) {
  notFound();
}

const document = aiDocument
  ? aiDocument
  : {
      id: importedReceipt!.id,
      voucherNumber: importedReceipt!.voucherNumber,
      date: importedReceipt!.date,
      merchantName:
        importedReceipt!.merchantName ??
        importedReceipt!.description,
      merchantKennitala:
        importedReceipt!.merchantKennitala,
      totalAmount: importedReceipt!.amount,
      bookingEntries: importedReceipt!.entries,
      receipt: importedReceipt!,
    };

    let originalFileUrl = document.receipt.filePath ?? null;

if (document.receipt.storagePath) {
  const { data } = await supabaseAdmin.storage
    .from("fylgiskjol")
    .createSignedUrl(document.receipt.storagePath, 60 * 10);

  if (data?.signedUrl) {
    originalFileUrl = data.signedUrl;
  }
}

  return (
    <main className="p-8 text-lg">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center justify-between">
  <div>
    <h1 className="text-3xl font-bold">
      Fylgiskjal {document.voucherNumber}
    </h1>

    <p className="mt-1 text-slate-600">
      {document.merchantName ?? "Óþekktur seljandi"}
    </p>
  </div>
<div className="flex gap-3">
  {document.receipt.filePath ? (
  <a
    href={originalFileUrl ?? "#"}
    target="_blank"
    rel="noopener noreferrer"
    className="rounded border border-blue-600 px-4 py-2 font-medium text-blue-700 hover:bg-blue-50"
  >
    Opna frumskjal
  </a>
) : (
  <span className="rounded border px-4 py-2 text-slate-500">
    Frumskjal fylgdi ekki innflutningi
  </span>
)}

    <Link
      href="/fylgiskjol/bokud"
      className="rounded border px-4 py-2 hover:bg-slate-50"
    >
      Til baka í bókuð skjöl
    </Link>
  </div>
</div>
        

        <div className="grid grid-cols-[0.9fr_1.4fr] gap-6">
          <section className="rounded border p-5">
            <h2 className="text-xl font-bold">Fylgiskjal</h2>

            <div className="mt-4 grid grid-cols-[120px_1fr] gap-y-3">
  <strong>Dagsetning:</strong>
  <span>
    {document.date
  ? formatDate(document.date)
  : "—"}
  </span>

  <strong>Seljandi:</strong>
  <span>{document.merchantName ?? "—"}</span>

  <strong>Kennitala:</strong>
  <span>{document.merchantKennitala ?? "—"}</span>

  <strong>Upphæð:</strong>
  <span>
    {formatNumber(document.totalAmount ?? 0)} kr.
  </span>
</div>
          </section>

          <section className="rounded border p-5">
            <h2 className="text-xl font-bold">Bókun</h2>

            <div className="mt-4 space-y-3">
              {document.bookingEntries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[60px_1fr_110px_110px] gap-4 border-b pb-2"
                >
                  <strong>{entry.account}</strong>
                  <span>{entry.text}</span>
                  <span className="text-right whitespace-nowrap">
  Debet {formatNumber(entry.debit)} kr.
</span>

<span className="text-right whitespace-nowrap">
  Kredit {formatNumber(entry.credit)} kr.
</span>
                </div>
              ))}
              {(() => {
  const totalDebit = document.bookingEntries.reduce(
    (sum, entry) => sum + entry.debit,
    0
  );

  const totalCredit = document.bookingEntries.reduce(
    (sum, entry) => sum + entry.credit,
    0
  );

  const balances = Math.abs(totalDebit - totalCredit) <= 0.01;

  return (
    <div className="mt-4 border-t pt-4">
      <div className="flex justify-between">
        <strong>Debet samtals:</strong>
        <strong>{formatNumber(totalDebit)} kr.</strong>
      </div>

      <div className="mt-1 flex justify-between">
        <strong>Kredit samtals:</strong>
        <strong>{formatNumber(totalCredit)} kr.</strong>
      </div>

      <div
        className={`mt-3 font-semibold ${
          balances ? "text-green-700" : "text-red-700"
        }`}
      >
        {balances
          ? "✓ Bókun stemmir"
          : "⚠ Debet og kredit stemma ekki"}
      </div>
    </div>
  );
})()}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}