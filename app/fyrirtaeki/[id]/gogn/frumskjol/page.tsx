import { formatDate } from "@/lib/locale";
import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";

export default async function CompanyOriginalDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const companyId = Number(id);

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  if (activeUser.role !== "ADMIN") {
    const access = await prisma.userCompany.findUnique({
      where: {
        userId_companyId: {
          userId: activeUser.id,
          companyId,
        },
      },
    });

    if (!access || !access.isActive) {
      redirect("/fyrirtaeki");
    }
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      id: true,
      name: true,
      kennitala: true,
      isActive: true,
    },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const receipts = await prisma.receipt.findMany({
    where: {
      companyId,
      OR: [
        {
          filePath: {
            not: null,
          },
        },
        {
          storagePath: {
            not: null,
          },
        },
      ],
    },
    select: {
      id: true,
      date: true,
      aiDate: true,
      description: true,
      fileName: true,
      filePath: true,
      storagePath: true,
      voucherNumber: true,
      aiDetectedDocuments: {
        select: {
          id: true,
          voucherNumber: true,
          merchantName: true,
          date: true,
        },
      },
    },
    orderBy: {
      id: "desc",
    },
  });

  return (
    <main className="p-8">
      <Link
        href={`/fyrirtaeki/${company.id}/gogn`}
        className="text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        ← Til baka í gögn fyrirtækis
      </Link>

      <div className="mt-4">
        <h1 className="text-3xl font-bold">
          Frumskjöl
        </h1>

        <p className="mt-1 text-slate-600">
          {company.name} · {company.kennitala}
        </p>
      </div>

      {!company.isActive && (
        <div className="mt-5 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            LESHAMUR
          </p>

          <p className="mt-1 text-sm text-amber-800">
            Frumskjölin eru aðeins til skoðunar og niðurhals.
          </p>
        </div>
      )}

      <div className="mt-6 overflow-x-auto rounded-lg border bg-white">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-100">
            <tr>
              <th className="border-b p-3">
                Dagsetning
              </th>

              <th className="border-b p-3">
                Fylgiskjal
              </th>

              <th className="border-b p-3">
                Seljandi / lýsing
              </th>

              <th className="border-b p-3">
                Skrá
              </th>

              <th className="border-b p-3">
                Aðgerð
              </th>
            </tr>
          </thead>

          <tbody>
            {receipts.length === 0 ? (
              <tr>
                <td
                  colSpan={5}
                  className="p-6 text-center text-slate-500"
                >
                  Engin varðveitt frumskjöl fundust.
                </td>
              </tr>
            ) : (
              receipts.map((receipt) => {
                const firstDocument =
                  receipt.aiDetectedDocuments[0] ?? null;

                const voucherNumber =
                  firstDocument?.voucherNumber ??
                  receipt.voucherNumber;

                const documentDate =
                  firstDocument?.date ??
                  receipt.aiDate ??
                  receipt.date;

                const displayName =
                  firstDocument?.merchantName ??
                  receipt.description;

                const sourcePath =
                  receipt.storagePath ??
                  receipt.filePath;

                return (
                  <tr key={receipt.id}>
                    <td className="border-b p-3">
                      {documentDate
                        ? formatDate(documentDate)
                        : "—"}
                    </td>

                    <td className="border-b p-3 font-semibold">
                      {voucherNumber ?? "—"}
                    </td>

                    <td className="border-b p-3">
                      {displayName || "—"}
                    </td>

                    <td className="border-b p-3">
                      {receipt.fileName ?? "Frumskjal"}
                    </td>

                    <td className="border-b p-3">
                      {sourcePath ? (
                        <a
                          href={sourcePath}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-blue-700 hover:underline"
                        >
                          Opna frumskjal
                        </a>
                      ) : (
                        <span className="text-slate-400">
                          Skrá fannst ekki
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}