import { formatDate } from "@/lib/locale";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

export default async function BankareikningurPage({ params }: Props) {
  const { id } = await params;

  const cookieStore = await cookies();
  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value
  );

  const bankAccountId = Number(id);

  if (!activeCompanyId || !bankAccountId) {
    notFound();
  }

  const account = await prisma.bankAccount.findFirst({
    where: {
      id: bankAccountId,
      companyId: activeCompanyId,
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
        🏦 {account.bankName}
      </h1>

      <div className="mt-6 max-w-4xl rounded-lg border p-6">
        <p>
          <strong>Reikningsnúmer:</strong>{" "}
          {account.accountNumber ?? "Ekki skráð"}
        </p>

        <p className="mt-1">
          <strong>IBAN:</strong>{" "}
          {account.iban ?? "Ekki skráð"}
        </p>

        <Link
  href={`/banki/${account.id}/ny`}
  className="mt-6 inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
>
  + Ný bankafærsla
</Link>

<Link
  href={`/banki/${account.id}/afstemming`}
  className="ml-3 mt-6 inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-600"
>
  ⚖️ Afstemming
</Link>

<Link
  href={`/banki/${account.id}/innflutningur`}
  className="ml-3 mt-6 inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-600"
>
  📥 Flytja inn bankayfirlit
</Link>

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
                  {transaction.amount.toString()} kr.
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}