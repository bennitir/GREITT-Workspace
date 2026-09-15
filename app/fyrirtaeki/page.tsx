import { getEffectiveUser } from "@/lib/core/access-control";
import { redirect } from "next/navigation";
import {
  clearActiveCompany,
  setActiveCompany,
} from "@/app/actions/companyActions";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { companiesText } from "@/lib/i18n/companies";

import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";

export default async function FyrirtaekiPage() {
  const activeUser = await getEffectiveUser();

  if (!activeUser) {
    redirect("/innskraning");
  }

  const userSettings = await prisma.userSettings.findUnique({
    where: { userId: activeUser.id },
    select: { interfaceLanguage: true },
  });
  const t = companiesText(userSettings?.interfaceLanguage ?? "is");

  const companies = await prisma.company.findMany({
    where: {
      isActive: true,
      ...(activeUser.role !== "ADMIN"
        ? {
            users: {
              some: {
                userId: activeUser.id,
                isActive: true,
              },
            },
          }
        : {}),
    },
    orderBy: { name: "asc" },
  });

  return (
    <main className="p-8">
      <PageHeader title={t.title} description={t.description}>
        <div className="flex flex-wrap gap-2">
          <form action={clearActiveCompany} title={t.neutralWorkspaceHelp}>
            <Button type="submit">{t.neutralWorkspace}</Button>
          </form>

          {activeUser.role === "ADMIN" && (
            <>
              <Link href="/fyrirtaeki/lokud">
                <Button>{t.closedCompanies}</Button>
              </Link>
              <Link href="/fyrirtaeki/nytt">
                <Button>{t.newCompany}</Button>
              </Link>
            </>
          )}
        </div>
      </PageHeader>

      <div className="space-y-4">
        {companies.map((company) => (
          <Card key={company.id}>
            <h2 className="text-xl font-semibold">{company.name}</h2>
            <p className="text-slate-600">{company.kennitala}</p>
            <div className="mt-4">
              <form action={setActiveCompany.bind(null, company.id)}>
                <Button type="submit">{t.openCompany}</Button>
              </form>
            </div>
          </Card>
        ))}

        {companies.length === 0 && (
          <EmptyState title={t.emptyTitle} description={t.emptyDescription} />
        )}
      </div>
    </main>
  );
}
