"use client";
import { useState } from "react";
import Button from "@/components/ui/Button";
import EditWorkLogForm from "@/components/work/EditWorkLogForm";
import { workText } from "@/lib/i18n/work";

type CompanyUser = { user: { id: number; name: string } };
type WorkLog = { id: number; userId: number | null; workDate: Date; startedAt: Date | null; endedAt: Date | null; breakMinutes: number; description: string | null };
type Props = { workLog: WorkLog; companyUsers: CompanyUser[]; interfaceLanguage?: string };

export default function WorkLogEditToggle({ workLog, companyUsers, interfaceLanguage }: Props) {
  const [editing, setEditing] = useState(false);
  const t = workText(interfaceLanguage);
  return <div className="space-y-3"><Button type="button" onClick={() => setEditing((value) => !value)}>{editing ? t.closeEdit : t.edit}</Button>{editing && <div className="rounded-lg border bg-slate-50 p-4"><EditWorkLogForm workLog={workLog} companyUsers={companyUsers} interfaceLanguage={interfaceLanguage} /></div>}</div>;
}
