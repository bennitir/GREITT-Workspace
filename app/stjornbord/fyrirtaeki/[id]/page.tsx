import { formatDate } from "@/lib/locale";
import AdminOpenCompanyButton from "@/components/AdminOpenCompanyButton";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { GLOGGT_MODULE_LIST } from "@/lib/core/modules";
import {
  getCompanyModuleSettings,
  setCompanyModuleEnabled,
} from "@/lib/core/company-module-repository";

import {
  addUserCompany,
  removeUserCompany,
  setUserCompanyRole,
  updateUserEmailAndResendAccess,
} from "@/app/actions/userActions";
import { setActiveCompanyFromAdmin } from "@/app/actions/companyActions";
import DeleteCompanyButton from "@/components/DeleteCompanyButton";
import ReactivateCompanyButton from "@/components/ReactivateCompanyButton";

export default async function CompanyAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userSearch?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;

  const companyId = Number(id);

  if (!Number.isInteger(companyId)) {
    redirect("/stjornbord");
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

  const session = sessionToken
    ? await prisma.session.findUnique({
        where: {
          token: sessionToken,
        },
        include: {
          user: true,
        },
      })
    : null;

  if (
    !session ||
    session.expiresAt < new Date() ||
    !session.user.isActive
  ) {
    redirect("/innskraning");
  }

  if (session.user.role !== "ADMIN") {
    redirect("/stjornbord");
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    include: {
      users: {
        include: {
          user: true,
        },
        orderBy: {
          user: {
            name: "asc",
          },
        },
      },
      _count: {
        select: {
          receipts: true,
          workOrders: true,
          workLogs: true,
        },
      },
    },
  });

  if (!company) {
    redirect("/stjornbord");
  }

  const moduleSettings =
    await getCompanyModuleSettings(company.id);

  const userSearch =
    search.userSearch?.trim() ?? "";

  const alreadyConnectedUserIds = new Set(
    company.users.map((access) => access.userId)
  );

  const userSearchResults =
    userSearch.length >= 2
      ? await prisma.user.findMany({
          where: {
            isActive: true,
            id: {
              notIn: Array.from(alreadyConnectedUserIds),
            },
            OR: [
              {
                name: {
                  contains: userSearch,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: userSearch,
                  mode: "insensitive",
                },
              },
            ],
          },
          orderBy: {
            name: "asc",
          },
          take: 20,
        })
      : [];

  return (
    <main className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/stjornbord"
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            ← Til baka í Stjórnstöð
          </Link>

          <h1 className="mt-3 text-3xl font-bold">
            {company.name}
          </h1>

          <p className="mt-1 text-slate-600">
            Kennitala: {company.kennitala}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            Fyrirtæki #{company.id}
          </p>
        </div>
                <div className="flex flex-wrap gap-2">

        <AdminOpenCompanyButton companyId={company.id} />

          {company.isActive ? (
            <DeleteCompanyButton
  id={company.id}
  hasBookkeepingData={
    company._count.receipts > 0 ||
    company.nextVoucherNumber > 1
  }
/>
          ) : (
            <ReactivateCompanyButton id={company.id} />
          )}
        </div>
      </div>

      {!company.isActive && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            Fyrirtækið er lokað
          </p>

          <p className="mt-1 text-sm text-amber-800">
            Gögn eru varðveitt en fyrirtækið er ekki í
            venjulegri virkri notkun.
          </p>

          {company.closedAt && (
            <p className="mt-1 text-sm text-amber-800">
              Lokað:{" "}
              {formatDate(company.closedAt)}
            </p>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-500">
            Fylgiskjöl
          </p>

          <p className="mt-1 text-2xl font-bold">
            {company._count.receipts}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-500">
            Verk
          </p>

          <p className="mt-1 text-2xl font-bold">
            {company._count.workOrders}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-500">
            Vinnufærslur
          </p>

          <p className="mt-1 text-2xl font-bold">
            {company._count.workLogs}
          </p>
        </div>
      </div>

      <section className="mb-6 rounded-xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          GLÖGGT-einingar
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          Kveiktu eða slökktu á þeim einingum sem þetta
          fyrirtæki hefur aðgang að.
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          {GLOGGT_MODULE_LIST.map((module) => {
            const enabled =
              moduleSettings[module.id] === true;

            return (
              <form
                key={module.id}
                action={async () => {
                  "use server";

                  await setCompanyModuleEnabled(
                    company.id,
                    module.id,
                    !enabled
                  );
                }}
              >
                <button
                  type="submit"
                  className={`rounded-lg border px-4 py-2 font-medium ${
                    enabled
                      ? "border-green-300 bg-green-100 text-green-800"
                      : "border-slate-300 bg-slate-100 text-slate-600"
                  }`}
                >
                  {enabled ? "✓ " : ""}
                  {module.name}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="mb-6 rounded-xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          Notendur og heimildir
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          Notendur sem hafa aðgang að þessu fyrirtæki.
        </p>

        <div className="mt-5 space-y-3">
          {company.users.length === 0 ? (
            <p className="text-slate-500">
              Enginn notandi er tengdur fyrirtækinu.
            </p>
          ) : (
            company.users.map((access) => (
              <div
                key={access.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div>
                  <p className="font-semibold">
                    {access.user.name}
                  </p>

                  <p className="text-sm text-slate-500">
                    {access.user.email}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Kerfishlutverk: {access.user.role}
                  </p>
                </div>

<form
  action={updateUserEmailAndResendAccess}
  className="mt-3 flex flex-wrap items-end gap-2"
>
  <input
    type="hidden"
    name="userId"
    value={access.userId}
  />

  <label className="block">
    <span className="mb-1 block text-xs font-medium text-slate-600">
      Netfang
    </span>

    <input
      type="email"
      name="email"
      defaultValue={access.user.email}
      required
      className="min-w-[280px] rounded-lg border px-3 py-2 text-sm"
    />
  </label>

  <button
    type="submit"
    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
  >
    Leiðrétta netfang og senda aðgang aftur
  </button>
</form>
                <div className="flex flex-wrap items-center gap-3">
                  <form
                    action={async (formData: FormData) => {
                      "use server";

                      await setUserCompanyRole(
                        access.userId,
                        company.id,
                        String(
                          formData.get("accessRole") ||
                            "VIEWER"
                        )
                      );
                    }}
                    className="flex items-center gap-2"
                  >
                    <select
                      name="accessRole"
                      defaultValue={access.accessRole}
                      className="rounded-lg border px-3 py-2"
                    >
                      <option value="OWNER">
                        Eigandi
                      </option>

                      <option value="MANAGER">
                        Stjórnandi
                      </option>

                      <option value="BOOKKEEPER">
                        Bókari
                      </option>

                      <option value="VIEWER">
                        Skoðunaraðgangur
                      </option>
                    </select>

                    <button
                      type="submit"
                      className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white"
                    >
                      Vista réttindi
                    </button>
                  </form>

                  <form
                    action={async () => {
                      "use server";

                      await removeUserCompany(
                        access.userId,
                        company.id
                      );
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      Aftengja
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          Tengja notanda
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          Leitaðu eftir nafni eða netfangi.
        </p>

        <form
          method="GET"
          className="mt-4 flex max-w-xl gap-2"
        >
          <input
            type="text"
            name="userSearch"
            defaultValue={userSearch}
            placeholder="Leita að notanda"
            className="w-full rounded-lg border px-3 py-2"
          />

          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-4 py-2 font-medium text-white"
          >
            Leita
          </button>
        </form>

        {userSearch.length >= 2 && (
          <div className="mt-4 max-w-xl space-y-2">
            {userSearchResults.length === 0 ? (
              <p className="text-sm text-slate-500">
                Engir ótengdir notendur fundust.
              </p>
            ) : (
              userSearchResults.map((user) => (
                <form
                  key={user.id}
                  action={async () => {
                    "use server";

                    await addUserCompany(
                      user.id,
                      company.id
                    );
                  }}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {user.name}
                    </p>

                    <p className="text-sm text-slate-500">
                      {user.email}
                    </p>
                  </div>

                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                  >
                    Tengja
                  </button>
                </form>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}