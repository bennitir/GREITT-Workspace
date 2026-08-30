import Link from "next/link";

import { prisma } from "@/lib/prisma";
import { requireCompanyModule } from "@/lib/core/require-company-module";
import { getCompanyAccess } from "@/lib/core/access-control";

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

export default async function MobileVerkPage() {
  const companyId = await requireCompanyModule("verk");
  const access = await getCompanyAccess(companyId);

  const workOrders = await prisma.workOrder.findMany({
    where: {
      companyId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const inProgressCount = workOrders.filter(
    (work) => work.status === "IN_PROGRESS",
  ).length;

  return (
    <main className="min-h-screen bg-slate-100">
      <div className="mx-auto min-h-screen max-w-md bg-white px-4 pb-24 pt-5">
        <header>
          <Link
            href="/mobile"
            className="inline-flex min-h-11 items-center rounded-xl border border-slate-200 bg-white px-4 text-base font-semibold text-slate-700 shadow-sm"
          >
            ← Til baka
          </Link>

          <div className="mt-5 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-bold tracking-wide text-slate-600">
                GLÖGGT MOBILE
              </p>

              <h1 className="mt-1 text-3xl font-bold text-slate-950">
                Verk
              </h1>
            </div>

            {access.canWrite && (
              <Link
                href="/verk/nytt"
                className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white shadow-sm"
              >
                + Nýtt
              </Link>
            )}
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-sm text-slate-600">
                Öll verk
              </p>

              <p className="mt-1 text-3xl font-bold text-slate-950">
                {workOrders.length}
              </p>
            </div>

            <div className="rounded-2xl bg-slate-100 p-4">
              <p className="text-sm text-slate-600">
                Í vinnu
              </p>

              <p className="mt-1 text-3xl font-bold text-slate-950">
                {inProgressCount}
              </p>
            </div>
          </div>
        </header>

        <section className="mt-6">
          {workOrders.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 p-6 text-center">
              <p className="text-lg font-bold text-slate-900">
                Engin verk skráð
              </p>

              <p className="mt-2 text-slate-600">
                Engin verk eru skráð hjá fyrirtækinu.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {workOrders.map((work) => (
                <Link
                  key={work.id}
                  href={`/verk/${work.id}`}
                  className="block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm active:bg-slate-50"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h2 className="text-lg font-bold text-slate-950">
                      {work.title}
                    </h2>

                    <span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold text-slate-700">
                      {statusText(work.status)}
                    </span>
                  </div>

                  {work.address && (
                    <p className="mt-2 text-base text-slate-700">
                      {work.address}
                    </p>
                  )}

                  <div className="mt-3 flex items-center justify-between text-sm text-slate-500">
                    <span>
                      Forgangur: {priorityText(work.priority)}
                    </span>

                    <span className="font-semibold text-blue-700">
                      Opna →
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}