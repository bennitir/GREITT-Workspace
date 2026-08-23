import { GLOGGT_MODULE_LIST } from "@/lib/core/modules";
import {
  getCompanyModuleSettings,
  setCompanyModuleEnabled,
} from "@/lib/core/company-module-repository";
import { cookies } from "next/headers";
import {
  setUserActive,
  addUserCompany,
  removeUserCompany,
  setUserCompanyRole,
  setActiveUser,
  clearActiveUser,
    searchCompaniesForUser,
} from "@/app/actions/userActions";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export default async function StjornbordPage({
  searchParams,
}: {
  searchParams: Promise<{
  error?: string;
  companySearch?: string;
  companySearchUserId?: string;
}>;
}) {

  const params = await searchParams;
  const companySearch = params.companySearch?.trim() ?? "";
  const companySearchUserId = Number(params.companySearchUserId || 0);
  const companySearchResults =
  companySearch.length >= 2
    ? await searchCompaniesForUser(companySearchUserId, companySearch)
    : [];

  const users = await prisma.user.findMany({
        orderBy: {
      name: "asc",
    },
    include: {
      companies: {
        include: {
          company: true,
        },
      },
    },
  });
  const cookieStore = await cookies();
const activeUserId = cookieStore.get("activeUserId")?.value;

  const companies = await prisma.company.findMany({
  where: {
    isActive: true,
  },
  orderBy: {
    name: "asc",
  },
});

const companyModuleSettings = await Promise.all(
  companies.map(async (company) => ({
    companyId: company.id,
    settings: await getCompanyModuleSettings(company.id),
  })),
);

const activeUser = activeUserId
  ? await prisma.user.findUnique({
      where: {
        id: Number(activeUserId),
      },
      include: {
        companies: {
          where: {
  isActive: true,
},
          include: {
            company: {
              include: {
                _count: {
                  select: {
                    receipts: true,
                  },
                },
                receipts: {
  select: {
    id: true,
    status: true,
  },
},
              },
            },
          },
        },
      },
    })
  : null;

 const isClient = activeUser?.role === "CLIENT";

if (isClient) {
  return (
    <main className="p-8">
  <h1 className="text-3xl font-bold">Stjórnstöð</h1>

  <form action={clearActiveUser} className="mt-4">
  <button
    type="submit"
    className="rounded bg-slate-700 px-4 py-2 font-medium text-white hover:bg-slate-800"
  >
    Til baka í admin
  </button>
</form>

  <p className="mt-2 text-slate-600">
    Yfirlit yfir fyrirtækin þín og stöðu þeirra.
  </p>

  <div className="mt-6 rounded-lg border bg-white p-6">
    <h2 className="text-xl font-semibold">
      Velkomin/n, {activeUser?.name ?? ""}
    </h2>

    <div className="mt-4 space-y-3">
  {activeUser?.companies.length ? (
    activeUser.companies.map((access) => (
      <div
        key={access.id}
        className="rounded-lg border bg-slate-50 p-4"
      >
        <p className="font-semibold">
          {access.company.name}
        </p>
        <p className="mt-1 text-sm text-slate-600">
  Fylgiskjöl: {access.company._count.receipts}
</p>

<p className="mt-1 text-sm text-slate-600">
  Óyfirfarin:{" "}
  {
    access.company.receipts.filter(
      (receipt) => receipt.status === "NEW"
    ).length
  }
</p>

<p className="mt-1 text-sm text-slate-600">
  Yfirfarin:{" "}
  {
    access.company.receipts.filter(
      (receipt) => receipt.status === "REVIEWED"
    ).length
  }
</p>

<p className="mt-1 text-sm text-slate-600">
  Þarf skoðun:{" "}
  {
    access.company.receipts.filter(
      (receipt) => receipt.status === "NEEDS_ATTENTION"
    ).length
  }
</p>

      </div>
    ))
  ) : (
    <p className="text-slate-600">
      Engin fyrirtæki tengd þessum notanda.
    </p>
  )}
</div>
  </div>
</main>
);
}

return (

    <main className="p-8">
    {params.error === "inactive-user" && (
  <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
    <p className="font-bold">Aðgangi hafnað</p>
    <p>Þessi notandi er óvirkur og má ekki skrá sig inn.</p>
  </div>
)}
      <div className="mb-6 flex items-start justify-between gap-4">
  <div>
    <h1 className="text-3xl font-bold">Stjórnstöð</h1>
    <p className="mt-1 text-slate-600">
      Umsjón með notendum og aðgangi.
    </p>
    <p className="mt-2 text-sm font-semibold text-blue-700">
  Prófunarnotandi: {activeUser?.name ?? "Enginn"}
</p>
  </div>
<div className="flex gap-3">
  <Link
  href="/stjornbord/kostnadur"
  className="rounded bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
>
  Kostnaður
</Link>
  <Link
    href="/stjornbord/nyr"
    className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
  >
    + Nýr notandi
  </Link>
  </div>
</div>

<div className="mb-8 rounded-lg border bg-white p-6">
  <h2 className="text-xl font-semibold">Einingar fyrirtækja</h2>

  <p className="mt-1 text-sm text-slate-600">
    Kveiktu eða slökktu á GLÖGGT-einingum fyrir hvert fyrirtæki.
  </p>

  <div className="mt-5 space-y-4">
    {companies.map((company) => {
      const companySettings =
        companyModuleSettings.find(
          (item) => item.companyId === company.id
        )?.settings ?? {};

      return (
        <div
          key={company.id}
          className="rounded-lg border border-slate-200 p-4"
        >
          <h3 className="font-semibold">{company.name}</h3>

          <div className="mt-3 flex flex-wrap gap-2">
            {GLOGGT_MODULE_LIST.map((module) => {
              const enabled = companySettings[module.id] === true;

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
                    className={`rounded-lg border px-3 py-2 text-sm font-medium ${
                      enabled
                        ? "bg-green-100 text-green-800"
                        : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {enabled ? "✓ " : ""}
                    {module.name}
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      );
    })}
  </div>
</div>



      <div className="space-y-4">
        {users.length === 0 ? (
          <div className="rounded-lg border bg-white p-6">
            <p className="font-medium">Engir notendur skráðir enn.</p>
            <p className="mt-1 text-slate-600">
              Næsta skref verður að stofna fyrsta admin-notandann.
            </p>
          </div>
        ) : (
          users.map((user) => (
            <div
              key={user.id}
              className="rounded-lg border bg-white p-5"
            >
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    {user.name}
                  </h2>

                  <p className="text-slate-600">
                    {user.email}
                  </p>
                  <div className="mt-3">
  <p className="text-sm font-semibold text-slate-700">
    Fyrirtæki
  </p>

  {user.companies.length === 0 ? (
    <p className="text-sm text-slate-500">
      Ekkert fyrirtæki tengt.
    </p>
  ) : (
    <div className="mt-1 space-y-1">
      {user.companies
  .filter((access) => access.isActive)
  .map((access) => (
    <div
      key={access.id}
      className="flex items-center gap-2"
    >
      <span className="text-sm text-slate-600">
        {access.company.name}
      </span>

      <form
        action={async (formData: FormData) => {
          "use server";
          await setUserCompanyRole(
            user.id,
            access.companyId,
            String(formData.get("accessRole") || "VIEWER"),
          );
        }}
        className="flex items-center gap-2"
      >
        <select
        key={access.accessRole}
          name="accessRole"
          defaultValue={access.accessRole}
          className="rounded border px-2 py-1 text-sm"
        >
          <option value="OWNER">Eigandi</option>
          <option value="MANAGER">Stjórnandi</option>
          <option value="BOOKKEEPER">Bókari</option>
          <option value="VIEWER">Skoðunaraðgangur</option>
        </select>
        <button
          type="submit"
          className="text-sm font-medium text-blue-700 hover:text-blue-900"
        >
          Vista réttindi
        </button>
      </form>

      <form
        action={async () => {
          "use server";
          await removeUserCompany(user.id, access.companyId);
        }}
      >
        <button
          type="submit"
          className="text-sm font-medium text-red-600 hover:text-red-800"
        >
          Aftengja
        </button>
      </form>
    </div>
  ))}
    </div>
  )}
  
  
    <form method="GET" className="flex gap-2">
  <input
    type="hidden"
    name="companySearchUserId"
    value={user.id}
  />

  <input
    type="text"
    name="companySearch"
    defaultValue={
      companySearchUserId === user.id ? companySearch : ""
    }
    placeholder="Leita eftir nafni eða kennitölu"
    className="w-full rounded border px-3 py-2 text-sm"
  />

  <button
    type="submit"
    className="rounded bg-slate-700 px-3 py-2 text-sm font-medium text-white hover:bg-slate-800"
  >
    Leita
  </button>
</form>

{companySearchUserId === user.id &&
  companySearch.length >= 2 && (
    <div className="mt-2 space-y-2">
      {companySearchResults.length === 0 ? (
        <p className="text-sm text-slate-500">
          Engin ótengd fyrirtæki fundust.
        </p>
      ) : (
        companySearchResults.map((company) => (
          <form
            key={company.id}
            action={async () => {
              "use server";
              await addUserCompany(user.id, company.id);
            }}
            className="flex items-center justify-between gap-3 rounded border p-2"
          >
            <div>
              <p className="text-sm font-medium">
                {company.name}
              </p>
              <p className="text-xs text-slate-500">
                {company.kennitala}
              </p>
            </div>

            <button
              type="submit"
              className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Tengja
            </button>
          </form>
        ))
      )}
    </div>
  )}
    
 

</div>
                </div>

                <div className="text-right">
                  <p className="font-semibold">
                    {user.role}
                  </p>

                  <p
                    className={
                      user.isActive
                        ? "text-green-700"
                        : "text-red-700"
                    }
                  >
                    {user.isActive ? "Virkur" : "Óvirkur"}
                  </p>
                  <form
  action={async () => {
    "use server";
    await setUserActive(user.id, !user.isActive);
  }}
  className="mt-3"
>
  <button
    type="submit"
    className={`rounded px-3 py-2 text-sm font-medium text-white ${
      user.isActive
        ? "bg-red-600 hover:bg-red-700"
        : "bg-green-600 hover:bg-green-700"
    }`}
  >
    {user.isActive ? "Gera óvirkan" : "Virkja aftur"}
  </button>
</form>
<form
  action={async () => {
    "use server";
    await setActiveUser(user.id);
  }}
  className="mt-2"
>
  <button
  type="submit"
  disabled={!user.isActive}
  className={`rounded px-3 py-2 text-sm font-medium text-white ${
    user.isActive
      ? "bg-slate-700 hover:bg-slate-800"
      : "cursor-not-allowed bg-slate-300"
  }`}
>
  {user.isActive ? "Prófa sem þessi notandi" : "Notandi óvirkur"}
</button>
</form>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </main>
  );
}
