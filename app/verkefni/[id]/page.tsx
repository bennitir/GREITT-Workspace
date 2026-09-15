import Link from "next/link";
import { redirect } from "next/navigation";
import TaskDataRequestFields from "@/components/tasks/TaskDataRequestFields";
import TaskScheduleFields from "@/components/tasks/TaskScheduleFields";
import {
  markTaskDataSubmitted,
  reviewTaskData,
  updateCompanyTask,
} from "@/app/actions/taskActions";
import { getCompanyAccess, getEffectiveUser } from "@/lib/core/access-control";
import { tasksText } from "@/lib/i18n/tasks";
import { getTaskDataReminderCopy } from "@/lib/core/task-reminder-copy";
import { prisma } from "@/lib/prisma";

function dateValue(date: Date | null) {
  if (!date) return "";
  return `${String(date.getDate()).padStart(2, "0")}.${String(date.getMonth() + 1).padStart(2, "0")}.${date.getFullYear()}`;
}

export default async function TaskEditPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getEffectiveUser();
  if (!user) redirect("/innskraning");
  const { id } = await params;
  const taskId = Number(id);
  if (!Number.isInteger(taskId)) redirect("/verkefni");

  const task = await prisma.companyTask.findUnique({
    where: { id: taskId },
    include: {
      company: { select: { name: true } },
      clientSubmittedBy: { select: { name: true } },
      dataReviewedBy: { select: { name: true } },
    },
  });
  if (!task) redirect("/verkefni");

  const access = await getCompanyAccess(task.companyId);
  if (!access.allowed) redirect("/fyrirtaeki");
  const settings = await prisma.userSettings.findUnique({
    where: { userId: user.id },
    select: { interfaceLanguage: true },
  });
  const interfaceLanguage = settings?.interfaceLanguage ?? "is";
  const t = tasksText(interfaceLanguage);
  const mayEdit = user.role === "ADMIN" || access.canWrite;
  const mayReviewData =
    user.role === "ADMIN" ||
    access.canPrepareBookkeeping ||
    access.canReviewBookkeeping ||
    access.canManageCompanySettings;
  const hasDataRequest = task.dataRequestStatus !== "NONE";
  const reminderCopy = hasDataRequest ? getTaskDataReminderCopy(task, interfaceLanguage) : null;
  const fmt = new Intl.DateTimeFormat(settings?.interfaceLanguage === "en" ? "en-GB" : "is-IS");

  const dataStatus =
    task.dataRequestStatus === "REQUESTED"
      ? t.dataRequested
      : task.dataRequestStatus === "CLIENT_SUBMITTED"
        ? t.dataSubmitted
        : task.dataRequestStatus === "ACCEPTED"
          ? t.dataAccepted
          : task.dataRequestStatus === "NEEDS_MORE"
            ? t.dataNeedsMore
            : t.dataNotRequested;

  return (
    <main className="min-h-screen bg-slate-100 p-6 md:p-10">
      <div className="mx-auto max-w-4xl">
        <div className="flex justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold">{mayEdit ? t.editTask : task.title}</h1>
            <p className="mt-1 text-slate-600">{task.company.name}</p>
          </div>
          <Link href="/verkefni" className="font-semibold text-blue-700">← {t.backTasks}</Link>
        </div>

        {hasDataRequest && (
          <section className="mt-8 rounded-2xl border border-blue-200 bg-blue-50 p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-blue-700">{t.dataRequest}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-900">{dataStatus}</h2>
                {reminderCopy && (
                  <div className="mt-4 rounded-xl border border-blue-200 bg-white/80 p-4">
                    <p className="font-semibold text-slate-900">{reminderCopy.title}</p>
                    <p className="mt-1 text-sm text-slate-700">{reminderCopy.body}</p>
                  </div>
                )}
                {task.dataDueAt && <p className="mt-2 text-sm text-slate-700">{t.dataDue}: {fmt.format(task.dataDueAt)}</p>}
                {task.reminderStartAt && <p className="text-sm text-slate-600">{t.reminderStart}: {fmt.format(task.reminderStartAt)}</p>}
                {task.clientSubmittedAt && (
                  <p className="mt-2 text-sm text-slate-600">
                    {t.submittedAt}: {fmt.format(task.clientSubmittedAt)}{task.clientSubmittedBy ? ` · ${task.clientSubmittedBy.name}` : ""}
                  </p>
                )}
                {task.dataReviewedAt && (
                  <p className="text-sm text-slate-600">
                    {t.reviewedAt}: {fmt.format(task.dataReviewedAt)}{task.dataReviewedBy ? ` · ${task.dataReviewedBy.name}` : ""}
                  </p>
                )}
              </div>

              <div className="flex flex-wrap gap-2">
                {(task.dataRequestStatus === "REQUESTED" || task.dataRequestStatus === "NEEDS_MORE") && (
                  <form action={markTaskDataSubmitted.bind(null, task.id)}>
                    <button className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white">
                      {t.confirmDataSubmitted}
                    </button>
                  </form>
                )}
                {mayReviewData && task.dataRequestStatus === "CLIENT_SUBMITTED" && (
                  <>
                    <form action={reviewTaskData.bind(null, task.id, true)}>
                      <button className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">
                        {t.confirmDataSufficient}
                      </button>
                    </form>
                    <form action={reviewTaskData.bind(null, task.id, false)}>
                      <button className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800">
                        {t.requestMoreData}
                      </button>
                    </form>
                  </>
                )}
              </div>
            </div>
            <p className="mt-4 text-xs text-slate-600">{t.dataWorkflowHelp}</p>
          </section>
        )}

        {mayEdit ? (
          <form action={updateCompanyTask.bind(null, task.id)} className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="text-sm font-medium">{t.taskTitle}<input required name="title" defaultValue={task.title} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">{t.due}<input inputMode="numeric" name="dueAt" placeholder={t.dateHint} defaultValue={dateValue(task.dueAt)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">{t.type}<select name="taskType" defaultValue={task.taskType} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="GENERAL">{t.general}</option><option value="TAX_FILING">{t.tax}</option><option value="PAYROLL">{t.payroll}</option><option value="VAT">{t.vat}</option><option value="DOCUMENT">{t.document}</option></select></label>
              <label className="text-sm font-medium">{t.priority}<select name="priority" defaultValue={task.priority} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"><option value="NORMAL">{t.normal}</option><option value="HIGH">{t.high}</option><option value="URGENT">{t.urgent}</option><option value="LOW">{t.low}</option></select></label>
              <label className="text-sm font-medium md:col-span-2">{t.details}<textarea name="details" rows={3} defaultValue={task.details ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">{t.internalPath}<input name="actionPath" defaultValue={task.actionPath ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <label className="text-sm font-medium">{t.externalLink}<input name="externalUrl" defaultValue={task.externalUrl ?? ""} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" /></label>
              <TaskScheduleFields
                t={t}
                defaultRule={task.scheduleRule}
                defaultFrequency={task.recurrenceFrequency}
                defaultInterval={task.recurrenceInterval}
                defaultVatYear={task.periodStart?.getFullYear()}
                defaultVatPeriod={task.periodStart && task.periodEnd ? ({ 0: "JAN_FEB", 2: "MAR_APR", 4: "MAY_JUN", 6: "JUL_AUG", 8: "SEP_OCT", 10: "NOV_DEC" } as Record<number, string>)[task.periodStart.getMonth()] : undefined}
              />
              <TaskDataRequestFields
                t={t}
                defaultEnabled={hasDataRequest}
                defaultDataDueAt={dateValue(task.dataDueAt)}
                defaultReminderStartAt={dateValue(task.reminderStartAt)}
                defaultReminderIntervalDays={task.reminderIntervalDays}
              />
            </div>
            <button className="mt-5 rounded-lg bg-slate-900 px-4 py-2 font-semibold text-white">{t.saveChanges}</button>
          </form>
        ) : (
          <section className="mt-8 rounded-2xl bg-white p-6 shadow-sm">
            {task.details && <p className="text-slate-700">{task.details}</p>}
            {task.dueAt && <p className="mt-3 text-sm text-slate-500">{t.due}: {fmt.format(task.dueAt)}</p>}
          </section>
        )}
      </div>
    </main>
  );
}
