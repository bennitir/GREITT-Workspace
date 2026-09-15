"use client";

import { useState } from "react";

type Props = {
  t: any;
  defaultEnabled?: boolean;
  defaultDataDueAt?: string;
  defaultReminderStartAt?: string;
  defaultReminderIntervalDays?: number;
};

export default function TaskDataRequestFields({
  t,
  defaultEnabled = false,
  defaultDataDueAt = "",
  defaultReminderStartAt = "",
  defaultReminderIntervalDays = 3,
}: Props) {
  const [enabled, setEnabled] = useState(defaultEnabled);

  return (
    <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
      <label className="flex items-start gap-3 text-sm font-medium">
        <input
          type="checkbox"
          name="dataRequestEnabled"
          value="1"
          checked={enabled}
          onChange={(event) => setEnabled(event.target.checked)}
          className="mt-1 h-4 w-4"
        />
        <span>
          <span className="block font-semibold text-slate-900">{t.dataRequest}</span>
          <span className="mt-1 block font-normal text-slate-600">{t.dataRequestHelp}</span>
        </span>
      </label>

      {enabled && (
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <label className="text-sm font-medium">
            {t.dataDue}
            <input
              inputMode="numeric"
              name="dataDueAt"
              placeholder={t.dateHint}
              defaultValue={defaultDataDueAt}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            {t.reminderStart}
            <input
              inputMode="numeric"
              name="reminderStartAt"
              placeholder={t.dateHint}
              defaultValue={defaultReminderStartAt}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium">
            {t.reminderEvery}
            <input
              type="number"
              min="1"
              max="60"
              name="reminderIntervalDays"
              defaultValue={defaultReminderIntervalDays}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2"
            />
          </label>
          <p className="text-xs text-slate-500 md:col-span-3">{t.dataDatesHelp}</p>
        </div>
      )}
    </div>
  );
}
