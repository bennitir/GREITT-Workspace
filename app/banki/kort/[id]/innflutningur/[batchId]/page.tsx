import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { formatDate, formatNumber } from "@/lib/locale";
import {
  cancelPaymentCardImport,
  confirmPaymentCardImport,
} from "@/app/banki/kort/actions";
import { paymentCardPageContext } from "@/app/banki/kort/_lib/page-context";

type Props = {
  params: Promise<{ id: string; batchId: string }>;
};

function optionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export default async function PaymentCardImportPreviewPage({ params }: Props) {
  const { id, batchId } = await params;
  const paymentCardId = Number(id);
  const importBatchId = Number(batchId);
  const { companyId, t } = await paymentCardPageContext();

  if (!companyId || !paymentCardId || !importBatchId) notFound();

  const batch = await prisma.importBatch.findFirst({
    where: {
      id: importBatchId,
      companyId,
      paymentCardId,
      sourceType: "PAYMENT_CARD_STATEMENT_XLSX",
    },
    include: {
      rows: { orderBy: { rowNumber: "asc" } },
      paymentCard: true,
    },
  });

  if (!batch?.paymentCard) notFound();

  const newRows = batch.rows.filter((row) => row.status === "NEW");
  const duplicateRows = batch.rows.filter((row) => row.status === "DUPLICATE");
  const errorRows = batch.rows.filter((row) => row.status === "ERROR");

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">📥 {t.previewTitle}</h1>

      <div className="mt-6 max-w-7xl rounded-lg border p-6">
        <h2 className="text-xl font-semibold">{batch.paymentCard.name}</h2>

        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p><strong>{t.file}:</strong> {batch.fileName}</p>
          <p className="mt-1"><strong>{t.rows}:</strong> {batch.rows.length}</p>
          <p className="mt-1"><strong>{t.readyToImport}:</strong> {newRows.length}</p>
          <p className="mt-1"><strong>{t.alreadyImported}:</strong> {duplicateRows.length}</p>
          <p className="mt-1"><strong>{t.errors}:</strong> {errorRows.length}</p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {newRows.length > 0 && (
            <form action={confirmPaymentCardImport}>
              <input type="hidden" name="batchId" value={batch.id} />
              <button
                type="submit"
                className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white"
              >
                ✅ {t.confirmImport} ({newRows.length})
              </button>
            </form>
          )}

          <form action={cancelPaymentCardImport}>
            <input type="hidden" name="batchId" value={batch.id} />
            <button type="submit" className="rounded-lg border px-4 py-2 font-medium">
              ← {t.cancelImport}
            </button>
          </form>
        </div>

        {newRows.length === 0 && duplicateRows.length > 0 && errorRows.length === 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900">{t.allImported}</p>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2">{t.rowNo}</th>
                <th className="p-2">{t.date}</th>
                <th className="p-2">{t.merchant}</th>
                <th className="p-2">{t.category}</th>
                <th className="p-2 text-right">{t.foreignAmount}</th>
                <th className="p-2">{t.currency}</th>
                <th className="p-2 text-right">{t.exchangeRate}</th>
                <th className="p-2 text-right">{t.out}</th>
                <th className="p-2 text-right">{t.in}</th>
                <th className="p-2">{t.cardPeriod}</th>
                <th className="p-2">{t.status}</th>
              </tr>
            </thead>
            <tbody>
              {batch.rows.slice(0, 100).map((row) => {
                const raw = row.rawData ? JSON.parse(row.rawData) as Record<string, unknown> : {};
                const foreignAmount = optionalNumber(raw.foreignAmount);
                const exchangeRate = optionalNumber(raw.exchangeRate);

                return (
                  <tr key={row.id} className="border-b align-top">
                    <td className="p-2">{row.rowNumber}</td>
                    <td className="whitespace-nowrap p-2">{row.date ? formatDate(row.date) : "—"}</td>
                    <td className="p-2 font-medium">{row.text ?? "—"}</td>
                    <td className="p-2">{String(raw.merchantCategory || "—")}</td>
                    <td className="whitespace-nowrap p-2 text-right">
                      {foreignAmount !== null ? formatNumber(foreignAmount) : "—"}
                    </td>
                    <td className="p-2">{String(raw.currency || "—")}</td>
                    <td className="whitespace-nowrap p-2 text-right">
                      {exchangeRate !== null ? formatNumber(exchangeRate) : "—"}
                    </td>
                    <td className="whitespace-nowrap p-2 text-right">
                      {row.debit ? `${formatNumber(row.debit)} kr.` : "—"}
                    </td>
                    <td className="whitespace-nowrap p-2 text-right">
                      {row.credit ? `${formatNumber(row.credit)} kr.` : "—"}
                    </td>
                    <td className="p-2">{String(raw.cardPeriod || "—")}</td>
                    <td className="p-2">
                      {row.status === "ERROR"
                        ? `🔴 ${row.errorMessage ?? t.error}`
                        : row.status === "DUPLICATE"
                          ? `🟠 ${t.duplicate}`
                          : `🟢 ${t.ready}`}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {batch.rows.length > 100 && (
          <p className="mt-4 text-sm text-gray-600">
            {t.showingFirst} 100 {t.of} {batch.rows.length}.
          </p>
        )}
      </div>
    </main>
  );
}
