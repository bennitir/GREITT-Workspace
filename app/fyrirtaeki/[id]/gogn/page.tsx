import Link from "next/link";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { getEffectiveUser } from "@/lib/core/access-control";

export default async function CompanyDataPage({
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
    include: {
      _count: {
        select: {
          receipts: true,
          accounts: true,
          vatPeriods: true,
        },
      },
    },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  return (
    <main className="p-8">
      <Link
        href={`/fyrirtaeki/${company.id}`}
        className="text-sm font-medium text-blue-700 hover:text-blue-900"
      >
        ← Til baka í fyrirtæki
      </Link>

      <div className="mt-4">
        <h1 className="text-3xl font-bold">
          Gögn fyrirtækis
        </h1>

        <p className="mt-1 text-slate-600">
          {company.name} · {company.kennitala}
        </p>
      </div>

      {!company.isActive && (
        <div className="mt-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            LESHAMUR
          </p>

          <p className="mt-1 text-sm text-amber-800">
            Fyrirtækið er lokað. Hér verður hægt að skoða,
            prenta og sækja varðveitt gögn án þess að breyta bókhaldinu.
          </p>
        </div>
      )}

      <div className="mt-6 grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm font-semibold text-slate-500">
            Fylgiskjöl
          </p>

          <p className="mt-2 text-3xl font-bold">
            {company._count.receipts}
          </p>

          <p className="mt-2 text-sm text-slate-600">
            Frumskjöl og bókaðar færslur.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm font-semibold text-slate-500">
            Bókhaldsreikningar
          </p>

          <p className="mt-2 text-3xl font-bold">
            {company._count.accounts}
          </p>

          <p className="mt-2 text-sm text-slate-600">
            Lyklar og uppsetning bókhalds.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-5">
          <p className="text-sm font-semibold text-slate-500">
            VSK-tímabil
          </p>

          <p className="mt-2 text-3xl font-bold">
            {company._count.vatPeriods}
          </p>

          <p className="mt-2 text-sm text-slate-600">
            VSK-yfirlit og síðar skilakvittanir.
          </p>
        </div>
      </div>

      <section className="mt-6 rounded-xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          Prentun og afhending gagna
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          Hér mun GLÖGGT útbúa gögn sem hægt er að prenta
          eða sækja þegar fyrirtæki hættir í þjónustu.
        </p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <Link
            href={`/fyrirtaeki/${company.id}/gogn/fylgiskjol`}
            className="rounded-lg border bg-white p-4 text-left transition hover:bg-slate-50"
          >
            <span className="block font-semibold text-blue-700">
              Bókuð fylgiskjöl
            </span>

            <span className="mt-1 block text-sm text-slate-500">
              Skoða bókuð fylgiskjöl og undirbúa prentun
            </span>
          </Link>

          <Link
            href={`/fyrirtaeki/${company.id}/gogn/hreyfingalisti`}
            className="rounded-lg border bg-white p-4 text-left transition hover:bg-slate-50"
          >
            <span className="block font-semibold text-blue-700">
              Hreyfingalisti
            </span>

            <span className="mt-1 block text-sm text-slate-500">
              Skoða bókhaldshreyfingar fyrirtækisins
            </span>
          </Link>

          <Link
            href={`/fyrirtaeki/${company.id}/gogn/stodulisti`}
            className="rounded-lg border bg-white p-4 text-left transition hover:bg-slate-50"
          >
            <span className="block font-semibold text-blue-700">
              Stöðulisti / Prufujöfnuður
            </span>

            <span className="mt-1 block text-sm text-slate-500">
              Sýnir stöðu allra bókhaldslykla
            </span>
          </Link>

          <Link
            href={`/fyrirtaeki/${company.id}/gogn/frumskjol`}
            className="rounded-lg border bg-white p-4 text-left transition hover:bg-slate-50"
          >
            <span className="block font-semibold text-blue-700">
              Frumskjöl
            </span>

            <span className="mt-1 block text-sm text-slate-500">
              Skoða og sækja varðveitt frumskjöl
            </span>
          </Link>

          <button
            type="button"
            disabled
            className="rounded-lg border bg-slate-100 p-4 text-left opacity-60"
          >
            <span className="block font-semibold">
              Sækja öll gögn
            </span>

            <span className="mt-1 block text-sm text-slate-500">
              Heildarpakki — síðar
            </span>
          </button>
        </div>
      </section>
    </main>
  );
}