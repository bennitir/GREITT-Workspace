import { getEffectiveUser } from "@/lib/core/access-control";
import { redirect } from "next/navigation";
import { setActiveCompany } from "@/app/actions/companyActions";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import EmptyState from "@/components/ui/EmptyState";


export default async function FyrirtaekiPage() {
    const activeUser = await getEffectiveUser();

if (!activeUser) {
  redirect("/innskraning");
}
  const companies = await prisma.company.findMany({
  where: {
    isActive: true,
    ...(activeUser && activeUser.role !== "ADMIN"
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
  orderBy: {
    name: "asc",
  },
});

  return (
    <main className="p-8">
      <PageHeader
        title="Fyrirtæki"
        description="Yfirlit yfir öll fyrirtæki."
      >
        {activeUser?.role === "ADMIN" && (
  <div className="flex gap-2">
  <Link href="/fyrirtaeki/lokud">
    <Button>
      Lokuð fyrirtæki
    </Button>
  </Link>

  <Link href="/fyrirtaeki/nytt">
    <Button>
      ➕ Nýtt fyrirtæki
    </Button>
  </Link>
</div>
)}
      </PageHeader>

      <div className="space-y-4">
        {companies.map((company) => (
          <Card key={company.id}>
            <h2 className="text-xl font-semibold">
              {company.name}
            </h2>

            <p className="text-slate-600">
              {company.kennitala}
            </p>

            <div className="mt-4">
             
  <form action={setActiveCompany.bind(null, company.id)}>
  <Button type="submit">
    Opna fyrirtæki
  </Button>
</form>
            </div>
          </Card>
        ))}

        {companies.length === 0 && (
          <EmptyState
            title="Engin fyrirtæki skráð"
            description="Stofnaðu fyrsta fyrirtækið til að byrja."
          />
        )}
      </div>
    </main>
  );
}