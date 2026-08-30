import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import {
  getCompanyAccess,
  getEffectiveUser,
} from "@/lib/core/access-control";

async function chooseMobileCompany(formData: FormData) {
  "use server";

  const companyId = Number(formData.get("companyId"));

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error("Ógilt fyrirtæki.");
  }

  const access = await getCompanyAccess(companyId);

  if (!access.allowed) {
    throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");
  }

  const cookieStore = await cookies();

  cookieStore.set("activeCompanyId", String(companyId), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
  });

  redirect("/mobile");
}

export default async function MobilePage({
  searchParams,
}: {
  searchParams: Promise<{ velja?: string }>;
}) {
  const user = await getEffectiveUser();
  const params = await searchParams;
const veljaFyrirtaeki = params.velja === "1";

  if (!user) {
    redirect("/innskraning");
  }

  const cookieStore = await cookies();
  const activeCompanyId = Number(
    cookieStore.get("activeCompanyId")?.value || 0,
  );

  const companies =
    user.role === "ADMIN"
      ? await prisma.company.findMany({
          select: {
            id: true,
            name: true,
            kennitala: true,
          },
          orderBy: {
            name: "asc",
          },
        })
      : (
          await prisma.userCompany.findMany({
            where: {
              userId: user.id,
              isActive: true,
            },
            include: {
              company: {
                select: {
                  id: true,
                  name: true,
                  kennitala: true,
                },
              },
            },
          })
        )
          .map((access) => access.company)
          .sort((a, b) =>
            a.name.localeCompare(b.name, "is"),
          );

  const activeCompany =
    companies.find(
      (company) => company.id === activeCompanyId,
    ) ?? null;

  /*
   * Ef ekkert gilt fyrirtæki er valið,
   * sýnum við strax einfalt fyrirtækjaval.
   */
  if (!activeCompany || veljaFyrirtaeki) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-10 pt-6">
          <header>
            <p className="text-sm font-bold tracking-wide text-slate-700">
              GLÖGGT MOBILE
            </p>

            <h1 className="mt-2 text-3xl font-bold text-slate-950">
              Veldu fyrirtæki
            </h1>

            <p className="mt-2 text-base text-slate-600">
              Veldu fyrirtækið sem þú ætlar að vinna með.
            </p>
          </header>

          {companies.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-bold text-amber-900">
                Engin fyrirtæki tiltæk
              </p>

              <p className="mt-2 text-sm text-amber-800">
                Þú ert ekki með virkan aðgang að neinu fyrirtæki.
              </p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {companies.map((company) => (
                <form
                  key={company.id}
                  action={chooseMobileCompany}
                >
                  <input
                    type="hidden"
                    name="companyId"
                    value={company.id}
                  />

                  <button
                    type="submit"
                    className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 active:scale-[0.99]"
                  >
                    <div className="text-lg font-bold text-slate-950">
                      {company.name}
                    </div>

                    {company.kennitala && (
                      <div className="mt-1 text-sm text-slate-500">
                        {company.kennitala}
                      </div>
                    )}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <header>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold tracking-wide text-slate-700">
                GLÖGGT MOBILE
              </p>

              <h1 className="mt-1 text-2xl font-bold text-slate-950">
                Góðan daginn
              </h1>
            </div>

            <Link
              href="/mobile?velja=1"
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm"
            >
              Skipta
            </Link>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Virkt fyrirtæki
            </p>

            <p className="mt-1 text-lg font-bold text-slate-950">
              {activeCompany.name}
            </p>

            {activeCompany.kennitala && (
              <p className="mt-1 text-sm text-slate-600">
                {activeCompany.kennitala}
              </p>
            )}
          </div>

          <p className="mt-4 text-slate-600">
            Veldu hvað þú vilt gera.
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3">
          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <div className="text-lg font-bold">
              Innsýn
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Yfirlit
            </div>
          </button>

          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <div className="text-lg font-bold">
              Verk
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Verkefni
            </div>
          </button>

          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <div className="text-lg font-bold">
              Tími
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Vinnustundir
            </div>
          </button>

          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <div className="text-lg font-bold">
              Birgðir
            </div>
            <div className="mt-1 text-sm text-slate-500">
              Birgðastaða
            </div>
          </button>
        </section>

        <Link
          href="/mobile/myndataka"
          className="mt-4 block w-full rounded-2xl bg-blue-600 p-5 text-left text-white shadow-sm"
        >
          <div className="text-xl font-bold">
            Taka mynd af fylgiskjali
          </div>

          <div className="mt-1 text-sm text-blue-100">
            Senda reikning eða kvittun í GLÖGGT
          </div>
        </Link>
      </div>
    </main>
  );
}