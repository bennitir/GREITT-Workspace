import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { logoutMobileUser } from "@/app/actions/userActions";
import { getEffectiveUser } from "@/lib/core/access-control";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getMobileCompaniesForUser } from "@/lib/core/mobile-company";
import { getEffectiveMobileFeatureSettings } from "@/lib/core/mobile-feature-repository";
import { mobileSettingsSeenCookieName } from "@/lib/core/mobile-settings-visit";
import { isMobileFeatureShown } from "@/lib/core/mobile-features";
import { companyManagementText } from "@/lib/i18n/company-management";
import { stocktakeMobileText } from "@/lib/i18n/stocktake-mobile";
import { uiText } from "@/lib/i18n/ui";
import { prisma } from "@/lib/prisma";

async function chooseMobileCompany(formData: FormData) {
  "use server";

  const companyId = Number(formData.get("companyId"));

  if (!Number.isInteger(companyId) || companyId <= 0) {
    throw new Error("Ógilt fyrirtæki.");
  }

  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=/mobile");

  const companies = await getMobileCompaniesForUser(user);
  const allowed = companies.some((company) => company.id === companyId);
  if (!allowed) throw new Error("Þú hefur ekki aðgang að þessu fyrirtæki.");

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

  if (!user) redirect("/innskraning?next=/mobile");

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { interfaceLanguage: true },
  });
  const language = userSettings?.interfaceLanguage ?? "is";
  const t = uiText(language);
  const managementT = companyManagementText(language);
  const stocktakeT = stocktakeMobileText(language);

  const cookieStore = await cookies();
  const activeCompanyId = Number(cookieStore.get("activeCompanyId")?.value || 0);
  const hasSeenMobileSettings =
    cookieStore.get(mobileSettingsSeenCookieName(user.id))?.value === "1";
  const companies = await getMobileCompaniesForUser(user);
  const activeCompany = companies.find((company) => company.id === activeCompanyId) ?? null;

  if (!activeCompany || veljaFyrirtaeki) {
    return (
      <main className="min-h-screen bg-slate-100">
        <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-10 pt-6">
          <header>
            <div className="flex items-start justify-between gap-3">
              <p className="text-sm font-bold tracking-wide text-slate-700">GLÖGGT MOBILE</p>
              <form action={logoutMobileUser}>
                <button type="submit" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  {t.logout}
                </button>
              </form>
            </div>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">{t.chooseCompany}</h1>
            <p className="mt-2 text-base text-slate-600">{t.chooseCompanyHelp}</p>
          </header>

          {companies.length === 0 ? (
            <div className="mt-8 rounded-2xl border border-amber-200 bg-amber-50 p-5">
              <p className="font-bold text-amber-900">{t.noCompanies}</p>
              <p className="mt-2 text-sm text-amber-800">{t.noCompaniesHelp}</p>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {companies.map((company) => (
                <form key={company.id} action={chooseMobileCompany}>
                  <input type="hidden" name="companyId" value={company.id} />
                  <button type="submit" className="w-full rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:border-blue-300 hover:bg-blue-50 active:scale-[0.99]">
                    <div className="text-lg font-bold text-slate-950">{company.name}</div>
                    {company.kennitala ? <div className="mt-1 text-sm text-slate-500">{company.kennitala}</div> : null}
                  </button>
                </form>
              ))}
            </div>
          )}
        </div>
      </main>
    );
  }

  const [moduleSettings, mobileSettings] = await Promise.all([
    getCompanyModuleSettings(activeCompany.id),
    getEffectiveMobileFeatureSettings(activeCompany.id, user.id),
  ]);

  const showWork = isMobileFeatureShown("work", moduleSettings, mobileSettings);
  const showStocktake = isMobileFeatureShown("inventoryCount", moduleSettings, mobileSettings);
  const showReceiptCapture = isMobileFeatureShown("receiptCapture", moduleSettings, mobileSettings);
  const hasWorkActions = showWork || showStocktake || showReceiptCapture;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <header>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold tracking-wide text-slate-700">GLÖGGT MOBILE</p>
              <h1 className="mt-1 text-2xl font-bold text-slate-950">{t.goodDay}</h1>
            </div>

            <div className="flex items-center gap-2">
              {hasSeenMobileSettings ? (
                <Link
                  href="/mobile/stillingar"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-lg shadow-sm active:bg-slate-50"
                  aria-label={t.settings}
                  title={t.settings}
                >
                  <span aria-hidden="true">⚙️</span>
                </Link>
              ) : null}
              <Link href="/mobile?velja=1" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                {t.switchCompany}
              </Link>
              <form action={logoutMobileUser}>
                <button type="submit" className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
                  {t.logout}
                </button>
              </form>
            </div>
          </div>

          <div className="mt-4 rounded-2xl bg-slate-100 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.activeCompany}</p>
            <p className="mt-1 text-lg font-bold text-slate-950">{activeCompany.name}</p>
            {activeCompany.kennitala ? <p className="mt-1 text-sm text-slate-600">{activeCompany.kennitala}</p> : null}
          </div>

          <p className="mt-4 text-slate-600">{t.chooseAction}</p>
        </header>

        {hasWorkActions ? (
          <section className="mt-6 grid grid-cols-2 gap-3">
            {showWork ? (
              <Link href="/mobile/verk" className="rounded-2xl border bg-white p-5 text-left shadow-sm active:bg-slate-50">
                <div className="text-lg font-bold">{t.work.replace("🔧 ", "")}</div>
                <div className="mt-1 text-sm text-slate-500">{t.tasks}</div>
              </Link>
            ) : null}

            {showStocktake ? (
              <Link href="/mobile/vorutalning" className="rounded-2xl border bg-white p-5 text-left shadow-sm active:bg-slate-50">
                <div className="text-lg font-bold">{stocktakeT.shortTitle}</div>
                <div className="mt-1 text-sm text-slate-500">{stocktakeT.inventoryTileHelp}</div>
              </Link>
            ) : null}
          </section>
        ) : (
          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-6 text-slate-600">
            {managementT.mobileEmpty}
          </div>
        )}

        {!hasSeenMobileSettings ? (
          <Link href="/mobile/stillingar" className="mt-4 block rounded-2xl border bg-white p-5 text-left shadow-sm active:bg-slate-50">
            <div className="text-lg font-bold">⚙️ {t.settings}</div>
            <div className="mt-1 text-sm text-slate-500">{t.interfaceLanguage} · {t.timeTracking}</div>
          </Link>
        ) : null}

        {showReceiptCapture ? (
          <Link href="/mobile/myndataka" className="mt-4 block w-full rounded-2xl bg-blue-600 p-5 text-left text-white shadow-sm active:bg-blue-700">
            <div className="text-xl font-bold">{t.takePhoto}</div>
            <div className="mt-1 text-sm text-blue-100">{t.sendReceipt}</div>
          </Link>
        ) : null}
      </div>
    </main>
  );
}
