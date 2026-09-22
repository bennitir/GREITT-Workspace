"use client";

import { useMemo, useState } from "react";

import { workMobileText } from "@/lib/i18n/work-mobile";
import { workKeyText } from "@/lib/i18n/work-keys";
import {
  normalizeWorkStartRules,
  workStartRuleEnabled,
  type WorkStartRuleSnapshot,
} from "@/lib/work10/work-start-requirements";

type WorkKeyOption = {
  id: number;
  code: string;
  name: string;
  startRules: WorkStartRuleSnapshot[];
};

type Props = {
  language: string;
  workKeys: WorkKeyOption[];
  disabled?: boolean;
};

export default function MobileDiaryWorkKeyRequirements({ language, workKeys, disabled = false }: Props) {
  const t = workMobileText(language);
  const keyT = workKeyText(language);
  const [selectedId, setSelectedId] = useState("");
  const [gpsConfirmed, setGpsConfirmed] = useState(false);
  const [gpsDialogOpen, setGpsDialogOpen] = useState(false);

  const selected = useMemo(
    () => workKeys.find((key) => String(key.id) === selectedId) ?? null,
    [selectedId, workKeys],
  );
  const rules = normalizeWorkStartRules(selected?.startRules ?? []);
  const gps = workStartRuleEnabled(rules, "GPS_PROGRESS");
  const chains = workStartRuleEnabled(rules, "CHAIN_COUNT");
  const photo = workStartRuleEnabled(rules, "START_PHOTO");

  function onSelect(value: string) {
    setSelectedId(value);
    setGpsConfirmed(false);
    const next = workKeys.find((key) => String(key.id) === value) ?? null;
    const nextRules = normalizeWorkStartRules(next?.startRules ?? []);
    setGpsDialogOpen(workStartRuleEnabled(nextRules, "GPS_PROGRESS"));
  }

  return (
    <>
      <label className="grid gap-1 text-sm font-semibold text-slate-700">
        <span>{t.diaryWorkKey}</span>
        <select name="workKeyId" value={selectedId} onChange={(event) => onSelect(event.target.value)} disabled={disabled} className="rounded-xl border border-slate-300 bg-white px-3 py-3 text-base disabled:bg-slate-100">
          <option value="">{keyT.selectNone}</option>
          {workKeys.map((key) => <option key={key.id} value={key.id}>{key.code}{key.name !== key.code ? ` · ${key.name}` : ""}</option>)}
        </select>
      </label>

      {gps ? <input type="hidden" name="gpsAcknowledged" value={gpsConfirmed ? "true" : ""} /> : null}

      {selected && (gps || chains || photo) ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs leading-5 text-blue-950">
          <span className="font-bold">{t.configuredForWorkKey}</span>
          {gps ? ` · ${t.gpsNoticeShort}${gpsConfirmed ? ` (${t.confirmed})` : ""}` : ""}
          {chains ? ` · ${t.chainCount}` : ""}
          {photo ? ` · ${t.startPhoto}` : ""}
        </div>
      ) : null}

      {chains ? (
        <label className="grid gap-1 text-sm font-semibold text-slate-700">
          <span>{t.chainCount}</span>
          <input name="chainCount" type="number" min="0" max="20" step="1" required disabled={disabled} inputMode="numeric" className="rounded-xl border border-slate-300 px-3 py-3 text-base disabled:bg-slate-100" />
          <span className="text-xs font-normal leading-5 text-slate-500">{t.chainCountHelp}</span>
        </label>
      ) : null}

      {photo ? (
        <label className="grid gap-2 text-sm font-semibold text-slate-700">
          <span>{t.startPhoto}</span>
          <span className="inline-flex min-h-12 cursor-pointer items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-base font-bold text-blue-800">📷 {t.takeStartPhoto}</span>
          <input name="startPhoto" type="file" accept="image/*" capture="environment" required disabled={disabled} className="block w-full rounded-xl border border-slate-300 bg-white p-3 text-sm" />
          <span className="text-xs font-normal leading-5 text-slate-500">{t.startPhotoHelp}</span>
        </label>
      ) : null}

      {gpsDialogOpen ? (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-slate-950/70 p-3 sm:p-6">
          <div className="mx-auto flex min-h-full max-w-md items-center">
            <div className="w-full rounded-2xl bg-white p-5 shadow-2xl">
              <h2 className="text-2xl font-bold text-slate-950">{t.gpsNoticeTitle}</h2>
              <p className="mt-3 text-sm leading-6 text-slate-700">{t.gpsNoticeBody}</p>
              <p className="mt-3 rounded-xl bg-blue-50 p-3 text-xs leading-5 text-blue-900">{t.gpsFoundationNotice}</p>
              <label className="mt-4 flex items-start gap-3 text-sm font-semibold text-slate-900">
                <input
                  type="checkbox"
                  checked={gpsConfirmed}
                  onChange={(event) => setGpsConfirmed(event.target.checked)}
                  className="mt-1 h-5 w-5"
                />
                <span>{t.gpsAcknowledge}</span>
              </label>
              <div className="mt-5 grid gap-2">
                <button type="button" disabled={!gpsConfirmed} onClick={() => setGpsDialogOpen(false)} className="rounded-xl bg-blue-600 px-4 py-4 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-40">{t.gpsConfirm}</button>
                <button type="button" onClick={() => { setSelectedId(""); setGpsConfirmed(false); setGpsDialogOpen(false); }} className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-bold text-slate-700">{t.cancel}</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
