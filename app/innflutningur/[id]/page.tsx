import {
  validateImportBatch,
  postImportBatch,
} from "@/app/actions/importActions";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCompanyAccess } from "@/lib/core/access-control";

export default async function ImportPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);
  const access = await getCompanyAccess(companyId);

  if (!access.allowed) {
    redirect("/fyrirtaeki");
  }

  const { id } = await params;

  const importBatch = await prisma.importBatch.findFirst({
    where: {
      id: Number(id),
      companyId,
    },
    include: {
      rows: true,
    },
  });

  if (!importBatch) {
    notFound();
  }

  const totalDebit = importBatch.rows.reduce(
  (sum, row) => sum + row.debit,
  0
);

const totalCredit = importBatch.rows.reduce(
  (sum, row) => sum + row.credit,
  0
);

const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01;

const accountNumbers = [
  ...new Set(
    importBatch.rows
      .map((row) => row.account)
      .filter((account): account is string => Boolean(account))
  ),
];

const existingAccounts = await prisma.account.findMany({
  where: {
    companyId,
    number: {
      in: accountNumbers,
    },
  },
  select: {
    number: true,
    name: true,
  },
});

const existingAccountNumbers = new Set(
  existingAccounts.map((account) => account.number)
);

const missingAccounts = accountNumbers.filter(
  (account) => !existingAccountNumbers.has(account)
);

const canImport = isBalanced && missingAccounts.length === 0;

  return (
    <main className="w-full max-w-[1400px] mx-auto p-4">
      <h1 className="text-2xl font-bold">Forskoðun innflutnings</h1>

      <div className="mt-4 rounded-lg border p-4">
        <p>
          <strong>Skrá:</strong> {importBatch.fileName}
        </p>
        <p>
          <strong>Tegund:</strong> {importBatch.sourceType}
        </p>
        <p>
          <strong>Staða:</strong> {importBatch.status}
        </p>
        <p>
          <strong>Fjöldi lína:</strong> {importBatch.rows.length}
        </p>
      </div>

<div className="mt-6 rounded-lg border p-4">
  <h2 className="text-lg font-semibold">Innlesnar línur</h2>

  <div className="mt-3 overflow-x-auto">
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b text-left">
          <th className="p-2">Lína</th>
          <th className="p-2">Fylgiskjal</th>
          <th className="p-2">Dagsetning</th>
          <th className="p-2">Reikningslykill</th>
          <th className="p-2">Texti</th>
          <th className="p-2 text-right">Debet</th>
          <th className="p-2 text-right">Kredit</th>
        </tr>
      </thead>

      <tbody>
        {importBatch.rows.map((row) => (
          <tr key={row.id} className="border-b">
            <td className="p-2">{row.rowNumber}</td>
            <td className="p-2">{row.voucherNumber ?? ""}</td>
            <td className="p-2">
              {row.date
                ? row.date.toLocaleDateString("is-IS")
                : ""}
            </td>
            <td className="p-2">{row.account ?? ""}</td>
            <td className="p-2">{row.text ?? ""}</td>
            <td className="p-2 text-right">
              {row.debit.toLocaleString("is-IS")}
            </td>
            <td className="p-2 text-right">
              {row.credit.toLocaleString("is-IS")}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

  <div className="mt-4 rounded-lg bg-slate-50 p-4">
  <div className="flex flex-wrap gap-6">
    <p>
      <strong>Debet samtals:</strong>{" "}
      {totalDebit.toLocaleString("is-IS")} kr.
    </p>

    <p>
      <strong>Kredit samtals:</strong>{" "}
      {totalCredit.toLocaleString("is-IS")} kr.
    </p>
  </div>

  <p
    className={`mt-3 font-semibold ${
      isBalanced ? "text-green-700" : "text-red-700"
    }`}
  >
    {isBalanced
      ? "✓ Innflutningur stemmir"
      : "⚠ Debet og kredit stemma ekki"}
  </p>
</div>
</div>

<div className="mt-4 rounded-lg border p-4">
  <h3 className="font-semibold">Athugun á reikningslyklum</h3>

  {accountNumbers.map((accountNumber) => {
    const account = existingAccounts.find(
      (item) => item.number === accountNumber
    );

    return (
      <p
        key={accountNumber}
        className={`mt-2 font-medium ${
          account ? "text-green-700" : "text-red-700"
        }`}
      >
        {account
          ? `✓ ${accountNumber} – ${account.name}`
          : `⚠ ${accountNumber} – Reikningslykill finnst ekki`}
      </p>
    );
  })}

  {missingAccounts.length > 0 && (
    <p className="mt-4 font-semibold text-red-700">
      Ekki verður hægt að bóka innflutning fyrr en allir reikningslyklar hafa verið leiðréttir.
    </p>
  )}
</div>

<div
  className={`mt-4 rounded-lg border p-4 font-semibold ${
    canImport
      ? "border-green-300 bg-green-50 text-green-700"
      : "border-red-300 bg-red-50 text-red-700"
  }`}
>
  {canImport
    ? "✓ Tilbúið til innflutnings"
    : "⚠ Ekki hægt að flytja inn fyrr en allar athuganir standast"}
</div>

{canImport && importBatch.status === "NEW" && (
  <form
    action={async () => {
      "use server";
      await validateImportBatch(importBatch.id);
    }}
    className="mt-4"
  >
    <button
      type="submit"
      className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
    >
      Yfirfara innflutning
    </button>
  </form>
)}
{canImport && importBatch.status === "VALIDATED" && (
  <form
    action={async () => {
      "use server";
      await postImportBatch(importBatch.id);
    }}
    className="mt-4"
  >
    <button
      type="submit"
      className="rounded bg-green-600 px-4 py-2 font-medium text-white hover:bg-green-700"
    >
      Bóka innflutning
    </button>
  </form>
)}


    </main>
  );



}
