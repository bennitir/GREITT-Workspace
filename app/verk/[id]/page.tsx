import { formatDate } from "@/lib/locale";
import EditWorkLogForm from "@/components/work/EditWorkLogForm";
import WorkLogForm from "@/components/work/WorkLogForm";
import { notFound, redirect } from "next/navigation";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import WorkLogEditToggle from "@/components/work/WorkLogEditToggle";

type Props = {
  params: Promise<{
    id: string;
  }>;
};

async function updateWorkStatus(formData: FormData) {
  "use server";

  const workOrderId = Number(formData.get("workOrderId"));
  const newStatus = String(formData.get("status") ?? "");

  if (!Number.isInteger(workOrderId)) {
    throw new Error("Ógilt verknúmer.");
  }

  if (!["NEW", "IN_PROGRESS", "COMPLETED"].includes(newStatus)) {
    throw new Error("Ógild verkstaða.");
  }

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    redirect("/fyrirtaeki");
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId)) {
    redirect("/fyrirtaeki");
  }

  const work = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      companyId,
    },
  });


  if (!work) {
    notFound();
  }

  const data: {
    status: string;
    startedAt?: Date | null;
    completedAt?: Date | null;
  } = {
    status: newStatus,
  };

  if (newStatus === "NEW") {
    data.startedAt = null;
    data.completedAt = null;
  }

  if (newStatus === "IN_PROGRESS") {
    data.startedAt = work.startedAt ?? new Date();
    data.completedAt = null;
  }

  if (newStatus === "COMPLETED") {
    data.startedAt = work.startedAt ?? new Date();
    data.completedAt = new Date();
  }

  await prisma.workOrder.update({
    where: {
      id: work.id,
    },
    data,
  });

  revalidatePath("/verk");
  revalidatePath(`/verk/${work.id}`);

  redirect(`/verk/${work.id}`);
}

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

export default async function VerkDetailPage({ params }: Props) {
  const { id } = await params;

  const workOrderId = Number(id);

  if (!Number.isInteger(workOrderId)) {
    notFound();
  }

  const cookieStore = await cookies();
  const activeCompanyId = cookieStore.get("activeCompanyId")?.value;

  if (!activeCompanyId) {
    notFound();
  }

  const companyId = Number(activeCompanyId);

  if (!Number.isInteger(companyId)) {
    notFound();
  }

    const work = await prisma.workOrder.findFirst({
    where: {
      id: workOrderId,
      companyId,
    },
    include: {
      createdBy: true,
      workLogs: {
        include: {
          user: true,
        },
        orderBy: {
          workDate: "desc",
        },
      },
    },

      });

        const companyUsers = await prisma.userCompany.findMany({
    where: {
      companyId,
      isActive: true,
    },
    include: {
      user: true,
    },
    orderBy: {
      user: {
        name: "asc",
      },
    },
  });

  if (!work) {
    notFound();
  }

  return (
    <main className="space-y-6 p-8">
      <PageHeader
        title={work.title}
        description="Upplýsingar um verk."
      />

      <Card>
        <div className="space-y-5">
          <div>
            <p className="text-sm text-slate-500">Staða</p>
            <p className="mt-1 text-lg font-semibold">
              {statusText(work.status)}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Forgangur</p>
            <p className="mt-1 font-semibold">
              {priorityText(work.priority)}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Heimilisfang</p>
            <p className="mt-1 font-semibold">
              {work.address || "Ekki skráð"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Lýsing</p>
            <p className="mt-1 whitespace-pre-wrap">
              {work.description || "Engin lýsing skráð"}
            </p>
          </div>

          <div>
            <p className="text-sm text-slate-500">Stofnað</p>
            <p className="mt-1">
              {formatDate(work.createdAt)}
            </p>
          </div>

          {work.startedAt && (
            <div>
              <p className="text-sm text-slate-500">
                Verk hafið
              </p>
              <p className="mt-1">
                {formatDate(work.startedAt)}
              </p>
            </div>
          )}

          {work.completedAt && (
            <div>
              <p className="text-sm text-slate-500">
                Verki lokið
              </p>
              <p className="mt-1">
                {formatDate(work.completedAt)}
              </p>
            </div>
          )}

          {work.createdBy && (
            <div>
              <p className="text-sm text-slate-500">Stofnað af</p>
              <p className="mt-1 font-semibold">
                {work.createdBy.name}
              </p>
            </div>
          )}
        </div>
      </Card>

            <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Verkstaða
          </h2>

          <div className="flex flex-wrap gap-3">
            <form action={updateWorkStatus}>
              <input
                type="hidden"
                name="workOrderId"
                value={work.id}
              />
              <input
                type="hidden"
                name="status"
                value="NEW"
              />

              <Button
                type="submit"
                disabled={work.status === "NEW"}
              >
                Nýtt
              </Button>
            </form>

            <form action={updateWorkStatus}>
              <input
                type="hidden"
                name="workOrderId"
                value={work.id}
              />
              <input
                type="hidden"
                name="status"
                value="IN_PROGRESS"
              />

              <Button
                type="submit"
                disabled={work.status === "IN_PROGRESS"}
              >
                Í vinnu
              </Button>
            </form>

            <form action={updateWorkStatus}>
              <input
                type="hidden"
                name="workOrderId"
                value={work.id}
              />
              <input
                type="hidden"
                name="status"
                value="COMPLETED"
              />

              <Button
                type="submit"
                disabled={work.status === "COMPLETED"}
              >
                Lokið
              </Button>
            </form>
          </div>
        </div>
      </Card>

      <Card>
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">
            Verkstundir
          </h2>

          <div className="rounded-lg border bg-slate-50 p-4">
  <WorkLogForm
    workOrderId={work.id}
    companyUsers={companyUsers}
  />
</div>

          {work.workLogs.length === 0 ? (
            <p className="text-slate-600">
              Engar verkstundir skráðar enn.
            </p>
          ) : (
            <div className="space-y-3">
              {work.workLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-lg border p-4"
                >
                  <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>

                      <p className="font-semibold">
                        {log.user?.name || "Óskráður starfsmaður"}
                      </p>

                      <p className="text-sm text-slate-500">
                        {formatDate(log.workDate)}
                      </p>
                    </div>

                    <WorkLogEditToggle
  workLog={log}
  companyUsers={companyUsers}
/>

                    <div className="text-sm">
                      {log.durationMinutes != null
                        ? `${Math.floor(log.durationMinutes / 60)} klst. ${
                            log.durationMinutes % 60
                          } mín.`
                        : "Tími ekki reiknaður"}
                    </div>
                  </div>

                  {log.description && (
                    <p className="mt-2 whitespace-pre-wrap text-slate-600">
                      {log.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </Card>
    </main>
  );
}
