import Greeting from "@/components/Greeting";
import { getEffectiveUser } from "@/lib/core/access-control";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import StatCard from "@/components/StatCard";
import { getCompanyModuleSettings } from "@/lib/core/company-module-repository";
import { getEnabledCompanyModules } from "@/lib/core/company-modules";

export default async function Home() {
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

  const effectiveUser = await getEffectiveUser();

const loggedInUserName = effectiveUser?.name ?? "notandi";
  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

    const activeCompanyAccess =
  session?.user.role === "ADMIN"
    ? true
    : activeCompanyId
      ? await prisma.userCompany.findUnique({
          where: {
            userId_companyId: {
              userId: session?.user.id ?? 0,
              companyId: Number(activeCompanyId),
            },
          },
        })
      : null;

  const company = activeCompanyId && activeCompanyAccess
    ? await prisma.company.findUnique({
        where: {
          id: Number(activeCompanyId),
        },
        include: {
          receipts: {
            include: {
              aiDetectedDocuments: true,
            },
          },
        },
      })
    : null;

    const moduleSettings = company
  ? await getCompanyModuleSettings(company.id)
  : {};

const enabledModules = getEnabledCompanyModules(moduleSettings);

  const uploadedDocuments =
  company?.receipts.reduce((total, receipt) => {
    return (
      total +
      (receipt.aiDetectedDocuments.length > 0
        ? receipt.aiDetectedDocuments.length
        : 1)
    );
  }, 0) ?? 0;

const pendingDocuments =
  company?.receipts.reduce((total, receipt) => {
    if (receipt.aiDetectedDocuments.length === 0) {
      return total + (receipt.status === "APPROVED" ? 0 : 1);
    }

    return (
      total +
      receipt.aiDetectedDocuments.filter(
        (document) => document.approvedAt === null
      ).length
    );
  }, 0) ?? 0;

  const approvedVouchers =
  company?.receipts.reduce((total, receipt) => {
    if (receipt.aiDetectedDocuments.length === 0) {
      return total + (receipt.voucherNumber !== null ? 1 : 0);
    }

    return (
      total +
      receipt.aiDetectedDocuments.filter(
        (document) =>
          document.approvedAt !== null &&
          document.voucherNumber !== null
      ).length
    );
  }, 0) ?? 0;

  

  const stats = [
    {
      title: "Innsend skjöl",
      value: String(uploadedDocuments),
    },
    {
      title: "Eftir að vinna",
      value: String(pendingDocuments),
    },
    {
      title: "Bókuð fylgiskjöl",
      value: String(approvedVouchers),
    },
  ];

  return (
    <main className="min-h-screen bg-slate-100">
      <section className="p-10">
        <div className="mx-auto max-w-6xl">
          <Greeting name={loggedInUserName} />

          <p className="mt-2 text-slate-600">
            Velkominn í GREITT Workspace.
          </p>

          <div className="mt-10 grid grid-cols-3 gap-6">
            {stats.map((stat) => (
              <StatCard
                key={stat.title}
                title={stat.title}
                value={stat.value}
              />
            ))}
          </div>

          {company && (
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <h3 className="text-xl font-bold text-slate-900">
                {company.name}
              </h3>

              <p className="mt-1 text-slate-500">
                {pendingDocuments} skjöl bíða vinnslu
              </p>

              <p className="mt-1 text-sm text-slate-400">
                Næsta fylgiskjalsnúmer:{" "}
                {company.nextVoucherNumber}
              </p>

              <p className="mt-3 text-sm text-slate-500">
  Virkar einingar:{" "}
  {enabledModules.map((module) => module.name).join(", ")}
</p>

            </div>
          )}

          {!company && (
            <div className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
              <p className="text-slate-600">
                Veldu fyrirtæki til að byrja.
              </p>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}