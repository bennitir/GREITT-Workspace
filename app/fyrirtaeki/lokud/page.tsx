import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ReactivateCompanyButton from "@/components/ReactivateCompanyButton";
import { adminLocale, adminText } from "@/lib/i18n/admin";
import { getCurrentInterfaceLanguage } from "@/lib/i18n/current-language";

export default async function ClosedCompaniesPage() {
  const language = await getCurrentInterfaceLanguage();
  const t = adminText(language);
  const locale = adminLocale(language);

  const companies = await prisma.company.findMany({
    where: { isActive: false },
    orderBy: { closedAt: "desc" },
  });

  return (
    <main className="p-8">
      <PageHeader title={t.closedCompanies.title} description={t.closedCompanies.subtitle}>
        <Link href="/fyrirtaeki">
          <Button>{t.closedCompanies.activeCompanies}</Button>
        </Link>
      </PageHeader>

      <div className="space-y-4">
        {companies.length === 0 ? (
          <p className="text-slate-600">{t.closedCompanies.none}</p>
        ) : (
          companies.map((company) => (
            <Card key={company.id}>
              <h2 className="text-xl font-semibold">{company.name}</h2>
              <p className="text-slate-600">{company.kennitala}</p>
              <p className="mt-2 text-sm text-slate-500">
                {t.closedCompanies.closedAt}: {company.closedAt ? new Intl.DateTimeFormat(locale).format(company.closedAt) : t.closedCompanies.unknownDate}
              </p>

              <div className="mt-4 flex gap-2">
                <Link href={`/fyrirtaeki/${company.id}`}>
                  <Button>{t.closedCompanies.openReadOnly}</Button>
                </Link>
                <ReactivateCompanyButton id={company.id} language={language} />
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}
