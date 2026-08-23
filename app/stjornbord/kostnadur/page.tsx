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
                    {totalCost.toLocaleString("is-IS", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    kr.
                  </td>

                  <td className="border-b p-3">
                    {averageCost.toLocaleString("is-IS", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    kr.
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </main>
  );
}