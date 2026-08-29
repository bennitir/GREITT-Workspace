import {
  formatDate,
  formatNumber,
} from "@/lib/locale";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { confirmBankImport } from "@/app/banki/actions";

type Props = {
  params: Promise<{
    id: string;
    batchId: string;
  }>;
};

export default async function BankImportPreviewPage({ params }: Props) {
  const { id, batchId } = await params;

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
      sourceType: "BANK_XLSX",
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

  const validRows = batch.rows.filter((row) => row.status !== "ERROR");
  const errorRows = batch.rows.filter((row) => row.status === "ERROR");

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">
        📥 Forskoðun bankayfirlits
      </h1>

      <div className="mt-6 max-w-6xl rounded-lg border p-6">
        <h2 className="text-xl font-semibold">
          {batch.bankAccount.bankName}
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

          <p className="mt-1">
            <strong>Í lagi:</strong> {validRows.length}
          </p>

          <p className="mt-1">
            <strong>Villur:</strong> {errorRows.length}
          </p>
        </div>

        <form action={confirmBankImport} className="mt-6">
  <input
    type="hidden"
    name="batchId"
    value={batch.id}
  />

  <button
    type="submit"
    className="rounded-lg bg-green-600 px-4 py-2 font-medium text-white"
  >
    ✅ Staðfesta innflutning
  </button>
</form>

        <div className="mt-6 overflow-x-auto">
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
              {batch.rows.slice(0, 50).map((row) => {
  const raw = row.rawData
    ? JSON.parse(row.rawData)
    : {};

  return (
                <tr key={row.id} className="border-b">
                  <td className="p-2">{row.rowNumber}</td>
{row.date
  ? formatDate(row.date)
  : "—"}

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
                      : "🟢 Tilbúið"}
                  </td>
                </tr>
              );
})}
            </tbody>
          </table>
        </div>

        {batch.rows.length > 50 && (
          <p className="mt-4 text-sm text-gray-600">
            Sýni fyrstu 50 færslurnar af {batch.rows.length}.
          </p>
        )}
      </div>
    </main>
  );
}