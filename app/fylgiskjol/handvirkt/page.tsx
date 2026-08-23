import { redirect } from "next/navigation";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import ManualReceiptForm from "@/components/ManualReceiptForm";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
export default async function ManualReceiptPage() {
          const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
if (!activeCompanyId) {
  redirect("/fyrirtaeki");
}

const companyId = Number(activeCompanyId);

const moduleSettings = await getCompanyModuleSettings(companyId);

const enabledModuleIds = getEnabledCompanyModules(moduleSettings).map(
  (module) => module.id,
);

if (!enabledModuleIds.includes("bokhald")) {
  redirect("/");
}
  const accounts = activeCompanyId
    ? await prisma.account.findMany({
        where: {
          companyId: Number(activeCompanyId),
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
      })
    : [];
    return (
    <main className="mx-auto max-w-5xl p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          Handvirk skráning fylgiskjals
        </h1>

        <p className="mt-1 text-gray-600">
          Skráðu grunnupplýsingarnar. GREITT leiðir þig svo áfram í bókunina.
        </p>
      </div>

      <ManualReceiptForm accounts={accounts} />

      
    </main>
  );
}