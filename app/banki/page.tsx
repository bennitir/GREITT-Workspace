import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import Link from "next/link";

export default async function BankiPage() {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">🏦 Banki</h1>
        <p className="mt-4 text-red-600">
          Ekkert virkt fyrirtæki er valið.
        </p>
      </main>
    );
  }

  const companyId = Number(activeCompanyId);

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
  });

  if (!company) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">🏦 Banki</h1>
        <p className="mt-4 text-red-600">
          Virkt fyrirtæki fannst ekki.
        </p>
      </main>
    );
  }

  const bankAccounts = await prisma.bankAccount.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">🏦 Banki</h1>

      <div className="mt-6 rounded-lg border p-6">
        <p className="text-sm text-gray-500">
          VIRKT FYRIRTÆKI
        </p>

        <h2 className="mt-1 text-xl font-semibold">
          {company.name}
        </h2>

        <p className="mt-2 text-gray-600">
          Bankareikningar þessa fyrirtækis
        </p>

        <div className="mt-6 space-y-4">
          {bankAccounts.length === 0 ? (
            <div className="rounded-lg border bg-gray-50 p-4">
              <p>Enginn bankareikningur hefur verið tengdur enn.</p>
            </div>
          ) : (
            bankAccounts.map((account) => (
              <Link
  key={account.id}
  href={`/banki/${account.id}`}
  className="block rounded-lg border bg-gray-50 p-4 hover:bg-gray-100"
>
  <p className="text-lg font-semibold">
    {account.bankName}
  </p>

  <p className="mt-2">
    <strong>Reikningsnúmer:</strong>{" "}
    {account.accountNumber ?? "Ekki skráð"}
  </p>

  <p className="mt-1">
    <strong>IBAN:</strong>{" "}
    {account.iban ?? "Ekki skráð"}
  </p>
</Link>
            ))
          )}

          <Link
            href="/banki/tengja"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            + Tengja bankareikning
          </Link>
        </div>
      </div>
    </main>
  );
}