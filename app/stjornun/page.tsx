import Link from "next/link";
import { redirect } from "next/navigation";

import { getCompanyAccess, getEffectiveUser, requireActiveCompanyReadAccess } from "@/lib/core/access-control";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { isCompanyModuleEnabled } from "@/lib/core/company-modules";
import { GLOGGT_MODULE_LIST, type GloggtModuleId } from "@/lib/core/modules";
import {
  MOBILE_FEATURE_LIST,
  isMobileFeatureAvailable,
  isMobileFeatureVisible,
  type MobileFeatureKey,
} from "@/lib/core/mobile-features";
import {
  getMobileFeatureSettings,
  getUserMobileFeatureSettings,
} from "@/lib/core/mobile-feature-repository";
import { companyManagementText } from "@/lib/i18n/company-management";
import { uiText } from "@/lib/i18n/ui";
import { prisma } from "@/lib/prisma";
import { saveUserMobileFeatureVisibility } from "./actions";

const serviceHref: Partial<Record<GloggtModuleId, string>> = {
  bokhald: "/stillingar/fyrirtaeki",
  sala: "/sala",
  laun: "/laun",
  birgdir: "/birgdir",
  vinnustundir: "/vinnustundir",
  verk: "/verk",
};

export default async function CompanyManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ mobileUserId?: string; saved?: string }>;
}) {
  const companyId = await requireActiveCompanyReadAccess();
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning?next=%2Fstjornun");

  const params = await searchParams;

  const [access, company, userSettings, moduleSettings, companyMobileSettings] = await Promise.all([
    getCompanyAccess(companyId),
    prisma.company.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        name: true,
        users: {
          where: { isActive: true },
          select: { accessRole: true, user: { select: { id: true, name: true, email: true } } },
          orderBy: { user: { name: "asc" } },
        },
      },
    }),
    prisma.userSettings.findUnique({ where: { userId: user.id }, select: { interfaceLanguage: true } }),
    getCompanyModuleSettings(companyId),
    getMobileFeatureSettings(companyId),
  ]);

  const mayManage =
    access.role === "ADMIN" ||
    access.role === "OWNER" ||
    access.role === "MANAGER" ||
    access.canManageCompanySettings;
  if (!mayManage) redirect("/");
  if (!company) redirect("/fyrirtaeki");

  const language = userSettings?.interfaceLanguage ?? "is";
  const t = companyManagementText(language);
  const ui = uiText(language);
  const accessRoleText = (role: string) =>
    role === "OWNER"
      ? ui.owner
      : role === "MANAGER"
        ? ui.manager
        : role === "BOOKKEEPER"
          ? ui.bookkeeper
          : role === "VIEWER"
            ? ui.viewer
            : role;
  const enabledModules = GLOGGT_MODULE_LIST.filter((module) =>
    isCompanyModuleEnabled(module.id, moduleSettings),
  );
  const mobileFeatures = MOBILE_FEATURE_LIST.filter((feature) =>
    isMobileFeatureAvailable(feature.key as MobileFeatureKey, moduleSettings),
  );

  const requestedMobileUserId = Number(params.mobileUserId || 0);
  const defaultMobileUserId =
    company.users.find((link) => link.user.id === user.id)?.user.id ?? company.users[0]?.user.id ?? null;
  const selectedMobileUser =
    company.users.find((link) => link.user.id === requestedMobileUserId) ??
    company.users.find((link) => link.user.id === defaultMobileUserId) ??
    null;

  const selectedUserOverrides = selectedMobileUser
    ? await getUserMobileFeatureSettings(companyId, selectedMobileUser.user.id)
    : {};
  const selectedUserMobileSettings = { ...companyMobileSettings, ...selectedUserOverrides };

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-6 lg:p-8">
      <header>
        <h1 className="text-3xl font-bold text-slate-950">{t.title}</h1>
        <p className="mt-2 max-w-3xl text-slate-600">{company.name} · {t.subtitle}</p>
      </header>

      <section className="rounded-2xl border bg-white p-6 shadow-sm">
        <h2 className="text-xl font-bold text-slate-950">{t.subscriptionTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t.subscriptionHelp}</p>

        {enabledModules.length === 0 ? (
          <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t.noServices}</p>
        ) : (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {enabledModules.map((module) => {
              const href = serviceHref[module.id];
              const name = t.services[module.id];
              const card = (
                <div className="rounded-xl border bg-slate-50 p-4">
                  <div className="font-bold text-slate-950">{name}</div>
                  <p className="mt-1 text-sm leading-5 text-slate-600">{t.serviceHelp[module.id]}</p>
                  {href ? <div className="mt-3 text-sm font-semibold text-blue-700">{t.open} →</div> : null}
                </div>
              );
              return href ? <Link key={module.id} href={href}>{card}</Link> : <div key={module.id}>{card}</div>;
            })}
          </div>
        )}
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <div className="rounded-2xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-slate-950">{t.usersTitle}</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">{t.usersHelp}</p>
          <div className="mt-4 space-y-2">
            {company.users.map((link) => {
              const selected = selectedMobileUser?.user.id === link.user.id;
              return (
                <Link
                  key={link.user.id}
                  href={`/stjornun?mobileUserId=${link.user.id}#mobile`}
                  className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2 transition ${
                    selected
                      ? "border-blue-300 bg-blue-50"
                      : "border-transparent bg-slate-50 hover:border-slate-200 hover:bg-white"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-slate-900">{link.user.name}</div>
                    <div className="truncate text-xs text-slate-500">{link.user.email}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600">{accessRoleText(link.accessRole)}</span>
                </Link>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-5 text-slate-500">{t.usersMobileHint}</p>
        </div>

        {isCompanyModuleEnabled("verk", moduleSettings) ? (
          <Link href="/verk/tilfong" className="rounded-2xl border bg-white p-6 shadow-sm transition hover:border-violet-300 hover:bg-violet-50/30">
            <h2 className="text-lg font-bold text-slate-950">{t.equipmentTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t.equipmentHelp}</p>
            <div className="mt-4 text-sm font-semibold text-violet-700">{t.open} →</div>
          </Link>
        ) : null}

        {isCompanyModuleEnabled("bokhald", moduleSettings) ? (
          <Link href="/stillingar/fyrirtaeki" className="rounded-2xl border bg-white p-6 shadow-sm transition hover:border-blue-300 hover:bg-blue-50/30">
            <h2 className="text-lg font-bold text-slate-950">{t.companyRulesTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">{t.companyRulesHelp}</p>
            <div className="mt-4 text-sm font-semibold text-blue-700">{t.open} →</div>
          </Link>
        ) : null}
      </section>

      <section id="mobile" className="rounded-2xl border bg-white p-6 shadow-sm scroll-mt-6">
        <h2 className="text-xl font-bold text-slate-950">{t.mobileTitle}</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">{t.mobileHelp}</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">{t.mobileSubscriptionNote}</p>

        {selectedMobileUser ? (
          <>
            <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t.mobileSettingsFor}</div>
              <div className="mt-1 font-bold text-slate-950">{selectedMobileUser.user.name}</div>
              <div className="text-sm text-slate-600">{selectedMobileUser.user.email}</div>
            </div>

            {params.saved === "1" ? (
              <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
                {t.saved}
              </div>
            ) : null}

            <form
              key={`mobile-settings-${selectedMobileUser.user.id}`}
              action={saveUserMobileFeatureVisibility}
              className="mt-5 space-y-3"
            >
              <input type="hidden" name="targetUserId" value={selectedMobileUser.user.id} />
              {mobileFeatures.map((feature) => {
                const featureText = t.mobileFeatures[feature.key as keyof typeof t.mobileFeatures];
                return (
                  <label key={feature.key} className="flex gap-3 rounded-xl border bg-slate-50 p-4">
                    <input
                      type="checkbox"
                      name="visibleFeature"
                      value={feature.key}
                      defaultChecked={isMobileFeatureVisible(feature.key as MobileFeatureKey, selectedUserMobileSettings)}
                      className="mt-1 h-4 w-4"
                    />
                    <span>
                      <span className="block font-bold text-slate-900">{featureText.name}</span>
                      <span className="mt-1 block text-sm leading-5 text-slate-600">{featureText.help}</span>
                    </span>
                  </label>
                );
              })}

              <button type="submit" className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white">
                {t.saveMobile}
              </button>
            </form>
          </>
        ) : (
          <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t.noMobileUsers}</p>
        )}
      </section>
    </main>
  );
}
