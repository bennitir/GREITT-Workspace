"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import type { OwnTransferActionResult, BankAccountOwnerReviewResult } from './internal-transfer-actions';
import type { BankOwnerKind, BankOwnerEvidenceKind } from '@/lib/personal-finance/bank-account-owner-policy';

type Success = Extract<BankAccountOwnerReviewResult, { ok: true }>;

const words = {
  is: {
    title: 'Staðfest eignarhald bankareikninga',
    reading: 'Sæki staðfesta eigendur…', unknown: 'Eignarhald ekki staðfest í GLÖGGT',
    confirmed: 'Staðfestur eigandi', same: 'Sami staðfesti eigandi á báðum reikningum',
    different: 'Ekki er staðfest að sami aðili eigi báða reikningana.',
    unavailable: 'Ekki tókst að lesa eigandastaðfestingar. Pörun er læst.',
    choose: 'Veldu skráðan eiganda', evidence: 'Heimild', netbank: 'Netbanki', statement: 'Bankayfirlit',
    attest: 'Ég staðfesti að skráði eigandinn sé raunverulegur eigandi þessa reiknings samkvæmt valinni heimild.',
    register: 'Skrá eiganda', cancel: 'Hætta við', save: 'Vista eigandastaðfestingu',
    revoke: 'Afturkalla eigandastaðfestingu', reason: 'Ástæða afturköllunar (minnst 8 stafir)',
    submitRevoke: 'Afturkalla með aðgerðasögu', locked: 'Skráning er óvirk í þessu umhverfi.',
    failed: 'Aðgerðin mistókst; staðfestu stöðuna áður en haldið er áfram.',
  },
  en: {
    title: 'Verified bank-account owners', reading: 'Reading verified owners…',
    unknown: 'Account owner not verified in GLÖGGT', confirmed: 'Verified owner',
    same: 'Both accounts have the same verified owner', different: 'A common owner is not yet verified.',
    unavailable: 'Unable to read owner evidence. Pairing is locked.', choose: 'Choose a registered owner',
    evidence: 'Evidence', netbank: 'Online banking', statement: 'Bank statement',
    attest: 'I confirm that the selected owner owns this account based on the selected evidence.',
    register: 'Register owner', cancel: 'Cancel', save: 'Save owner confirmation',
    revoke: 'Revoke owner confirmation', reason: 'Reason for revocation (at least 8 characters)',
    submitRevoke: 'Revoke with audit record', locked: 'Registration is disabled in this environment.',
    failed: 'The operation failed; review the status before proceeding.',
  },
} as const;

