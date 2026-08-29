import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
export default async function MobilePage() {

const cookieStore = await cookies();
const activeCompanyId =
  cookieStore.get("activeCompanyId")?.value;

const activeCompany = activeCompanyId
  ? await prisma.company.findUnique({
      where: {
        id: Number(activeCompanyId),
      },
      select: {
        name: true,
      },
    })
  : null;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <header>
          <div className="flex items-center justify-between">
  <p className="text-sm font-bold text-slate-700">
    GLÖGGT
  </p>

  <p className="text-sm font-medium text-slate-600">
  {activeCompany?.name ?? "Ekkert fyrirtæki valið"}
</p>
</div>

          <h1 className="mt-1 text-2xl font-bold">
            Góðan daginn
          </h1>

          <p className="mt-1 text-slate-600">
            Veldu hvað þú vilt gera.
          </p>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-3">
          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <span className="text-2xl">📊</span>
            <div className="mt-3 font-bold">Innsýn</div>
          </button>

          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <span className="text-2xl">🔧</span>
            <div className="mt-3 font-bold">Verk</div>
          </button>

          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <span className="text-2xl">⏱️</span>
            <div className="mt-3 font-bold">Tími</div>
          </button>

          <button className="rounded-2xl border bg-white p-5 text-left shadow-sm">
            <span className="text-2xl">📦</span>
            <div className="mt-3 font-bold">Birgðir</div>
          </button>
        </section>

        <Link
  href="/mobile/myndataka"
  className="mt-4 block w-full rounded-2xl bg-blue-600 p-5 text-left text-white shadow-sm"
>
          <div className="flex items-center gap-4">
            <span className="text-3xl">📷</span>

            <div>
              <div className="text-lg font-bold">
                Taka mynd af fylgiskjali
              </div>
              <div className="text-sm text-blue-100">
                Senda reikning eða kvittun í GLÖGGT
              </div>
            </div>
          </div>
        </Link>
      </div>
    </main>
  );
}