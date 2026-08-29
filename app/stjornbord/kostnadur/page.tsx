import { formatNumber } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

export default async function KostnadurPage({
  searchParams,
}: {
  searchParams: Promise<{ timabil?: string }>;
}) {

      const { timabil = "manudur" } = await searchParams;

  const now = new Date();

  let fromDate: Date | undefined;

  if (timabil === "dagur") {
    fromDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );
  } else if (timabil === "manudur") {
    fromDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );
  } else if (timabil === "sidasti-manudur") {
    fromDate = new Date(
      now.getFullYear(),
      now.getMonth() - 1,
      1
    );
  }
  const companies = await prisma.company.findMany({
    orderBy: {
      name: "asc",
    },
    include: {
  aiUsage: {
    where:
      timabil === "allt"
        ? undefined
        : timabil === "sidasti-manudur"
        ? {
            createdAt: {
              gte: fromDate,
              lt: new Date(now.getFullYear(), now.getMonth(), 1),
            },
          }
        : {
            createdAt: {
              gte: fromDate,
            },
          },
  },
},
  });

    const totalActions = companies.reduce(
    (sum, company) => sum + company.aiUsage.length,
    0
  );

  const totalAiCost = companies.reduce(
    (sum, company) =>
      sum +
      company.aiUsage.reduce(
        (companySum, item) => companySum + item.costIsk,
        0
      ),
    0
  );

  const overallAverageCost =
    totalActions > 0 ? totalAiCost / totalActions : 0;

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">Kostnaður</h1>

      <p className="mt-2 text-slate-600">
        Rekstrarkostnaður GLÖGGT eftir fyrirtækjum.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
  <a
    href="?timabil=dagur"
    className={`rounded border px-3 py-2 ${
      timabil === "dagur"
        ? "bg-slate-900 text-white"
        : "bg-white hover:bg-slate-50"
    }`}
  >
    Í dag
  </a>

  <a
    href="?timabil=manudur"
    className={`rounded border px-3 py-2 ${
      timabil === "manudur"
        ? "bg-slate-900 text-white"
        : "bg-white hover:bg-slate-50"
    }`}
  >
    Þessi mánuður
  </a>

  <a
    href="?timabil=sidasti-manudur"
    className={`rounded border px-3 py-2 ${
      timabil === "sidasti-manudur"
        ? "bg-slate-900 text-white"
        : "bg-white hover:bg-slate-50"
    }`}
  >
    Síðasti mánuður
  </a>

  <a
    href="?timabil=allt"
    className={`rounded border px-3 py-2 ${
      timabil === "allt"
        ? "bg-slate-900 text-white"
        : "bg-white hover:bg-slate-50"
    }`}
  >
    Allt tímabilið
  </a>
</div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <div className="rounded border bg-white p-4">
          <div className="text-sm text-slate-600">
            AI-aðgerðir
          </div>
          <div className="mt-1 text-2xl font-bold">
            {totalActions}
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-sm text-slate-600">
            AI-kostnaður samtals
          </div>
          <div className="mt-1 text-2xl font-bold">
            {formatNumber(totalAiCost, {
  maximumFractionDigits: 2,
})}
            kr.
          </div>
        </div>

        <div className="rounded border bg-white p-4">
          <div className="text-sm text-slate-600">
            Meðalverð á aðgerð
          </div>
          <div className="mt-1 text-2xl font-bold">
            {formatNumber(overallAverageCost, {
  maximumFractionDigits: 2,
})}
            kr.
          </div>
        </div>
      </div>

      <div className="mt-6 overflow-x-auto rounded border bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b p-3">Fyrirtæki</th>
              <th className="border-b p-3">AI-aðgerðir</th>
              <th className="border-b p-3">AI-kostnaður</th>
              <th className="border-b p-3">Meðaltal á aðgerð</th>
            </tr>
          </thead>

          <tbody>
            {companies.map((company) => {
              const totalCost = company.aiUsage.reduce(
                (sum, item) => sum + item.costIsk,
                0
              );

              const averageCost =
                company.aiUsage.length > 0
                  ? totalCost / company.aiUsage.length
                  : 0;



              return (
                <tr key={company.id}>
                  <td className="border-b p-3 font-semibold">
                    {company.name}
                  </td>

                  <td className="border-b p-3">
                    {company.aiUsage.length}
                  </td>

                  <td className="border-b p-3">
                    {formatNumber(totalCost, {
  maximumFractionDigits: 2,
})}
                    kr.
                  </td>

                  <td className="border-b p-3">
                    {formatNumber(averageCost, {
  maximumFractionDigits: 2,
})}
                    kr.
                  </td>
                </tr>
              );
            })}
          </tbody>

          <tfoot className="bg-slate-100 font-bold">
            <tr>
              <td className="border-t p-3">
                SAMTALS
              </td>

              <td className="border-t p-3">
                {totalActions}
              </td>

              <td className="border-t p-3">
                {formatNumber(totalAiCost, {
  maximumFractionDigits: 2,
})}
                kr.
              </td>

              <td className="border-t p-3">
                {formatNumber(overallAverageCost, {
  maximumFractionDigits: 2,
})}
                kr.
              </td>
            </tr>
          </tfoot>

        </table>
      </div>
    </main>
  );
}