export default function BankAccountOwnerPanel({ language, sourceAccountId, targetAccountId,
  sourceName, targetName, canWrite, reviewAction, confirmAction, revokeAction, onPairableChange }: {
  language: string; sourceAccountId: number; targetAccountId: number;
  sourceName: string; targetName: string; canWrite: boolean;
  reviewAction: (sourceId: number, targetId: number) => Promise<BankAccountOwnerReviewResult>;
  confirmAction: (bankAccountId: number, ownerKind: BankOwnerKind, ownerId: number,
    evidence: BankOwnerEvidenceKind, attested: boolean) => Promise<OwnTransferActionResult>;
  revokeAction: (bankAccountId: number, reason: string) => Promise<OwnTransferActionResult>;
  onPairableChange: (value: boolean) => void;
}) {
  const t = language === 'is' ? words.is : words.en;
  const [result, setResult] = useState<BankAccountOwnerReviewResult | null>(null);
  const [editing, setEditing] = useState<number | null>(null);
  const [revoking, setRevoking] = useState<number | null>(null);
  const [ownerKey, setOwnerKey] = useState('');
  const [evidence, setEvidence] = useState<BankOwnerEvidenceKind>('NETBANK');
  const [attested, setAttested] = useState(false);
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const requestGeneration = useRef(0);

  const reload = useCallback(async (active: () => boolean = () => true) => {
    const generation = ++requestGeneration.current;
    onPairableChange(false);
    try {
      const next = await reviewAction(sourceAccountId, targetAccountId);
      if (!active() || generation !== requestGeneration.current) return;
      setResult(next);
      onPairableChange(next.ok && next.sameOwner);
    } catch {
      if (!active() || generation !== requestGeneration.current) return;
      setResult({ ok: false, code: 'UNAVAILABLE' });
      onPairableChange(false);
    }
  }, [sourceAccountId, targetAccountId, reviewAction, onPairableChange]);

  useEffect(() => {
    let active = true;
    void reload(() => active);
    return () => { active = false; requestGeneration.current++; onPairableChange(false); };
  }, [reload, onPairableChange]);

  function save(accountId: number, data: Success) {
    const owner = data.choices.find(choice => `${choice.kind}:${choice.id}` === ownerKey);
    if (!canWrite || pending || !owner || !attested) return;
    setMessage(null); onPairableChange(false);
    startTransition(async () => {
      try {
        const response = await confirmAction(accountId, owner.kind, owner.id, evidence, attested);
        if (!response.ok) { setMessage(`${t.failed} (${response.code})`); await reload(); return; }
        setEditing(null); setAttested(false); setOwnerKey(''); await reload();
      } catch { setMessage(t.failed); await reload(); }
    });
  }

  function revoke(accountId: number) {
    if (!canWrite || pending || reason.trim().length < 8) return;
    setMessage(null); onPairableChange(false);
    startTransition(async () => {
      try {
        const response = await revokeAction(accountId, reason.trim());
        if (!response.ok) { setMessage(`${t.failed} (${response.code})`); await reload(); return; }
        setRevoking(null); setReason(''); await reload();
      } catch { setMessage(t.failed); await reload(); }
    });
  }

  return <section data-testid="own-transfer-owner-evidence" className="mt-3 rounded border border-slate-300 bg-white p-3 text-sm">
    <h6 className="font-bold">{t.title}</h6>
    {!result && <p className="mt-2 text-slate-700">{t.reading}</p>}
    {result && !result.ok && <p role="alert" className="mt-2 font-semibold text-amber-900">{t.unavailable} ({result.code})</p>}
    {result?.ok && <>
      <div className="mt-2 space-y-3">
        {([ { id: sourceAccountId, name: sourceName, owner: result.source },
            { id: targetAccountId, name: targetName, owner: result.target } ]).map(account => {
          const choice = account.owner && result.choices.find(option =>
            option.kind === account.owner?.ownerKind && option.id === account.owner?.ownerId);
          return <section key={account.id} className="rounded border border-slate-200 p-2">
            <p className="font-semibold">{account.name}</p>
            <p className={account.owner ? 'text-emerald-900' : 'text-amber-900'}>
              {account.owner ? `${t.confirmed}: ${choice?.label ?? ''} · #${account.owner.auditId}` : t.unknown}
            </p>
            {canWrite && editing !== account.id && revoking !== account.id &&
              <button type="button" disabled={pending} onClick={() => {
                setEditing(account.id); setRevoking(null); setOwnerKey(''); setAttested(false); setMessage(null);
                onPairableChange(false);
              }} className="mt-2 rounded border border-teal-700 px-2 py-1 text-teal-900">{t.register}</button>}
            {canWrite && account.owner && editing !== account.id && revoking !== account.id &&
              <button type="button" disabled={pending} onClick={() => {
                setRevoking(account.id); setEditing(null); setReason(''); setMessage(null);
                onPairableChange(false);
              }} className="ml-2 mt-2 rounded border border-amber-700 px-2 py-1 text-amber-900">{t.revoke}</button>}
            {canWrite && editing === account.id && <div className="mt-2 space-y-2">
              <select aria-label={t.choose} value={ownerKey} onChange={e => setOwnerKey(e.target.value)}
                className="w-full rounded border p-2">
                <option value="">{t.choose}</option>
                {result.choices.map(option => <option key={`${option.kind}:${option.id}`} value={`${option.kind}:${option.id}`}>{option.label}</option>)}
              </select>
              <label className="block">{t.evidence}
                <select value={evidence} onChange={e => setEvidence(e.target.value as BankOwnerEvidenceKind)}
                  className="ml-2 rounded border p-1">
                  <option value="NETBANK">{t.netbank}</option><option value="BANK_STATEMENT">{t.statement}</option>
                </select>
              </label>
              <label className="flex items-start gap-2"><input type="checkbox" checked={attested}
                onChange={e => setAttested(e.target.checked)} /><span>{t.attest}</span></label>
              <button type="button" disabled={pending || !ownerKey || !attested} onClick={() => save(account.id, result)}
                className="rounded bg-teal-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{t.save}</button>
              <button type="button" onClick={() => {setEditing(null); void reload();}}
                className="ml-2 rounded border px-2 py-2">{t.cancel}</button>
            </div>}
            {canWrite && revoking === account.id && <div className="mt-2">
              <label className="block">{t.reason}
                <textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)}
                  className="mt-1 block w-full rounded border p-2" rows={2}/>
              </label>
              <button type="button" disabled={pending || reason.trim().length < 8} onClick={() => revoke(account.id)}
                className="mt-2 rounded border border-amber-700 px-3 py-2 font-semibold text-amber-900 disabled:opacity-50">{t.submitRevoke}</button>
              <button type="button" onClick={() => {setRevoking(null); void reload();}}
                className="ml-2 rounded border px-2 py-2">{t.cancel}</button>
            </div>}
          </section>;
        })}
      </div>
      <p className={`mt-2 font-semibold ${result.sameOwner ? 'text-emerald-900' : 'text-amber-900'}`}>
        {result.sameOwner ? t.same : t.different}
      </p>
      {!canWrite && <p className="mt-1 text-amber-900">{t.locked}</p>}
    </>}
    {message && <p role="status" className="mt-2 text-amber-900">{message}</p>}
  </section>;
}
