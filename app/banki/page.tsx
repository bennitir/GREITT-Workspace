import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

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

  const company = await prisma.company.findUnique({
    where: {
      id: Number(activeCompanyId),
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

        <div className="mt-6 rounded-lg border bg-gray-50 p-4">
          <p>Enginn bankareikningur hefur verið tengdur enn.</p>

          <button
            type="button"
            className="mt-4 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            + Tengja bankareikning
          </button>
        </div>
      </div>
    </main>
  );
}