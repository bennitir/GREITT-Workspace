"use client";

import IcelandicTimeInput from "@/components/ui/IcelandicTimeInput";
import IcelandicDateInput from "@/components/ui/IcelandicDateInput";
import Button from "@/components/ui/Button";
import { updateWorkLog } from "@/app/actions/workActions";

type CompanyUser = {
  user: {
    id: number;
    name: string;
  };
};

type WorkLog = {
  id: number;
  userId: number | null;
  workDate: Date;
  startedAt: Date | null;
  endedAt: Date | null;
  breakMinutes: number;
  description: string | null;
};

type Props = {
  workLog: WorkLog;
  companyUsers: CompanyUser[];
};

function timeValue(date: Date | null) {
  if (!date) return "";

  return new Date(date).toISOString().slice(11, 16);
}

function dateValue(date: Date) {
  return new Date(date).toISOString().slice(0, 10);
}

export default function EditWorkLogForm({
  workLog,
  companyUsers,
}: Props) {
  return (
    <form action={updateWorkLog} className="space-y-4">
      <input
        type="hidden"
        name="workLogId"
        value={workLog.id}
      />

      <div>
        <label className="block text-sm font-medium">
          Starfsmaður
        </label>

        <select
          name="userId"
          defaultValue={workLog.userId?.toString() ?? ""}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        >
          <option value="">Veldu starfsmann</option>

          {companyUsers.map((companyUser) => (
            <option
              key={companyUser.user.id}
              value={companyUser.user.id}
            >
              {companyUser.user.name}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium">
          Dagsetning
        </label>

        <IcelandicDateInput
  name="workDate"
  required
  defaultValue={dateValue(workLog.workDate)}
  submitFormat="iso"
/>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium">
            Frá
          </label>

          <IcelandicTimeInput
  name="startedAt"
  required
  defaultValue={timeValue(workLog.startedAt)}
/>
        </div>

        <div>
          <label className="block text-sm font-medium">
            Til
          </label>

          <IcelandicTimeInput
  name="endedAt"
  required
  defaultValue={timeValue(workLog.endedAt)}
/>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium">
          Hlé í mínútum
        </label>

        <input
          type="number"
          name="breakMinutes"
          min="0"
          defaultValue={workLog.breakMinutes}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">
          Lýsing
        </label>

        <textarea
          name="description"
          rows={3}
          defaultValue={workLog.description ?? ""}
          className="mt-1 w-full rounded-lg border px-3 py-2"
        />
      </div>

      <Button type="submit">
        Vista breytingar
      </Button>
    </form>
  );
}