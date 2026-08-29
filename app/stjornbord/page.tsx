import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
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
                        (receipt) =>
                          receipt.status === "NEEDS_ATTENTION"
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
          <p className="font-bold">Aðgangi hafnað</p>
          <p>Þessi notandi er óvirkur og má ekki skrá sig inn.</p>
        </div>
      )}

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Stjórnstöð</h1>

          <p className="mt-1 text-slate-600">
            Yfirlit yfir fyrirtæki, notendur og aðgang.
          </p>

          <p className="mt-2 text-sm font-semibold text-blue-700">
            Prófunarnotandi: {activeUser?.name ?? "Enginn"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href="/stjornbord/kostnadur"
            className="rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white hover:bg-emerald-700"
          >
            Kostnaður
          </Link>

          <Link
            href="/fyrirtaeki/lokud"
            className="rounded-lg border bg-white px-4 py-2 font-medium hover:bg-slate-50"
          >
            Lokuð fyrirtæki ({closedCount})
          </Link>

          <Link
            href="/stjornbord/nyr"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            + Nýr notandi
          </Link>
        </div>
      </div>

      <section className="mb-8 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Fyrirtæki</h2>

            <p className="mt-1 text-sm text-slate-600">
              Leitaðu og opnaðu fyrirtæki til að stjórna einingum,
              notendum og heimildum.
            </p>
          </div>

          <form method="GET" className="flex w-full max-w-xl gap-2">
            <input
              type="text"
              name="companySearch"
              defaultValue={companySearch}
              placeholder="Leita eftir nafni eða kennitölu"
              className="w-full rounded-lg border px-3 py-2"
            />

            <button
              type="submit"
              className="rounded-lg bg-slate-700 px-4 py-2 font-medium text-white"
            >
              Leita
            </button>

            {companySearch && (
              <Link
                href="/stjornbord"
                className="rounded-lg border bg-white px-4 py-2 font-medium"
              >
                Hreinsa
              </Link>
            )}
          </form>
        </div>

        <div className="mt-5 divide-y rounded-lg border">
          {companies.length === 0 ? (
            <p className="p-5 text-slate-500">
              Engin fyrirtæki fundust.
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
                    Kt. {company.kennitala}
                    {company.vatNumber
                      ? ` · VSK-nr. ${company.vatNumber}`
                      : ""}
                  </p>
                </div>

                <div className="flex gap-6 text-sm text-slate-600">
                  <span>
                    Fylgiskjöl:{" "}
                    <strong>{company._count.receipts}</strong>
                  </span>

                  <span>
                    Notendur:{" "}
                    <strong>{company._count.users}</strong>
                  </span>

                  <span className="font-medium text-blue-700">
                    Opna →
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
            <h2 className="text-xl font-bold">Notendur</h2>

            <p className="mt-1 text-sm text-slate-600">
              Virkja, gera óvirka eða prófa aðgang notanda.
            </p>
          </div>

          <Link
            href="/stjornbord/nyr"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            + Nýr notandi
          </Link>
        </div>

        <div className="divide-y rounded-lg border">
          {users.length === 0 ? (
            <p className="p-5 text-slate-500">
              Engir notendur skráðir.
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
                    {user.role}
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
                    {user.isActive ? "Virkur" : "Óvirkur"}
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
                        ? "Gera óvirkan"
                        : "Virkja aftur"}
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
                        ? "Prófa sem þessi notandi"
                        : "Notandi óvirkur"}
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