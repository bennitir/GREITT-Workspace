"use client";

import { useState } from "react";

import Button from "@/components/ui/Button";
import EditWorkLogForm from "@/components/work/EditWorkLogForm";

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

export default function WorkLogEditToggle({
  workLog,
  companyUsers,
}: Props) {
  const [editing, setEditing] = useState(false);

  return (
    <div className="space-y-3">
      <Button
        type="button"
        onClick={() => setEditing((value) => !value)}
      >
        {editing ? "Loka breytingu" : "Breyta"}
      </Button>

      {editing && (
        <div className="rounded-lg border bg-slate-50 p-4">
          <EditWorkLogForm
            workLog={workLog}
            companyUsers={companyUsers}
          />
        </div>
      )}
    </div>
  );
}