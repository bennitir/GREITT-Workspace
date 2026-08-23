import { revalidatePath } from "next/cache";
import { setCompanyModuleEnabled } from "@/lib/core/company-module-repository";
import { GLOGGT_MODULE_LIST } from "@/lib/core/modules";
import { prisma } from "@/lib/prisma";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

export default async function CompanyModulesPage({
  params,
}: PageProps) {
  const { id } = await params;
  const companyId = Number(id);

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
  });

  if (!company) {
    
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">
          Fyrirtæki fannst ekki
        </h1>
      </main>
    );
  }
async function enableModule(formData: FormData) {
  "use server";

  const moduleId = String(formData.get("moduleId"));

  if (!moduleId) {
    return;
  }

  await setCompanyModuleEnabled(
    companyId,
    moduleId as Parameters<typeof setCompanyModuleEnabled>[1],
    true,
  );

  revalidatePath(`/fyrirtaeki/${companyId}/einingar`);
}

async function disableModule(formData: FormData) {
  "use server";

  const moduleId = String(formData.get("moduleId"));

  if (!moduleId) {
    return;
  }

  await setCompanyModuleEnabled(
    companyId,
    moduleId as Parameters<typeof setCompanyModuleEnabled>[1],
    false,
  );

  revalidatePath(`/fyrirtaeki/${companyId}/einingar`);
}
  const moduleSettings =
    await getCompanyModuleSettings(companyId);

  const enabledModules =
    getEnabledCompanyModules(moduleSettings);

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">
        Einingar – {company.name}
      </h1>

      <p className="mt-2 text-slate-600">
        Hér verður hægt að stjórna hvaða GLÖGGT einingar fyrirtækið notar.
      </p>

      <div className="mt-6 space-y-3">
  {GLOGGT_MODULE_LIST.map((module) => {
    const isEnabled = enabledModules.some(
      (enabledModule) => enabledModule.id === module.id,
    );

    return (
      <div
        key={module.id}
        className="rounded-xl border bg-white p-5"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold">
              {module.name}
            </p>

            <p className="mt-1 text-sm text-slate-600">
              {module.description}
            </p>
          </div>

          {isEnabled ? (
  <form action={disableModule}>
    <input
      type="hidden"
      name="moduleId"
      value={module.id}
    />

    <button
      type="submit"
      className="rounded-lg border px-3 py-2 text-sm font-semibold"
    >
      Slökkva
    </button>
  </form>
) : (
  <form action={enableModule}>
    <input
      type="hidden"
      name="moduleId"
      value={module.id}
    />

    <button
      type="submit"
      className="rounded-lg border px-3 py-2 text-sm font-semibold"
    >
      Virkja
    </button>
  </form>
)}
        </div>
      </div>
    );
  })}
</div>
    </main>
  );
}