import Link from "next/link";
import { redirect } from "next/navigation";

import SalesStartClient from "@/app/sala/SalesStartClient";
import { getCompanyAccess } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { hasSalesPermission } from "@/lib/core/sales-permissions";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { salesText } from "@/lib/i18n/sales";
import { getSalesHomeReadModel } from "@/lib/sales/read-model";

export default async function SalaPage() {
  const companyId = await requireCompanyModule("sala");
  const access = await getCompanyAccess(companyId);

  if (!hasSalesPermission(access, "SALE_USE")) {
    redirect("/");
  }

  const [language, model] = await Promise.all([
    getCurrentInterfaceLanguage(),
    getSalesHomeReadModel(companyId),
  ]);
  const t = salesText(language);

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <header>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-slate-500">GLÖGGT</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight text-slate-950">{t.title}</h1>
          <p className="mt-2 max-w-2xl text-slate-600">{t.subtitle}</p>
        </header>

        {model.branches.length > 0 ? (
          <SalesStartClient
            branches={model.branches}
            text={{
              newSale: t.newSale,
              branch: t.branch,
              terminal: t.terminal,
              noTerminal: t.noTerminal,
              startSale: t.startSale,
              starting: t.starting,
              actionFailed: t.actionFailed,
            }}
          />
        ) : (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
            <h2 className="font-bold text-amber-950">{t.noBranches}</h2>
            <p className="mt-1 text-sm text-amber-900">{t.noBranchesHelp}</p>
          </section>
        )}

        <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h2 className="text-lg font-bold text-slate-900">{t.openSales}</h2>
          </div>

          {model.openSales.length === 0 ? (
            <p className="px-5 py-8 text-sm text-slate-500">{t.noOpenSales}</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {model.openSales.map((sale) => (
                <div key={sale.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-bold text-slate-950">{t.sale} #{sale.id}</span>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {t.statuses[sale.status]}
                      </span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {sale.branchName}
                      {sale.terminalName ? ` · ${sale.terminalName}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="font-black text-slate-950">{sale.totalAmount} {sale.currency}</span>
                    <Link
                      href={`/sala/${sale.id}`}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50"
                    >
                      {t.openSale}
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
