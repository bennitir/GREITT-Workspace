import { formatIsk } from "@/app/banki/_lib/formatting/numbers";
import { formatDate } from "@/lib/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireActiveCompanyReadAccess } from "@/lib/core/company-read-access";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BankareikningurPage({ params }: Props) {
  const { id } = await params;

  // The cookie only selects a company; authorization requires a live membership check.
  const { companyId: activeCompanyId } = await requireActiveCompanyReadAccess();
  const bankAccountId = Number(id);

  if (!Number.isSafeInteger(bankAccountId) || bankAccountId <= 0) {
    notFound();
  }

  const account = await prisma.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      companyId: activeCompanyId,
      isActive: true,
    },
  });

  if (!account) {
    notFound();
  }

  const transactions = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: account.id,
    },
    orderBy: {
      date: "desc",
    },
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">
        🏦 {account.name}
      </h1>

      <div className="mt-6 max-w-4xl rounded-lg border p-6">
        <p>
          <strong>{account.bankName} · Reikningsnúmer:</strong>{" "}
          {account.accountNumber ?? "Ekki skráð"}
        </p>

        <p className="mt-1">
          <strong>IBAN:</strong>{" "}
          {account.iban ?? "Ekki skráð"}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={`/banki/${account.id}/afstemming?layout=visual`}
            className="inline-block rounded-lg bg-teal-800 px-4 py-2 font-semibold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-900"
          >
            ⚖️ Opna þriggja dálka afstemmingu
          </Link>
          <Link
            href={`/banki/${account.id}/afstemming`}
            className="inline-block rounded-lg border border-teal-700 px-4 py-2 font-medium text-teal-800"
          >
            Hefðbundin afstemming
          </Link>
          <Link
            href={`/banki/${account.id}/ny`}
            className="inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-700"
          >
            + Ný bankafærsla
          </Link>
          <Link
            href={`/banki/${account.id}/innflutningur`}
            className="inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-700"
          >
            📥 Flytja inn bankayfirlit
          </Link>
          <Link
            href={`/banki/${account.id}/greining`}
            className="inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-700"
          >
            🔎 Greina færslur
          </Link>
        </div>

        <h2 className="mt-8 text-xl font-semibold">
          Bankafærslur
        </h2>

        {transactions.length === 0 ? (
          <p className="mt-4 text-gray-600">
            Engar bankafærslur hafa verið sóttar enn.
          </p>
        ) : (
          <div className="mt-4 space-y-2">
            {transactions.map((transaction) => (
              <div
                key={transaction.id}
                className="rounded-lg border p-4"
              >
                <p className="font-medium">
                  {transaction.text}
                </p>

                <p className="mt-1">
                  {formatDate(transaction.date)}
                </p>

                <p className="mt-1 font-semibold">
                  {formatIsk(transaction.amount.toNumber())}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}