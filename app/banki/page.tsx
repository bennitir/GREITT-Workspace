import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { bankAnalysisLanguage } from "@/app/banki/_lib/i18n/analysis-text";
import { annualAnalysisText } from "@/app/banki/_lib/i18n/annual-analysis-text";
import { annualStatementText } from "@/app/banki/_lib/i18n/annual-statement-text";
import { bankText } from "@/lib/i18n/bank";

export default async function BankiPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get("sessionToken")?.value;
  const session = token ? await prisma.session.findUnique({ where: { token }, select: { userId: true } }) : null;
  const userSettings = session ? await prisma.userSettings.findUnique({ where: { userId: session.userId }, select: { interfaceLanguage: true } }) : null;
  const language = bankAnalysisLanguage(userSettings?.interfaceLanguage);
  const t = bankText(language);

  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;
  if (!activeCompanyId) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">🏦 {t.title}</h1>
        <p className="mt-4 text-red-600">
          {t.noActiveCompany}
        </p>
      </main>
    );
  }

  const companyId = Number(activeCompanyId);
  const annualText = annualAnalysisText(language);
  const statementText = annualStatementText(language);

  const company = await prisma.company.findUnique({
    where: {
      id: companyId,
    },
  });

  if (!company) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">🏦 {t.title}</h1>
        <p className="mt-4 text-red-600">
          {t.activeCompanyNotFound}
        </p>
      </main>
    );
  }

  const bankAccounts = await prisma.bankAccount.findMany({
    where: {
      companyId,
      isActive: true,
    },
    orderBy: {
      id: "asc",
    },
  });

  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">🏦 {t.title}</h1>

      <div className="mt-6 rounded-lg border p-6">
        <p className="text-sm text-gray-500">
          {t.activeCompany}
        </p>

        <h2 className="mt-1 text-xl font-semibold">
          {company.name}
        </h2>

        <p className="mt-2 text-gray-600">
          {t.companyAccounts}
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/banki/tengja"
            className="inline-block rounded-lg bg-blue-600 px-4 py-2 font-medium text-white"
          >
            {t.addAccount}
          </Link>
          <Link
            href="/banki/arsgreining"
            className="inline-block rounded-lg border border-blue-600 px-4 py-2 font-medium text-blue-700"
          >
            {annualText.link}
          </Link>
          <Link
            href="/banki/arsreikningur"
            className="inline-block rounded-lg border border-slate-400 px-4 py-2 font-medium text-slate-700"
          >
            {statementText.link}
          </Link>
        </div>

        <div className="mt-6 space-y-4">
          {bankAccounts.length === 0 ? (
            <div className="rounded-lg border bg-gray-50 p-4">
              <p>{t.noAccounts}</p>
            </div>
          ) : (
            bankAccounts.map((account) => (
              <Link
  key={account.id}
  href={`/banki/${account.id}`}
  className="block rounded-lg border bg-gray-50 p-4 hover:bg-gray-100"
>
  <p className="text-lg font-semibold">
    {account.name}
  </p>

  <p className="mt-2">
    <strong>{account.bankName} · {t.accountNumber}:</strong>{" "}
    {account.accountNumber ?? t.notRegistered}
  </p>

  <p className="mt-1">
    <strong>{t.iban}:</strong>{" "}
    {account.iban ?? t.notRegistered}
  </p>
</Link>
            ))
          )}
        </div>
      </div>
    </main>
  );
}