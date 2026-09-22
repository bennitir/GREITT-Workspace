"use client";

import { useMemo, useState } from "react";

import { startMobileWorkPart } from "@/app/mobile/verk/actions";
import { workMobileText } from "@/lib/i18n/work-mobile";
import {
  hasWorkStartRules,
  normalizeWorkStartRules,
  workStartRuleEnabled,
  type WorkStartRuleSnapshot,
} from "@/lib/work10/work-start-requirements";

type Props = {
  workOrderId: number;
  workPartId: number;
  language: string;
  rules: WorkStartRuleSnapshot[];
  disabled?: boolean;
};

export default function MobileWorkStartDialog({ workOrderId, workPartId, language, rules, disabled = false }: Props) {
  const t = workMobileText(language);
  const normalized = useMemo(() => normalizeWorkStartRules(rules), [rules]);
  const [open, setOpen] = useState(false);

  if (!hasWorkStartRules(normalized)) {
    return (
      <form action={startMobileWorkPart}>
        <input type="hidden" name="workOrderId" value={workOrderId} />
        <input type="hidden" name="workPartId" value={workPartId} />
        <button type="submit" disabled={disabled} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{t.startWork}</button>
      </form>
    );
  }

  const gps = workStartRuleEnabled(normalized, "GPS_PROGRESS");
  const chains = workStartRuleEnabled(normalized, "CHAIN_COUNT");
  const photo = workStartRuleEnabled(normalized, "START_PHOTO");

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} disabled={disabled} className="w-full rounded-xl bg-blue-600 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">
        {t.startWork}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-3 sm:p-6">
          <div className="mx-auto min-h-full max-w-md rounded-2xl bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-950">{t.startRequirementsTitle}</h2>
                <p className="mt-2 text-sm leading-6 text-slate-600">{t.startRequirementsHelp}</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border px-3 py-2 text-sm font-semibold text-slate-700">{t.cancel}</button>
            </div>

            <form action={startMobileWorkPart} className="mt-5 grid gap-4">
              <input type="hidden" name="workOrderId" value={workOrderId} />
              <input type="hidden" name="workPartId" value={workPartId} />

              {gps ? (
                <section className="rounded-2xl border border-blue-200 bg-blue-50 p-4">
                  <h3 className="font-bold text-blue-950">{t.gpsNoticeTitle}</h3>
                  <p className="mt-2 text-sm leading-6 text-blue-900">{t.gpsNoticeBody}</p>
                  <p className="mt-2 rounded-xl bg-white/70 p-3 text-xs leading-5 text-blue-900">{t.gpsFoundationNotice}</p>
                  <label className="mt-3 flex items-start gap-3 text-sm font-semibold text-blue-950">
                    <input type="checkbox" name="gpsAcknowledged" value="true" required className="mt-1 h-5 w-5" />
                    <span>{t.gpsAcknowledge}</span>
                  </label>
                </section>
              ) : null}

              {chains ? (
                <label className="grid gap-1 text-sm font-semibold text-slate-700">
                  <span>{t.chainCount}</span>
                  <input name="chainCount" type="number" min="0" max="20" step="1" required inputMode="numeric" className="rounded-xl border border-slate-300 px-3 py-3 text-base" />
                  <span className="text-xs font-normal leading-5 text-slate-500">{t.chainCountHelp}</span>
                </label>
              ) : null}

              {photo ? (
                <label className="grid gap-2 text-sm font-semibold text-slate-700">
                  <span>{t.startPhoto}</span>
                  <span className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-base font-bold text-blue-800">📷 {t.takeStartPhoto}</span>
                  <input name="startPhoto" type="file" accept="image/*" capture="environment" required className="block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm" />
                  <span className="text-xs font-normal leading-5 text-slate-500">{t.startPhotoHelp}</span>
                </label>
              ) : null}

              <button type="submit" className="mt-2 w-full rounded-xl bg-blue-600 px-4 py-4 text-base font-bold text-white">{t.confirmAndStart}</button>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
