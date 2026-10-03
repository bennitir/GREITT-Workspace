import Link from "next/link";
import { redirect } from "next/navigation";

import {
  createSalesTerminalAction,
  enableSalesBranchAction,
  updateSalesBranchAction,
  updateSalesTerminalAction,
} from "@/app/stjornun/sala/actions";
import { getCompanyAccess } from "@/lib/core/access-control";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { hasSalesPermission } from "@/lib/core/sales-permissions";
import { SALES_TERMINAL_TYPES } from "@/lib/core/sales-settings";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { salesManagementText } from "@/lib/i18n/sales-management";
import { getSalesSettingsReadModel } from "@/lib/sales/settings-read-model";

type SettingsError = keyof ReturnType<typeof salesManagementText>["errors"];

export default async function SalesManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const companyId = await requireCompanyModule("sala");
  const access = await getCompanyAccess(companyId);
  if (!hasSalesPermission(access, "SALE_SETTINGS_MANAGE")) redirect("/stjornun");

  const params = await searchParams;
  const [language, model] = await Promise.all([
    getCurrentInterfaceLanguage(),
    getSalesSettingsReadModel(companyId),
  ]);
  const t = salesManagementText(language);
  const errorKey = params.error as SettingsError | undefined;
  const errorText = errorKey && errorKey in t.errors ? t.errors[errorKey] : null;

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header>
        <Link href="/stjornun" className="text-sm font-semibold text-slate-600 hover:text-slate-950">
          ← {t.back}
        </Link>
        <h1 className="mt-2 text-3xl font-bold text-slate-950">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-slate-600">{t.subtitle}</p>
      </header>

      {params.saved ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
          {t.saved}
        </div>
      ) : null}
      {errorText ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">
          {errorText}
        </div>
      ) : null}

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">{t.locationsTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t.locationsHelp}</p>

        {model.availableLocations.length > 0 ? (
          <form action={enableSalesBranchAction} className="mt-5 flex flex-col gap-3 rounded-xl border bg-slate-50 p-4 sm:flex-row sm:items-end">
            <label className="flex-1 space-y-1">
              <span className="text-sm font-semibold text-slate-700">{t.location}</span>
              <select name="operationalLocationId" required defaultValue="" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5">
                <option value="" disabled>{t.chooseLocation}</option>
                {model.availableLocations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name} ({location.code})
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rounded-xl bg-slate-950 px-5 py-2.5 font-semibold text-white">
              {t.addBranch}
            </button>
          </form>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t.noAvailableLocations}</p>
        )}
      </section>

      {model.branches.length === 0 ? (
        <section className="rounded-2xl border bg-white p-6 text-sm text-slate-600 shadow-sm">{t.noBranches}</section>
      ) : (
        <div className="space-y-5">
          {model.branches.map((branch) => {
            const location = branch.operationalLocation;
            return (
              <section key={branch.id} className="rounded-2xl border bg-white p-6 shadow-sm">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-bold text-slate-950">{location.name}</h2>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{location.code}</span>
                    </div>
                    <p className="mt-1 text-sm text-slate-600">
                      {[location.address, location.postalCode, location.city].filter(Boolean).join(" · ")}
                    </p>
                    {!location.isActive ? (
                      <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{t.inactiveLocation}</p>
                    ) : null}
                  </div>

                  <form action={updateSalesBranchAction} className="flex items-center gap-3">
                    <input type="hidden" name="branchId" value={branch.id} />
                    <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                      <input type="checkbox" name="isActive" defaultChecked={branch.isActive} disabled={!location.isActive} className="h-4 w-4" />
                      {t.active}
                    </label>
                    <button type="submit" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                      {t.saveBranch}
                    </button>
                  </form>
                </div>

                <div className="mt-6 border-t border-slate-200 pt-5">
                  <h3 className="font-bold text-slate-950">{t.terminalsTitle}</h3>
                  <p className="mt-1 text-sm text-slate-600">{t.terminalsHelp}</p>

                  {branch.terminals.length === 0 ? (
                    <p className="mt-4 text-sm text-slate-500">{t.noTerminals}</p>
                  ) : (
                    <div className="mt-4 space-y-3">
                      {branch.terminals.map((terminal) => (
                        <form key={terminal.id} action={updateSalesTerminalAction} className="grid gap-3 rounded-xl border bg-slate-50 p-4 md:grid-cols-[1fr_2fr_1fr_auto_auto] md:items-end">
                          <input type="hidden" name="terminalId" value={terminal.id} />
                          <label className="space-y-1">
                            <span className="text-xs font-semibold text-slate-600">{t.code}</span>
                            <input name="code" defaultValue={terminal.code} required maxLength={64} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-semibold text-slate-600">{t.name}</span>
                            <input name="name" defaultValue={terminal.name} required maxLength={160} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2" />
                          </label>
                          <label className="space-y-1">
                            <span className="text-xs font-semibold text-slate-600">{t.type}</span>
                            <select name="terminalType" defaultValue={terminal.terminalType} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2">
                              {SALES_TERMINAL_TYPES.map((type) => <option key={type} value={type}>{t.terminalTypes[type]}</option>)}
                            </select>
                          </label>
                          <label className="flex items-center gap-2 pb-2 text-sm font-semibold text-slate-700">
                            <input type="checkbox" name="isActive" defaultChecked={terminal.isActive} className="h-4 w-4" />
                            {t.active}
                          </label>
                          <button type="submit" className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-900">
                            {t.saveTerminal}
                          </button>
                        </form>
                      ))}
                    </div>
                  )}

                  <form action={createSalesTerminalAction} className="mt-5 grid gap-3 rounded-xl border border-dashed border-slate-300 p-4 md:grid-cols-[1fr_2fr_1fr_auto] md:items-end">
                    <input type="hidden" name="branchId" value={branch.id} />
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">{t.code}</span>
                      <input name="code" required maxLength={64} disabled={!branch.isActive || !location.isActive} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">{t.name}</span>
                      <input name="name" required maxLength={160} disabled={!branch.isActive || !location.isActive} className="w-full rounded-lg border border-slate-300 px-3 py-2 disabled:bg-slate-100" />
                    </label>
                    <label className="space-y-1">
                      <span className="text-xs font-semibold text-slate-600">{t.type}</span>
                      <select name="terminalType" defaultValue="POS" disabled={!branch.isActive || !location.isActive} className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 disabled:bg-slate-100">
                        {SALES_TERMINAL_TYPES.map((type) => <option key={type} value={type}>{t.terminalTypes[type]}</option>)}
                      </select>
                    </label>
                    <button type="submit" disabled={!branch.isActive || !location.isActive} className="rounded-xl bg-slate-950 px-4 py-2 font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">
                      {t.createTerminal}
                    </button>
                  </form>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </main>
  );
}
