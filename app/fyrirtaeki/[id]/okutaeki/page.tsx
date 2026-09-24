import Link from "next/link";
import { redirect } from "next/navigation";

import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { VEHICLE_VAT_ELIGIBILITY_STATUSES } from "@/lib/core/vehicle-vat";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";
import { companyVehicleText } from "@/lib/i18n/company-vehicles";
import { formatDate } from "@/lib/locale";
import { prisma } from "@/lib/prisma";

import {
  createCompanyVehicle,
  updateVehicleVatEligibility,
} from "./actions";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string }>;
};

function toDateInputValue(value: Date | null) {
  if (!value) return "";
  return value.toISOString().slice(0, 10);
}

export default async function CompanyVehiclesPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { saved } = await searchParams;
  const companyId = Number(id);

  if (!Number.isInteger(companyId)) redirect("/fyrirtaeki");

  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");

  const access = await getCompanyAccess(companyId);
  if (!access.allowed) redirect("/fyrirtaeki");

  const language = await getCurrentInterfaceLanguage();
  const t = companyVehicleText(language);

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: {
      id: true,
      name: true,
      isActive: true,
      workResources: {
        where: { kind: "VEHICLE", isActive: true },
        orderBy: [{ code: "asc" }, { id: "asc" }],
        select: {
          id: true,
          code: true,
          name: true,
          vatEligibilityStatus: true,
          vatEligibilityValidFrom: true,
          vatEligibilityConfirmedAt: true,
          vatEligibilityConfirmedBy: {
            select: { name: true },
          },
        },
      },
    },
  });

  if (!company) redirect("/fyrirtaeki");

  const canManage = company.isActive && access.canManageCompanySettings;

  return (
    <main className="p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href={`/fyrirtaeki/${company.id}`}
          className="text-sm font-medium text-blue-700 hover:underline"
        >
          ← {t.back}
        </Link>

        <h1 className="mt-4 text-3xl font-bold">{t.title} · {company.name}</h1>
        <p className="mt-2 max-w-3xl text-sm text-slate-600">{t.intro}</p>

        {saved === "created" && (
          <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
            {t.savedCreated}
          </div>
        )}
        {saved === "vat" && (
          <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
            {t.savedVat}
          </div>
        )}

        {!company.isActive && (
          <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-amber-900">
            {t.inactive}
          </div>
        )}
        {company.isActive && !access.canManageCompanySettings && (
          <div className="mt-4 rounded border border-slate-300 bg-slate-50 p-3 text-slate-700">
            {t.readOnly}
          </div>
        )}

        {canManage && (
          <section className="mt-8 rounded-lg border bg-white p-5 shadow-sm">
            <h2 className="text-xl font-semibold">{t.newVehicle}</h2>
            <form action={createCompanyVehicle} className="mt-4 grid gap-4 md:grid-cols-2">
              <input type="hidden" name="companyId" value={company.id} />
              <label className="block text-sm font-medium text-slate-700">
                {t.registration}
                <input
                  name="registration"
                  required
                  maxLength={60}
                  placeholder={t.registrationPlaceholder}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
              <label className="block text-sm font-medium text-slate-700">
                {t.name}
                <input
                  name="name"
                  required
                  maxLength={160}
                  placeholder={t.namePlaceholder}
                  className="mt-1 w-full rounded border px-3 py-2"
                />
              </label>
              <div className="md:col-span-2">
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                >
                  {t.create}
                </button>
              </div>
            </form>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-xl font-semibold">
            {t.vehicleCount}: {company.workResources.length}
          </h2>

          {company.workResources.length === 0 ? (
            <div className="mt-3 rounded-lg border bg-white p-5 text-slate-600 shadow-sm">
              {t.noVehicles}
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              {company.workResources.map((vehicle) => {
                const status = vehicle.vatEligibilityStatus as keyof typeof t.status;
                return (
                  <div key={vehicle.id} className="rounded-lg border bg-white p-5 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="text-lg font-semibold">{vehicle.code}</div>
                        <div className="text-sm text-slate-600">{vehicle.name}</div>
                      </div>
                      <span className="rounded-full border bg-slate-50 px-3 py-1 text-sm font-medium text-slate-700">
                        {t.status[status] ?? vehicle.vatEligibilityStatus}
                      </span>
                    </div>

                    <div className="mt-4 grid gap-2 text-sm text-slate-700 md:grid-cols-3">
                      <div>
                        <strong>{t.validFrom}:</strong>{" "}
                        {vehicle.vatEligibilityValidFrom
                          ? formatDate(vehicle.vatEligibilityValidFrom)
                          : "—"}
                      </div>
                      <div>
                        <strong>{t.confirmedBy}:</strong>{" "}
                        {vehicle.vatEligibilityConfirmedBy?.name ?? "—"}
                      </div>
                      <div>
                        <strong>{t.confirmedAt}:</strong>{" "}
                        {vehicle.vatEligibilityConfirmedAt
                          ? formatDate(vehicle.vatEligibilityConfirmedAt)
                          : "—"}
                      </div>
                    </div>

                    {canManage && (
                      <form action={updateVehicleVatEligibility} className="mt-5 grid gap-4 md:grid-cols-[1fr_220px_auto] md:items-end">
                        <input type="hidden" name="companyId" value={company.id} />
                        <input type="hidden" name="resourceId" value={vehicle.id} />

                        <label className="block text-sm font-medium text-slate-700">
                          {t.vatStatus}
                          <select
                            name="vatEligibilityStatus"
                            defaultValue={vehicle.vatEligibilityStatus}
                            className="mt-1 w-full rounded border px-3 py-2"
                          >
                            {VEHICLE_VAT_ELIGIBILITY_STATUSES.map((value) => (
                              <option key={value} value={value}>
                                {t.status[value]}
                              </option>
                            ))}
                          </select>
                        </label>

                        <label className="block text-sm font-medium text-slate-700">
                          {t.validFrom}
                          <input
                            type="date"
                            name="vatEligibilityValidFrom"
                            defaultValue={toDateInputValue(vehicle.vatEligibilityValidFrom)}
                            className="mt-1 w-full rounded border px-3 py-2"
                          />
                        </label>

                        <button
                          type="submit"
                          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-700"
                        >
                          {t.saveVatStatus}
                        </button>

                        <p className="text-xs text-slate-500 md:col-span-3">{t.validFromHelp}</p>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
