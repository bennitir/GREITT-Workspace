'use client';

import { useState } from 'react';
import { parseBankDebitIsk, previewFamilyLoanAllocation } from '@/lib/personal-finance/family-loan-draft-amounts';

const lenderFields = [
  ['principal', 'Höfuðstóll'],
  ['interest', 'Vextir'],
  ['indexation', 'Greiddar verðbætur'],
  ['fees', 'Gjöld'],
] as const;
const familyFields = [
  ['receivable', 'Skuld barns við foreldri'],
  ['gift', 'Gjöf / styrkur'],
] as const;
type Field = (typeof lenderFields)[number][0] | (typeof familyFields)[number][0];
type Amounts = Record<Field, string>;
const emptyAmounts: Amounts = {
  principal: '', interest: '', indexation: '', fees: '', receivable: '', gift: '',
};
const isk = (value: number) => `${value.toLocaleString('is-IS')} kr.`;

/** Reuses GLÖGGT's existing draft arithmetic, but deliberately has no save action.
 * Mounted only when the server has verified OWNER/ADMIN and the module is inactive.
 * It receives the already-authorized bank amount, never fetches personal records.
 */
export default function FamilyLoanDraftOnlyPanel({ bankAmount, bankTransactionId, bankStatus }: {
  bankAmount: string;
  bankTransactionId: number;
  bankStatus?: string | null;
}) {
  const [amounts, setAmounts] = useState<Amounts>(emptyAmounts);
  const total = (() => { try { return parseBankDebitIsk(bankAmount); } catch { return null; } })();
  const lender = total === null ? null : previewFamilyLoanAllocation(
    total, lenderFields.map(([key]) => amounts[key]),
    'Sundurliðun til lánveitanda er hærri en bankagreiðslan.',
  );
  const family = total === null ? null : previewFamilyLoanAllocation(
    total, familyFields.map(([key]) => amounts[key]),
    'Skuld barns og gjöf eru samtals hærri en bankagreiðslan.',
  );

  function inputs(fields: readonly (readonly [Field, string])[]) {
    return fields.map(([key, label]) => (
      <label key={key} className="block text-sm">
        <span className="font-medium text-slate-800">{label}</span>
        <input
          value={amounts[key]}
          onChange={event => setAmounts(previous => ({ ...previous, [key]: event.target.value }))}
          inputMode="numeric"
          placeholder="0"
          aria-label={label}
          className="mt-1 w-full rounded border border-slate-300 bg-white p-2 text-base"
        />
      </label>
    ));
  }

  function progress(data: NonNullable<typeof lender>, label: string) {
    return <div className="mt-3 border-t border-slate-200 pt-2 text-sm" aria-live="polite">
      {data.error ? <p className="font-semibold text-red-800" role="alert">{label}: {data.error}</p> : <>
        <p>{label} — samtals: <strong>{isk(data.allocatedIsk!)}</strong></p>
        <p>Ósundurliðað: <strong>{isk(data.remainingIsk!)}</strong></p>
      </>}
    </div>;
  }

  return <section className="space-y-3" aria-label="Óvistuð sundurliðun fjölskylduláns" data-testid="family-draft-only">
    <p className="text-sm font-semibold text-slate-900">Bankafærsla #{bankTransactionId}{total === null ? '' : ` · útgreiðsla ${isk(total)}`}</p>
    <p className="rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
      Aðeins reiknidrög í þessum vafra. Ekkert er vistað, staðfest, afstemmt eða bókað.
      Hér er hvorki sótt lánasaga né staðfest tengsl aðila, bíls eða lánveitanda.
    </p>
    {bankStatus === 'RECONCILED' && <p className="text-sm text-amber-900">Þessi bankafærsla hefur þegar verið afstemmd. Reiknidrög breyta ekki þeirri afstemmingu.</p>}
    {total === null ? <p className="rounded bg-slate-50 p-3 text-sm">Veldu útgreiðslu í heilum krónum til að skoða sundurliðun. Innkomin greiðsla verður ekki sjálfkrafa að fjölskylduláni.</p> : <>
      <div className="grid gap-3 xl:grid-cols-2">
        <fieldset className="space-y-2 rounded border border-slate-200 bg-white p-3">
          <legend className="px-1 text-sm font-bold">Til lánveitanda</legend>
          {inputs(lenderFields)}
          {lender && progress(lender, 'Greiðsla til lánveitanda')}
        </fieldset>
        <fieldset className="space-y-2 rounded border border-slate-200 bg-white p-3">
          <legend className="px-1 text-sm font-bold">Milli fjölskyldumeðlima</legend>
          {inputs(familyFields)}
          {family && progress(family, 'Persónuleg ráðstöfun')}
        </fieldset>
      </div>
      <p className="text-xs text-slate-600">Tómar fjárhæðir eru taldar 0 kr. í útreikningi en teljast ekki staðfestar. Sundurliðun lánveitanda og fjölskylduráðstöfun eru tvær óháðar skýringar á sömu greiðslu, ekki fjárhæðir sem á að leggja saman.</p>
      <button type="button" className="rounded border border-slate-400 bg-white px-3 py-2 text-sm font-semibold" onClick={() => setAmounts(emptyAmounts)}>Hreinsa drög</button>
    </>}
  </section>;
}
