import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

function getVatTreatmentLabel(value: string | null) {
  switch (value) {
    case "OUTPUT":
      return "Útskattur";
    case "INPUT":
      return "Innskattur";
    case "EXEMPT":
      return "Undanþegið";
    case "NONE":
      return "Engin VSK-meðferð";
    case "REVIEW":
      return "Þarf yfirferð";
    case "SYSTEM":
      return "VSK kerfisreikningur";
    default:
      return "Ekki skilgreint";
  }
}

export default async function ReikningslyklarPage({
  params,
}: Props) {
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
    include: {
      accounts: {
        orderBy: {
          number: "asc",
        },
      },
    },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const undefinedVatCount = company.accounts.filter(
    (account) => !account.vatTreatment
  ).length;

  const reviewCount = company.accounts.filter(
    (account) =>
      account.vatTreatment === "REVIEW" ||
      account.vatRequiresConfirmation
  ).length;

  return (
    <main className="p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold">
            Reikningslyklar
          </h1>

          <p className="mt-1 text-slate-600">
            {company.name}
          </p>
        </div>

        <Link
          href={`/fyrirtaeki/${company.id}`}
          className="rounded border border-slate-300 bg-white px-4 py-2 font-medium text-slate-800 hover:bg-slate-50"
        >
          Til baka í fyrirtæki
        </Link>
      </div>

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">
            Reikningar
          </p>

          <p className="mt-1 text-2xl font-semibold">
            {company.accounts.length}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">
            VSK ekki skilgreint
          </p>

          <p className="mt-1 text-2xl font-semibold">
            {undefinedVatCount}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-500">
            Þarf yfirferð
          </p>

          <p className="mt-1 text-2xl font-semibold">
            {reviewCount}
          </p>
        </div>
      </div>

      {undefinedVatCount > 0 && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4 text-amber-900">
          Sumir reikningslyklar hafa ekki VSK-meðferð
          skilgreinda. GLÖGGT á ekki að giska á þá
          sjálfkrafa.
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border bg-white shadow-sm">
        <table className="w-full border-collapse text-left">
          <thead className="bg-slate-50">
            <tr>
              <th className="border-b px-4 py-3">
                Nr.
              </th>

              <th className="border-b px-4 py-3">
                Heiti
              </th>

              <th className="border-b px-4 py-3">
                VSK %
              </th>

              <th className="border-b px-4 py-3">
                VSK-meðferð
              </th>

              <th className="border-b px-4 py-3">
                VSK-lykill
              </th>

              <th className="border-b px-4 py-3">
                Frádráttur
              </th>

              <th className="border-b px-4 py-3">
                Staða
              </th>

              <th className="border-b px-4 py-3">
                Aðgerðir
              </th>
            </tr>
          </thead>

          <tbody>
            {company.accounts.map((account) => {
              const vatMayApply =
                account.vatRate != null ||
                account.vatAccount != null ||
                account.vatTreatment != null ||
                account.vatRequiresConfirmation;

              const needsAttention =
                vatMayApply &&
                (!account.vatTreatment ||
                  account.vatTreatment === "REVIEW" ||
                  account.vatRequiresConfirmation);

                  const attentionReason =
  !account.vatTreatment && vatMayApply
    ? "VSK-meðferð vantar"
    : account.vatTreatment === "REVIEW"
      ? "Ákvörðun bókara"
      : account.vatRequiresConfirmation
        ? "Staðfesting bókara"
        : null;

              return (
                <tr
                  key={account.id}
                  className="border-b last:border-b-0"
                >
                  <td className="px-4 py-3 font-medium">
                    {account.number}
                  </td>

                  <td className="px-4 py-3">
                    {account.name}
                  </td>

                  <td className="px-4 py-3">
                    {account.vatRate ?? "—"}
                  </td>

                  <td className="px-4 py-3">
                    {getVatTreatmentLabel(
                      account.vatTreatment
                    )}
                  </td>

                  <td className="px-4 py-3">
                    {account.vatCode ?? "—"}
                  </td>

                  <td className="px-4 py-3">
                    {account.vatDeductiblePercent != null
                      ? `${account.vatDeductiblePercent}%`
                      : "—"}
                  </td>

                  <td className="px-4 py-3">
                    {needsAttention ? (
  <div>
    <span className="font-medium text-amber-700">
      Yfirfara
    </span>

    {attentionReason && (
      <div className="mt-1 text-xs text-slate-500">
        {attentionReason}
      </div>
    )}
  </div>
                    ) : vatMayApply ? (
                      <span className="text-green-700">
                        Skilgreint
                      </span>
                    ) : (
                      <span className="text-slate-500">
                        Á ekki við
                      </span>
                    )}
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/fyrirtaeki/${company.id}/reikningslyklar/${account.id}`}
                      className="inline-block rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
                    >
                      Breyta
                    </Link>
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