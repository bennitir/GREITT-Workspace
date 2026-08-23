import { redirect } from "next/navigation";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import ReceiptCreateForm from "@/components/ReceiptCreateForm";

export default async function NewReceiptPage() {
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

const activeCompany = await prisma.company.findUnique({
  where: {
    id: companyId,
  },
  select: {
    name: true,
  },
});
    return (
    <main className="p-8">
      <h1 className="mb-6 text-3xl font-bold">
  Nýtt fylgiskjal
  {activeCompany ? ` — ${activeCompany.name}` : ""}
</h1>

      <ReceiptCreateForm />
    </main>
  );
}