import Link from "next/link";
import { prisma } from "@/lib/prisma";
import Card from "@/components/ui/Card";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import { requireCompanyModule } from "@/lib/core/require-company-module";

function statusText(status: string) {
  switch (status) {
    case "NEW":
      return "Nýtt";
    case "IN_PROGRESS":
      return "Í vinnu";
    case "COMPLETED":
      return "Lokið";
    default:
      return status;
  }
}

function priorityText(priority: string) {
  switch (priority) {
    case "LOW":
      return "Lágur";
    case "NORMAL":
      return "Venjulegur";
    case "HIGH":
      return "Mikill";
    case "URGENT":
      return "Brýnt";
    default:
      return priority;
  }
}

export default async function VerkPage() {
  const companyId = await requireCompanyModule("verk");

  const workOrders = await prisma.workOrder.findMany({
    where: {
      companyId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const newCount = workOrders.filter(
    (work) => work.status === "NEW"
  ).length;

  const inProgressCount = workOrders.filter(
    (work) => work.status === "IN_PROGRESS"
  ).length;

  const completedCount = workOrders.filter(
    (work) => work.status === "COMPLETED"
  ).length;

  return (
    <main className="space-y-6 p-8">
      <PageHeader
        title="Verk"
        description="Yfirlit yfir verk, stöðu þeirra og verkasögu."
      >
        <Link href="/verk/nytt">
          <Button>＋ Nýtt verk</Button>
        </Link>
      </PageHeader>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <p className="text-sm text-slate-500">
            Öll verk
          </p>
          <p className="mt-2 text-3xl font-bold">
            {workOrders.length}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">
            Ný verk
          </p>
          <p className="mt-2 text-3xl font-bold">
            {newCount}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">
            Í vinnu
          </p>
          <p className="mt-2 text-3xl font-bold">
            {inProgressCount}
          </p>
        </Card>

        <Card>
          <p className="text-sm text-slate-500">
            Lokið
          </p>
          <p className="mt-2 text-3xl font-bold">
            {completedCount}
          </p>
        </Card>
      </div>

      <Card>
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">
              Verklisti
            </h2>

            <p className="mt-1 text-slate-600">
              Nýjustu verk efst.
            </p>
          </div>
        </div>

        {workOrders.length === 0 ? (
          <div className="mt-6 rounded-lg border border-dashed p-8 text-center">
            <p className="text-lg font-semibold">
              Engin verk skráð
            </p>

            <p className="mt-2 text-slate-600">
              Byrjaðu á að stofna fyrsta verkið.
            </p>

            <div className="mt-4">
              <Link href="/verk/nytt">
                <Button>＋ Stofna nýtt verk</Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="mt-6 space-y-3">
            {workOrders.map((work) => (
              <div
                key={work.id}
                className="rounded-lg border p-4"
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h3 className="text-lg font-semibold">
                      {work.title}
                    </h3>

                    {work.address && (
                      <p className="mt-1 text-slate-600">
                        {work.address}
                      </p>
                    )}

                    {work.description && (
                      <p className="mt-2 text-sm text-slate-500">
                        {work.description}
                      </p>
                    )}

                    <p className="mt-2 text-sm text-slate-500">
                      Forgangur:{" "}
                      <span className="font-medium text-slate-700">
                        {priorityText(work.priority)}
                      </span>
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="rounded-full border px-3 py-1 text-sm">
                      {statusText(work.status)}
                    </span>

                    <Link href={`/verk/${work.id}`}>
                      <Button>Opna verk</Button>
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </main>
  );
}