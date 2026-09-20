import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { adminRoleLabel, adminText } from "@/lib/i18n/admin";
import {
  clearActiveUser,
  setActiveUser,
  setUserActive,
} from "@/app/actions/userActions";

export default async function StjornbordPage({
  searchParams,
}: {
  searchParams: Promise<{
    companySearch?: string;
    error?: string;
  }>;
}) {
  const params = await searchParams;
  const companySearch = params.companySearch?.trim() ?? "";

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;
  const activeUserId = cookieStore.get("activeUserId")?.value;

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

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });
  const language = userSettings?.interfaceLanguage ?? "is";
  const t = adminText(language);

  if (isClient) {
    return (
      <main className="p-8">
        <h1 className="text-3xl font-bold">{t.dashboard.title}</h1>

        <form action={clearActiveUser} className="mt-4">
          <button
            type="submit"
            className="rounded bg-slate-700 px-4 py-2 font-medium text-white hover:bg-slate-800"
          >
            {t.dashboard.backToAdmin}
          </button>
        </form>

        <p className="mt-2 text-slate-600">
          {t.dashboard.clientSubtitle}
        </p>

        <div className="mt-6 rounded-lg border bg-white p-6">
          <h2 className="text-xl font-semibold">
            {t.dashboard.welcome}, {activeUser?.name ?? ""}
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
                    {t.common.receipts}: {access.company._count.receipts}
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {t.dashboard.unreviewed}:{" "}
                    {
                      access.company.receipts.filter(
                        (receipt) => receipt.status === "NEW"
                      ).length
                    }
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {t.dashboard.reviewed}:{" "}
                    {
                      access.company.receipts.filter(
                        (receipt) => receipt.status === "REVIEWED"
                      ).length
                    }
                  </p>

                  <p className="mt-1 text-sm text-slate-600">
                    {t.dashboard.needsAttention}:{" "}
                    {
                      access.company.receipts.filter(
                        (receipt) =>
                          receipt.status === "NEEDS_ATTENTION"
                      ).length
                    }
                  </p>
                </div>
              ))
            ) : (
              <p className="text-slate-600">
                {t.dashboard.noLinkedCompanies}
              </p>
            )}
          </div>
        </div>
      </main>
    );
  }

  if (session.user.role !== "ADMIN") {
    redirect("/");
  }

  const companies = await prisma.company.findMany({
    where: {
      isActive: true,
      ...(companySearch.length >= 2
        ? {
            OR: [
              {
                name: {
                  contains: companySearch,
                  mode: "insensitive" as const,
                },
              },
              {
                kennitala: {
                  contains: companySearch,
                },
              },
            ],
          }
        : {}),
    },
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      kennitala: true,
      vatNumber: true,
      _count: {
        select: {
          receipts: true,
          users: true,
        },
      },
    },
  });

  const closedCount = await prisma.company.count({
    where: {
      isActive: false,
    },
  });

  const users = await prisma.user.findMany({
    orderBy: {
      name: "asc",
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
    },
  });

  return (
    <main className="p-8">
      {params.error === "inactive-user" && (
        <div className="mb-6 rounded-lg border border-red-300 bg-red-50 p-4 text-red-800">
          <p className="font-bold">{t.dashboard.accessDenied}</p>
          <p>{t.dashboard.inactiveUserMessage}</p>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">{t.dashboard.title}</h1>

          <p className="mt-1 text-slate-600">
            {t.dashboard.subtitle}
          </p>

          <p className="mt-2 text-sm font-semibold text-blue-700">
            {t.dashboard.testUser}: {activeUser?.name ?? t.common.none}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/stjornbord/abendingar"
            className="rounded-lg bg-violet-600 px-4 py-2 font-medium text-white hover:bg-violet-700"
          >
            {t.dashboard.suggestions}
          </Link>

          <Link
            href="/stjornbord/kostnadur"
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
          >
            {t.dashboard.cost}
          </Link>

          <Link
            href="/fyrirtaeki/lokud"
            className="rounded-lg border bg-white px-4 py-2 font-medium hover:bg-slate-50"
          >
            {t.dashboard.closedCompanies} ({closedCount})
          </Link>

          <Link
            href="/stjornbord/nyr"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            {t.dashboard.newUser}
          </Link>
        </div>
      </div>

      <section className="mb-8 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{t.dashboard.companiesTitle}</h2>

            <p className="mt-1 text-sm text-slate-600">
              {t.dashboard.companiesHelp}
            </p>
          </div>

          <form method="GET" className="flex w-full max-w-xl gap-2">
            <input
              type="text"
              name="companySearch"
              defaultValue={companySearch}
              placeholder={t.dashboard.companySearchPlaceholder}
              className="w-full rounded-lg border px-3 py-2"
            />

            <button
              type="submit"
              className="rounded-lg bg-slate-700 px-4 py-2 font-medium text-white"
            >
              {t.common.search}
            </button>

            {companySearch && (
              <Link
                href="/stjornbord"
                className="rounded-lg border bg-white px-4 py-2 font-medium"
              >
                {t.common.clear}
              </Link>
            )}
          </form>
        </div>

        <div className="mt-5 divide-y rounded-lg border">
          {companies.length === 0 ? (
            <p className="p-5 text-slate-500">
              {t.dashboard.noCompanies}
            </p>
          ) : (
            companies.map((company) => (
              <Link
                key={company.id}
                href={`/stjornbord/fyrirtaeki/${company.id}`}
                className="flex flex-wrap items-center justify-between gap-4 p-4 hover:bg-slate-50"
              >
                <div>
                  <p className="font-semibold">{company.name}</p>

                  <p className="mt-1 text-sm text-slate-500">
                    {t.dashboard.idNumberShort} {company.kennitala}
                    {company.vatNumber
                      ? ` · ${t.dashboard.vatNumberShort} ${company.vatNumber}`
                      : ""}
                  </p>
                </div>

                <div className="flex gap-6 text-sm text-slate-600">
                  <span>
                    {t.common.receipts}:{" "}
                    <strong>{company._count.receipts}</strong>
                  </span>

                  <span>
                    {t.common.users}:{" "}
                    <strong>{company._count.users}</strong>
                  </span>

                  <span className="font-medium text-blue-700">
                    {t.common.open} →
                  </span>
                </div>
              </Link>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">{t.dashboard.usersTitle}</h2>

            <p className="mt-1 text-sm text-slate-600">
              {t.dashboard.usersHelp}
            </p>
          </div>

          <Link
            href="/stjornbord/nyr"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            {t.dashboard.newUser}
          </Link>
        </div>

        <div className="divide-y rounded-lg border">
          {users.length === 0 ? (
            <p className="p-5 text-slate-500">
              {t.dashboard.noUsers}
            </p>
          ) : (
            users.map((user) => (
              <div
                key={user.id}
                className="flex flex-wrap items-center justify-between gap-4 p-4"
              >
                <div>
                  <p className="font-semibold">{user.name}</p>

                  <p className="text-sm text-slate-500">
                    {user.email}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {adminRoleLabel(user.role, language)}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`text-sm font-semibold ${
                      user.isActive
                        ? "text-green-700"
                        : "text-red-700"
                    }`}
                  >
                    {user.isActive ? t.common.active : t.common.inactive}
                  </span>

                  <form
                    action={async () => {
                      "use server";

                      await setUserActive(
                        user.id,
                        !user.isActive
                      );
                    }}
                  >
                    <button
                      type="submit"
                      className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${
                        user.isActive
                          ? "bg-red-600 hover:bg-red-700"
                          : "bg-green-600 hover:bg-green-700"
                      }`}
                    >
                      {user.isActive
                        ? t.dashboard.deactivate
                        : t.dashboard.reactivate}
                    </button>
                  </form>

                  <form
                    action={async () => {
                      "use server";

                      await setActiveUser(user.id);
                    }}
                  >
                    <button
                      type="submit"
                      disabled={!user.isActive}
                      className={`rounded-lg px-3 py-2 text-sm font-medium text-white ${
                        user.isActive
                          ? "bg-slate-700 hover:bg-slate-800"
                          : "cursor-not-allowed bg-slate-300"
                      }`}
                    >
                      {user.isActive
                        ? t.dashboard.testAsUser
                        : t.dashboard.userInactive}
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
      </section>
    </main>
  );
}