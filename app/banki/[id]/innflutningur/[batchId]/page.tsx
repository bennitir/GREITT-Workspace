import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { cancelBankImport, confirmBankImport } from "@/app/banki/actions";

type Props = {
  params: Promise<{
    id: string;
    batchId: string;
  }>;
  searchParams: Promise<{ page?: string | string[]; all?: string | string[] }>;
};

export default async function BankImportPreviewPage({ params, searchParams }: Props) {
  const { id, batchId } = await params;
  const { page: pageParam, all: allParam } = await searchParams;

  const cookieStore = await cookies();
  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  const bankAccountId = Number(id);
  const importBatchId = Number(batchId);

  if (!activeCompanyId || !bankAccountId || !importBatchId) {
    notFound();
  }

  const batch = await prisma.importBatch.findFirst({
    where: {
      id: importBatchId,
      companyId: activeCompanyId,
      bankAccountId,
      sourceType: "BANK_STATEMENT_XLSX",
    },
    include: {
      rows: {
        orderBy: {
          rowNumber: "asc",
        },
      },
      bankAccount: true,
    },
  });

  if (!batch || !batch.bankAccount) {
    notFound();
  }

  const newRows = batch.rows.filter((row) => row.status === "NEW");
  const duplicateRows = batch.rows.filter((row) => row.status === "DUPLICATE");
  const errorRows = batch.rows.filter((row) => row.status === "ERROR");

  const sortedDates = batch.rows
    .flatMap((row) => row.date ? [row.date] : [])
    .sort((a, b) => a.getTime() - b.getTime());
  const earliestDate = sortedDates[0];
  const latestDate = sortedDates[sortedDates.length - 1];

  const pageSize = 50;
  const totalPages = Math.max(1, Math.ceil(batch.rows.length / pageSize));
  const parsedPage = typeof pageParam === "string" ? Number(pageParam) : NaN;
  const currentPage = Number.isInteger(parsedPage) && parsedPage >= 1
    ? Math.min(parsedPage, totalPages)
    : 1;
  const showAll = allParam === "1" && batch.rows.length <= 500;
  const offset = (currentPage - 1) * pageSize;
  const visibleRows = showAll ? batch.rows : batch.rows.slice(offset, offset + pageSize);
  const pageUrl = (page: number) => `/banki/${bankAccountId}/innflutningur/${importBatchId}?page=${page}`;
  const allUrl = `/banki/${bankAccountId}/innflutningur/${importBatchId}?all=1`;

  const pager = (
    <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
      <p className="text-gray-700">
        Sýni {visibleRows.length === 0 ? 0 : showAll ? 1 : offset + 1}–
        {showAll ? batch.rows.length : Math.min(offset + pageSize, batch.rows.length)}
        {" "}af {batch.rows.length} færslum
        {!showAll && totalPages > 1 ? ` · Síða ${currentPage} af ${totalPages}` : ""}.
      </p>
      <nav aria-label="Fletta bankafærslum" className="flex flex-wrap gap-2">
        {!showAll && currentPage > 1 && (
          <a href={pageUrl(currentPage - 1)} className="rounded border px-3 py-2 hover:bg-gray-50">
            ← Fyrri 50
          </a>
        )}
        {!showAll && currentPage < totalPages && (
          <a href={pageUrl(currentPage + 1)} className="rounded border px-3 py-2 hover:bg-gray-50">
            Næstu {Math.min(pageSize, batch.rows.length - currentPage * pageSize)} →
          </a>
        )}
        {batch.rows.length > pageSize && batch.rows.length <= 500 && (
          <a
            href={showAll ? pageUrl(1) : allUrl}
            className="rounded border border-blue-500 px-3 py-2 font-medium text-blue-700 hover:bg-blue-50"
          >
            {showAll ? "Sýna 50 í einu" : `Sýna allar ${batch.rows.length} færslurnar`}
          </a>
        )}
      </nav>
    </div>
  );

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">
        📥 Forskoðun bankayfirlits
      </h1>

      <div className="mt-6 max-w-6xl rounded-lg border p-6">
        <h2 className="text-xl font-semibold">
          {batch.bankAccount.name} · {batch.bankAccount.bankName}
        </h2>

        <p className="mt-1 text-gray-600">
          {batch.bankAccount.accountNumber ?? "Reikningsnúmer ekki skráð"}
        </p>

        <div className="mt-4 rounded-lg bg-gray-50 p-4">
          <p>
            <strong>Skrá:</strong> {batch.fileName}
          </p>

          <p className="mt-1">
            <strong>Færslur:</strong> {batch.rows.length}
          </p>

          {earliestDate && latestDate && (
            <p className="mt-1">
              <strong>Tímabil í skrá:</strong> {formatDate(earliestDate)} – {formatDate(latestDate)}
            </p>
          )}

          <p className="mt-1">
            <strong>Til innflutnings:</strong> {newRows.length}
          </p>

          <p className="mt-1">
            <strong>Þegar innflutt:</strong> {duplicateRows.length}
          </p>

          <p className="mt-1">
            <strong>Villur:</strong> {errorRows.length}
          </p>
        </div>

        <div className="mt-6 flex flex-wrap gap-3">
          {newRows.length > 0 && (
            <form action={confirmBankImport}>
              <input type="hidden" name="batchId" value={batch.id} />
              <button
                type="submit"
                className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white"
              >
                ✅ Staðfesta innflutning ({newRows.length})
              </button>
            </form>
          )}

          <form action={cancelBankImport}>
            <input type="hidden" name="batchId" value={batch.id} />
            <button
              type="submit"
              className="rounded-lg border px-4 py-2 font-medium"
            >
              ← Hætta við innflutning
            </button>
          </form>
        </div>

        {newRows.length === 0 && duplicateRows.length > 0 && errorRows.length === 0 && (
          <p className="mt-4 rounded-lg bg-amber-50 p-4 text-amber-900">
            Allar færslurnar í þessari skrá hafa þegar verið fluttar inn. Engar nýjar bankafærslur verða stofnaðar.
          </p>
        )}

        <div className="mt-6">{pager}</div>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b">
                <th className="p-2">Nr.</th>
                <th className="p-2">Dagsetning</th>
                <th className="p-2">Texti</th>
                <th className="p-2">Kennitala mótaðila</th>
                <th className="p-2">Tilvísun</th>
                <th className="p-2">Textalykill</th>
                <th className="p-2 text-right">Út</th>
                <th className="p-2 text-right">Inn</th>
                <th className="p-2">Staða</th>
              </tr>
            </thead>

            <tbody>
              {visibleRows.map((row) => {
  const raw = row.rawData
    ? JSON.parse(row.rawData)
    : {};

  return (
                <tr key={row.id} className="border-b">
                  <td className="p-2">{row.rowNumber}</td>
                  <td className="p-2">{row.date ? formatDate(row.date) : "—"}</td>

                  <td className="p-2">{row.text ?? "—"}</td>
                  <td className="p-2">{raw.counterpartyKennitala || "—"}</td>
                  <td className="p-2">{raw.reference || "—"}</td>
                  <td className="p-2">{raw.textKey || "—"}</td>

                  <td className="p-2 text-right">
                    {row.debit
  ? `${formatNumber(row.debit)} kr.`
  : "—"}
                  </td>

                  <td className="p-2 text-right">
                    {row.credit
  ? `${formatNumber(row.credit)} kr.`
  : "—"}
                  </td>

                  <td className="p-2">
                    {row.status === "ERROR"
                      ? `🔴 ${row.errorMessage ?? "Villa"}`
                      : row.status === "DUPLICATE"
                        ? "🟠 Þegar innflutt"
                        : "🟢 Tilbúið"}
                  </td>
                </tr>
              );
})}
            </tbody>
          </table>
        </div>

        <div className="mt-4">{pager}</div>
      </div>
    </main>
  );
}