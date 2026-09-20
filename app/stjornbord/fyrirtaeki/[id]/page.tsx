import AdminOpenCompanyButton from "@/components/AdminOpenCompanyButton";
import Button from "@/components/ui/Button";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/prisma";
import { GLOGGT_MODULE_LIST } from "@/lib/core/modules";
import {
  getCompanyModuleSettings,
  setCompanyModuleEnabled,
} from "@/lib/core/company-module-repository";

import {
  addUserCompany,
  removeUserCompany,
  setUserCompanyRole,
  updateUserEmailAndResendAccess,
} from "@/app/actions/userActions";
import { setActiveCompanyFromAdmin } from "@/app/actions/companyActions";
import DeleteCompanyButton from "@/components/DeleteCompanyButton";
import ReactivateCompanyButton from "@/components/ReactivateCompanyButton";
import { saveCompanyBookkeepingSettings } from "@/app/actions/bookkeepingSettingsActions";
import { getBookkeepingWorkflowSettings } from "@/lib/core/bookkeeping-workflow";
import { companyAccessText } from "@/lib/i18n/company-access";
import { WORK_CAPABILITY_LIST, isWorkCapabilityEnabled } from "@/lib/core/work-capabilities";
import { getWorkCapabilitySettings, setWorkCapabilityEnabled } from "@/lib/core/work-capability-repository";
import { workCapabilitiesText } from "@/lib/i18n/work-capabilities";
import { adminLocale, adminModuleLabel, adminRoleLabel, adminText } from "@/lib/i18n/admin";

