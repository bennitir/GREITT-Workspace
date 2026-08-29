import { getEffectiveUser } from "@/lib/core/access-control";
import { formatNumber } from "@/lib/locale";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export default async function InnsynPage() {
  const cookieStore = await cookies();

const activeUser = await getEffectiveUser();

if (!activeUser) {
  redirect("/innskraning");
}
  const activeCompanyId =
    cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    return (
      <div className="p-8">
        <h1 className="text-3xl font-bold">Innsýn</h1>
        <p className="mt-4 text-lg">
          Ekkert fyrirtæki er virkt.
        </p>
      </div>
    );
  }

  const companyId = Number(activeCompanyId);
if (activeUser.role !== "ADMIN") {
  const access = await prisma.userCompany.findUnique({
    where: {
      userId_companyId: {
        userId: activeUser.id,
        companyId,
      },
    },
  });

  if (!access || !access.isActive) {
    redirect("/fyrirtaeki");
  }
}
  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
    select: {
      name: true,
    },
  });

  const accounts = await prisma.account.findMany({
    where: {
      companyId,
      isActive: true,
    },
    select: {
      number: true,
      entryRole: true,
      type: true,
    },
  });

  const receipts = await prisma.receipt.findMany({
    where: {
      companyId,
    },
    select: {
      entries: {
        select: {
          account: true,
          debit: true,
          credit: true,
        },
      },
    },
  });

  const revenueAccounts = new Set(
    accounts
      .filter(
        (account) => account.entryRole === "REVENUE"
      )
      .map((account) => account.number)
  );

  const expenseAccounts = new Set(
    accounts
      .filter(
        (account) => account.entryRole === "EXPENSE"
      )
      .map((account) => account.number)
  );

  const vatOutputAccounts = new Set(
    accounts
      .filter(
        (account) => account.type === "VAT_OUTPUT"
      )
      .map((account) => account.number)
  );

  const vatInputAccounts = new Set(
    accounts
      .filter(
        (account) => account.type === "VAT_INPUT"
      )
      .map((account) => account.number)
  );

  let revenue = 0;
  let expenses = 0;
  let outputVat = 0;
  let inputVat = 0;

  for (const receipt of receipts) {
    for (const entry of receipt.entries) {
      if (revenueAccounts.has(entry.account)) {
        revenue += entry.credit - entry.debit;
      }

      if (expenseAccounts.has(entry.account)) {
        expenses += entry.debit - entry.credit;
      }

      if (vatOutputAccounts.has(entry.account)) {
        outputVat += entry.credit - entry.debit;
      }

      if (vatInputAccounts.has(entry.account)) {
        inputVat += entry.debit - entry.credit;
      }
    }
  }

  const result = revenue - expenses;
  const vatBalance = outputVat - inputVat;

  const formatKr = (amount: number) =>
  formatNumber(amount, {
    maximumFractionDigits: 0,
  });

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">
        Innsýn
      </h1>

      <p className="mt-2 text-lg text-slate-600">
        Rekstraryfirlit – {company?.name ?? "fyrirtæki"}
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        <div className="rounded-xl border bg-white p-6">
          <p className="text-lg text-slate-600">
            💰 Tekjur
          </p>

          <p className="mt-2 text-3xl font-bold">
            {formatKr(revenue)} kr.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <p className="text-lg text-slate-600">
            🍽️ Gjöld
          </p>

          <p className="mt-2 text-3xl font-bold">
            {formatKr(expenses)} kr.
          </p>
        </div>

        <div className="rounded-xl border bg-white p-6">
          <p className="text-lg text-slate-600">
            📊 Rekstrarniðurstaða
          </p>

          <p className="mt-2 text-3xl font-bold">
            {formatKr(result)} kr.
          </p>
        </div>
      </div>

      <div className="mt-6">
        <details className="rounded-xl border bg-white">
          <summary className="cursor-pointer p-6 text-xl font-semibold">
            VSK – opna yfirlit
          </summary>

          <div className="border-t p-6">
            <div className="grid gap-6 md:grid-cols-3">
              <div>
                <p className="text-lg text-slate-600">
                  Útskattur
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatKr(outputVat)} kr.
                </p>
              </div>

              <div>
                <p className="text-lg text-slate-600">
                  Innskattur
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatKr(inputVat)} kr.
                </p>
              </div>

              <div>
                <p className="text-lg text-slate-600">
                  Staða VSK
                </p>
                <p className="mt-1 text-2xl font-bold">
                  {formatKr(vatBalance)} kr.
                </p>
              </div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}