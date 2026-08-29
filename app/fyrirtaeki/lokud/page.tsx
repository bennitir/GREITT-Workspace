import { formatDate } from "@/lib/locale";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ReactivateCompanyButton from "@/components/ReactivateCompanyButton";

export default async function ClosedCompaniesPage() {
  const companies = await prisma.company.findMany({
    where: {
      isActive: false,
    },
    orderBy: {
      closedAt: "desc",
    },
  });

  return (
    <main className="p-8">
      <PageHeader
        title="Lokuð fyrirtæki"
        description="Fyrirtæki sem eru varðveitt í lesham."
      >
        <Link href="/fyrirtaeki">
          <Button>← Virk fyrirtæki</Button>
        </Link>
      </PageHeader>

      <div className="space-y-4">
        {companies.length === 0 ? (
          <p className="text-slate-600">
            Engin lokuð fyrirtæki fundust.
          </p>
        ) : (
          companies.map((company) => (
            <Card key={company.id}>
              <h2 className="text-xl font-semibold">
                {company.name}
              </h2>

              <p className="text-slate-600">
                {company.kennitala}
              </p>

              <p className="mt-2 text-sm text-slate-500">
                Lokað:{" "}
                {company.closedAt
  ? formatDate(company.closedAt)
  : "Dagsetning óþekkt"}
              </p>

              <div className="mt-4 flex gap-2">
                <Link href={`/fyrirtaeki/${company.id}`}>
                  <Button>Opna í lesham</Button>
                </Link>

                <ReactivateCompanyButton id={company.id} />
              </div>
            </Card>
          ))
        )}
      </div>
    </main>
  );
}