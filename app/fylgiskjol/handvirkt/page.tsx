import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import ManualReceiptForm from "@/components/ManualReceiptForm";

export default async function ManualReceiptPage() {
  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId) || companyId <= 0) {
    redirect("/fyrirtaeki");
  }

  const moduleSettings = await getCompanyModuleSettings(companyId);

  const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
    (module) => module.id
  );

  if (!enabledModuleIds.includes("bokhald")) {
    redirect("/");
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      vatRegistered: true,
    },
  });

  if (!company) {
    redirect("/fyrirtaeki");
  }

  const accounts = await prisma.account.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: {
      number: "asc",
    },
    select: {
      id: true,
      number: true,
      name: true,
      vatRate: true,
      vatAccount: true,
      vatRequiresConfirmation: true,
      entryRole: true,
    },
  });

  return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Handvirk skráning fylgiskjals
        </h1>

        <p className="mt-1 text-gray-600">
          Skráðu grunnupplýsingarnar. GLÖGGT leiðir þig svo áfram í bókunina.
        </p>
      </div>

      <ManualReceiptForm
        accounts={accounts}
        vatRegistered={company.vatRegistered}
      />
    </main>
  );
}