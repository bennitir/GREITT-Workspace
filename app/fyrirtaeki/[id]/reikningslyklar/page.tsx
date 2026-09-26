import { approveDefaultAccountVatSuggestion, createCompanyAccount } from "@/app/actions/companyActions";
import { defaultAccounts } from "@/app/data/accounts";
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

      <div className="mb-6 rounded-lg border bg-white p-4 shadow-sm">
        <h2 className="text-lg font-semibold">Nýr reikningslykill</h2>
        <p className="mt-1 text-sm text-slate-600">
          Stofnar einn lykil hjá fyrirtækinu án þess að breyta öðrum lyklum.
        </p>

        <form
          action={async (formData) => {
            "use server";

            await createCompanyAccount(company.id, {
              number: String(formData.get("accountNumber") ?? ""),
              name: String(formData.get("accountName") ?? ""),
              category: String(formData.get("accountCategory") ?? "") as
                | "REVENUE"
                | "ASSET"
                | "EXPENSE"
                | "LIABILITY",
            });
          }}
          className="mt-4 grid gap-3 md:grid-cols-[160px_1fr_220px_auto] md:items-end"
        >
          <div>
            <label className="block text-sm font-semibold">Númer</label>
            <input
              name="accountNumber"
              required
              inputMode="numeric"
              placeholder="t.d. 2230"
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold">Heiti</label>
            <input
              name="accountName"
              required
              placeholder="Heiti reikningslykils"
              className="mt-1 w-full rounded border px-3 py-2"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold">Tegund</label>
            <select
              name="accountCategory"
              required
              defaultValue=""
              className="mt-1 w-full rounded border bg-white px-3 py-2"
            >
              <option value="" disabled>Veldu tegund…</option>
              <option value="REVENUE">Tekjur</option>
              <option value="ASSET">Eign / krafa</option>
              <option value="EXPENSE">Kostnaður</option>
              <option value="LIABILITY">Skuld</option>
            </select>
          </div>

          <button
            type="submit"
            className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            + Stofna lykil
          </button>
        </form>
      </div>

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

                  const matchingDefaultAccount =
  defaultAccounts.find(
    (item) =>
      item.number === account.number &&
      item.name.trim().toLowerCase() ===
        account.name.trim().toLowerCase()
  );

const hasGloggtSuggestion =
  matchingDefaultAccount?.vatTreatment != null;

  const canQuickApproveSuggestion =
  matchingDefaultAccount != null &&
  matchingDefaultAccount.vatRequiresConfirmation !== true &&
  (
    matchingDefaultAccount.vatTreatment === "INPUT" ||
    matchingDefaultAccount.vatTreatment === "OUTPUT" ||
    matchingDefaultAccount.vatTreatment === "NONE"
  );

                  const attentionReason =
  !account.vatTreatment &&
  vatMayApply &&
  canQuickApproveSuggestion
    ? "Má samþykkja tillögu beint"
    : !account.vatTreatment &&
        vatMayApply &&
        hasGloggtSuggestion
      ? "GLÖGGT tillaga tilbúin"
      : !account.vatTreatment && vatMayApply
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
  <div className="flex flex-wrap gap-2">
    {canQuickApproveSuggestion &&
      !account.vatTreatment && (
        <form
          action={async () => {
            "use server";

            await approveDefaultAccountVatSuggestion(
              company.id,
              account.id
            );
          }}
        >
          <button
            type="submit"
            className="rounded border border-green-300 bg-green-50 px-3 py-1.5 text-sm font-medium text-green-800 hover:bg-green-100"
          >
            Samþykkja tillögu
          </button>
        </form>
      )}

    <Link
      href={`/fyrirtaeki/${company.id}/reikningslyklar/${account.id}`}
      className="inline-block rounded border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50"
    >
      Breyta
    </Link>
  </div>
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