export default async function CompanyAdminPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ userSearch?: string }>;
}) {
  const { id } = await params;
  const search = await searchParams;

  const companyId = Number(id);

  if (!Number.isInteger(companyId)) {
    redirect("/stjornbord");
  }

  const cookieStore = await cookies();
  const sessionToken = cookieStore.get("sessionToken")?.value;

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

  if (session.user.role !== "ADMIN") {
    redirect("/stjornbord");
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    include: {
      users: {
        include: {
          user: true,
        },
        orderBy: {
          user: {
            name: "asc",
          },
        },
      },
      _count: {
        select: {
          receipts: true,
          workOrders: true,
          workLogs: true,
        },
      },
    },
  });

  if (!company) {
    redirect("/stjornbord");
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: session.user.id },
    select: { interfaceLanguage: true },
  });

  const language = userSettings?.interfaceLanguage ?? "is";
  const tAccess = companyAccessText(language);
  const tWorkCapabilities = workCapabilitiesText(language);
  const tAdmin = adminText(language);
  const locale = adminLocale(language);

  const [moduleSettings, workCapabilitySettings, bookkeepingSettings] =
    await Promise.all([
      getCompanyModuleSettings(company.id),
      getWorkCapabilitySettings(company.id),
      getBookkeepingWorkflowSettings(company.id),
    ]);

  const userSearch =
    search.userSearch?.trim() ?? "";

  const alreadyConnectedUserIds = new Set(
    company.users.map((access) => access.userId)
  );

  const userSearchResults =
    userSearch.length >= 2
      ? await prisma.user.findMany({
          where: {
            isActive: true,
            id: {
              notIn: Array.from(alreadyConnectedUserIds),
            },
            OR: [
              {
                name: {
                  contains: userSearch,
                  mode: "insensitive",
                },
              },
              {
                email: {
                  contains: userSearch,
                  mode: "insensitive",
                },
              },
            ],
          },
          orderBy: {
            name: "asc",
          },
          take: 20,
        })
      : [];

  return (
    <main className="p-8">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/stjornbord"
            className="text-sm font-medium text-blue-700 hover:text-blue-900"
          >
            {tAdmin.companyDetail.back}
          </Link>

          <h1 className="mt-3 text-3xl font-bold">
            {company.name}
          </h1>

          <p className="mt-1 text-slate-600">
            {tAdmin.companyDetail.idNumber}: {company.kennitala}
          </p>

          <p className="mt-1 text-sm text-slate-500">
            {tAdmin.companyDetail.companyNumber} #{company.id}
          </p>
        </div>
                <div className="flex flex-wrap gap-2">

        <AdminOpenCompanyButton companyId={company.id} language={language} />

          {company.isActive ? (
            <DeleteCompanyButton
  id={company.id}
  language={language}
  hasBookkeepingData={
    company._count.receipts > 0 ||
    company.nextVoucherNumber > 1
  }
/>
          ) : (
            <ReactivateCompanyButton id={company.id} language={language} />
          )}
        </div>
      </div>

      {!company.isActive && (
        <div className="mb-6 rounded-lg border border-amber-300 bg-amber-50 p-4">
          <p className="font-bold text-amber-900">
            {tAdmin.companyDetail.closedTitle}
          </p>

          <p className="mt-1 text-sm text-amber-800">
            {tAdmin.companyDetail.closedText}
          </p>

          {company.closedAt && (
            <p className="mt-1 text-sm text-amber-800">
              {tAdmin.companyDetail.closedAt}: {new Intl.DateTimeFormat(locale).format(company.closedAt)}
            </p>
          )}
        </div>
      )}

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-500">
            {tAdmin.companyDetail.receipts}
          </p>

          <p className="mt-1 text-2xl font-bold">
            {company._count.receipts}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-500">
            {tAdmin.companyDetail.work}
          </p>

          <p className="mt-1 text-2xl font-bold">
            {company._count.workOrders}
          </p>
        </div>

        <div className="rounded-lg border bg-white p-4">
          <p className="text-sm font-semibold text-slate-500">
            {tAdmin.companyDetail.workLogs}
          </p>

          <p className="mt-1 text-2xl font-bold">
            {company._count.workLogs}
          </p>
        </div>
      </div>

      <section className="mb-6 rounded-xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          {tAdmin.companyDetail.modulesTitle}
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          {tAdmin.companyDetail.modulesHelp}
        </p>

        <div className="mt-5 flex flex-wrap gap-3">
          {GLOGGT_MODULE_LIST.map((module) => {
            const enabled =
              moduleSettings[module.id] === true;

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
                  className={`rounded-lg border px-4 py-2 font-medium ${
                    enabled
                      ? "border-green-300 bg-green-100 text-green-800"
                      : "border-slate-300 bg-slate-100 text-slate-600"
                  }`}
                >
                  {enabled ? "✓ " : ""}
                  {adminModuleLabel(module.id, module.name, language)}
                </button>
              </form>
            );
          })}
        </div>
      </section>

      <section className="mb-6 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">
              {tWorkCapabilities.sectionTitle}
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {tWorkCapabilities.sectionDescription}
            </p>
          </div>

          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {tWorkCapabilities.experimentalBadge}
          </span>
        </div>

        <div className="mt-5 grid gap-3 lg:grid-cols-2">
          {WORK_CAPABILITY_LIST.map((capability) => {
            const enabled = isWorkCapabilityEnabled(
              capability.key,
              workCapabilitySettings,
            );
            const copy =
              tWorkCapabilities.capabilities[capability.key];

            return (
              <form
                key={capability.key}
                action={async () => {
                  "use server";

                  await setWorkCapabilityEnabled(
                    company.id,
                    capability.key,
                    !enabled,
                  );
                }}
                className={`rounded-xl border p-4 ${
                  enabled
                    ? "border-emerald-300 bg-emerald-50"
                    : "border-slate-200 bg-slate-50"
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {copy.name}
                    </p>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {copy.description}
                    </p>
                  </div>

                  <button
                    type="submit"
                    className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-semibold ${
                      enabled
                        ? "border-emerald-300 bg-white text-emerald-800"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    {enabled ? `✓ ${tWorkCapabilities.enabled}` : tWorkCapabilities.disabled}
                  </button>
                </div>
              </form>
            );
          })}
        </div>

        <p className="mt-4 text-xs leading-5 text-slate-500">
          {tWorkCapabilities.moreLater}
        </p>
      </section>

      <section className="mb-6 rounded-xl border bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">{tAdmin.companyDetail.bookkeepingTitle}</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">
              {tAdmin.companyDetail.bookkeepingHelp}
            </p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-600">
            {tAdmin.companyDetail.companySetting}
          </span>
        </div>

        <form action={saveCompanyBookkeepingSettings} className="mt-6 space-y-6">
          <input type="hidden" name="companyId" value={company.id} />

          <div>
            <label className="block text-sm font-semibold text-slate-800">
              {tAdmin.companyDetail.preparationMode}
            </label>
            <select
              name="preparationMode"
              defaultValue={bookkeepingSettings.preparationMode}
              className="mt-2 w-full max-w-xl rounded-lg border px-3 py-2"
            >
              <option value="HYBRID">{tAdmin.companyDetail.preparationHybrid}</option>
              <option value="AI">{tAdmin.companyDetail.preparationAi}</option>
              <option value="MANUAL">{tAdmin.companyDetail.preparationManual}</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              {tAdmin.companyDetail.preparationHelp}
            </p>
          </div>

          <div>
            <p className="text-sm font-semibold text-slate-800">
              {tAdmin.companyDetail.controlSteps}
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-3">
              {[
                {
                  name: "requireReviewBeforeBooking",
                  checked: bookkeepingSettings.requireReviewBeforeBooking,
                  title: tAdmin.companyDetail.reviewTitle,
                  text: tAdmin.companyDetail.reviewText,
                },
                {
                  name: "requireReconciliationBeforeBooking",
                  checked: bookkeepingSettings.requireReconciliationBeforeBooking,
                  title: tAdmin.companyDetail.reconciliationTitle,
                  text: tAdmin.companyDetail.reconciliationText,
                },
                {
                  name: "requireApprovalBeforeBooking",
                  checked: bookkeepingSettings.requireApprovalBeforeBooking,
                  title: tAdmin.companyDetail.approvalTitle,
                  text: tAdmin.companyDetail.approvalText,
                },
              ].map((item) => (
                <label key={item.name} className="flex gap-3 rounded-lg border p-4">
                  <input
                    type="checkbox"
                    name={item.name}
                    defaultChecked={item.checked}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block font-semibold">{item.title}</span>
                    <span className="mt-1 block text-sm text-slate-600">{item.text}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-800">
              {tAdmin.companyDetail.completionMode}
            </label>
            <select
              name="completionMode"
              defaultValue={bookkeepingSettings.completionMode}
              className="mt-2 w-full max-w-xl rounded-lg border px-3 py-2"
            >
              <option value="MANUAL_CONFIRMATION">{tAdmin.companyDetail.completionManual}</option>
              <option value="AUTO_BOOK">{tAdmin.companyDetail.completionAuto}</option>
            </select>
          </div>

          <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
            <strong>{tAdmin.companyDetail.flowPrefix}</strong> {tAdmin.companyDetail.flowText}
          </div>

          <button
            type="submit"
            className="rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
          >
            {tAdmin.companyDetail.saveBookkeeping}
          </button>
        </form>
      </section>

      <section className="mb-6 rounded-xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          {tAdmin.companyDetail.usersTitle}
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          {tAdmin.companyDetail.usersHelp}
        </p>

        <div className="mt-5 space-y-3">
          {company.users.length === 0 ? (
            <p className="text-slate-500">
              {tAdmin.companyDetail.noUsers}
            </p>
          ) : (
            company.users.map((access) => (
              <div
                key={access.id}
                className="flex flex-wrap items-center justify-between gap-4 rounded-lg border p-4"
              >
                <div>
                  <p className="font-semibold">
                    {access.user.name}
                  </p>

                  <p className="text-sm text-slate-500">
                    {access.user.email}
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    {tAdmin.companyDetail.systemRole}: {adminRoleLabel(access.user.role, language)}
                  </p>

                  <p className="mt-1 text-xs font-medium text-slate-600">
                    {access.emailNotificationsEnabled
                      ? tAccess.enabled
                      : tAccess.disabled}
                  </p>
                </div>

<form
  action={updateUserEmailAndResendAccess}
  className="mt-3 flex flex-wrap items-end gap-2"
>
  <input
    type="hidden"
    name="userId"
    value={access.userId}
  />

  <label className="block">
    <span className="mb-1 block text-xs font-medium text-slate-600">
      {tAdmin.companyDetail.email}
    </span>

    <input
      type="email"
      name="email"
      defaultValue={access.user.email}
      required
      className="min-w-[280px] rounded-lg border px-3 py-2 text-sm"
    />
  </label>

  <button
    type="submit"
    className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
  >
    {tAdmin.companyDetail.correctEmail}
  </button>
</form>
                <div className="flex flex-wrap items-center gap-3">
                  <form
                    action={async (formData: FormData) => {
                      "use server";

                      await setUserCompanyRole(
                        access.userId,
                        company.id,
                        String(
                          formData.get("accessRole") ||
                            "VIEWER"
                        ),
                        formData.get("emailNotificationsEnabled") === "on"
                      );
                    }}
                    className="flex items-center gap-2"
                  >
                    <select
                      name="accessRole"
                      defaultValue={access.accessRole}
                      className="rounded-lg border px-3 py-2"
                    >
                      <option value="OWNER">{tAdmin.companyDetail.accessRoles.OWNER}</option>

                      <option value="MANAGER">{tAdmin.companyDetail.accessRoles.MANAGER}</option>

                      <option value="BOOKKEEPER">{tAdmin.companyDetail.accessRoles.BOOKKEEPER}</option>

                      <option value="VIEWER">{tAdmin.companyDetail.accessRoles.VIEWER}</option>
                    </select>

                    <label className="flex items-center gap-2 text-sm text-slate-700">
                      <input
                        type="checkbox"
                        name="emailNotificationsEnabled"
                        defaultChecked={access.emailNotificationsEnabled}
                        className="h-4 w-4 rounded border-slate-300"
                      />
                      <span>{tAccess.emailNotifications}</span>
                    </label>

                    <button
                      type="submit"
                      className="rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white"
                    >
                      {tAccess.saveAccess}
                    </button>
                  </form>

                  <form
                    action={async () => {
                      "use server";

                      await removeUserCompany(
                        access.userId,
                        company.id
                      );
                    }}
                  >
                    <button
                      type="submit"
                      className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-700"
                    >
                      {tAdmin.companyDetail.disconnect}
                    </button>
                  </form>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      <section className="rounded-xl border bg-white p-6">
        <h2 className="text-xl font-bold">
          {tAdmin.companyDetail.connectTitle}
        </h2>

        <p className="mt-1 text-sm text-slate-600">
          {tAdmin.companyDetail.connectHelp}
        </p>

        <form
          method="GET"
          className="mt-4 flex max-w-xl gap-2"
        >
          <input
            type="text"
            name="userSearch"
            defaultValue={userSearch}
            placeholder={tAdmin.companyDetail.userSearchPlaceholder}
            className="w-full rounded-lg border px-3 py-2"
          />

          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-4 py-2 font-medium text-white"
          >
            {tAdmin.companyDetail.search}
          </button>
        </form>

        {userSearch.length >= 2 && (
          <div className="mt-4 max-w-xl space-y-2">
            {userSearchResults.length === 0 ? (
              <p className="text-sm text-slate-500">
                {tAdmin.companyDetail.noUnlinkedUsers}
              </p>
            ) : (
              userSearchResults.map((user) => (
                <form
                  key={user.id}
                  action={async (formData: FormData) => {
                    "use server";

                    await addUserCompany(
                      user.id,
                      company.id,
                      String(formData.get("accessRole") || "MANAGER"),
                      formData.get("emailNotificationsEnabled") === "on"
                    );
                  }}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                >
                  <div>
                    <p className="font-medium">
                      {user.name}
                    </p>

                    <p className="text-sm text-slate-500">
                      {user.email}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span className="text-xs font-medium text-slate-600">
                        {tAccess.chooseAccessRole}
                      </span>
                      <select
                        name="accessRole"
                        defaultValue="MANAGER"
                        className="rounded-lg border px-3 py-2 text-sm"
                      >
                        <option value="OWNER">{tAdmin.companyDetail.accessRoles.OWNER}</option>
                        <option value="MANAGER">{tAdmin.companyDetail.accessRoles.MANAGER}</option>
                        <option value="BOOKKEEPER">{tAdmin.companyDetail.accessRoles.BOOKKEEPER}</option>
                        <option value="VIEWER">{tAdmin.companyDetail.accessRoles.VIEWER}</option>
                      </select>
                    </label>

                    <label className="flex flex-col gap-1 text-sm text-slate-700">
                      <span className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          name="emailNotificationsEnabled"
                          className="h-4 w-4 rounded border-slate-300"
                        />
                        <span>{tAccess.connectWithNotifications}</span>
                      </span>
                      <span className="max-w-xs text-xs text-slate-500">
                        {tAccess.emailNotificationsHelp}
                      </span>
                    </label>

                    <button
                      type="submit"
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white"
                    >
                      {tAdmin.companyDetail.connect}
                    </button>
                  </div>
                </form>
              ))
            )}
          </div>
        )}
      </section>
    </main>
  );
}