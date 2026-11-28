'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FamilyPerson } from '@/lib/personal-finance/transfer-split';
import type { JournalSnapshot, JournalCreateInput, JournalMovementInput, JournalActionResult } from '@/lib/personal-finance/family-loan-journal-contract';
import { parseEnteredFamilyLoanAmountIsk } from '@/lib/personal-finance/family-loan-journal-amount';

type Props = {
  people: FamilyPerson[]; snapshot: JournalSnapshot | null; enabled: boolean;
  currentBank: { id: number; amount: string; date: string; text: string };
  createAction?: (input: JournalCreateInput) => Promise<JournalActionResult>;
  movementAction?: (input: JournalMovementInput) => Promise<JournalActionResult>;
};
function kr(n: number) { return `${new Intl.NumberFormat('is-IS',{maximumFractionDigits:0}).format(n)} kr.`; }
function requestKey(): string { return crypto.randomUUID(); }
/** This is a company-scoped local TEST journal, never a bookkeeping posting.
 * The bank movement is optional evidence only for the FULL exact amount.
 */
export default function FamilyLoanJournalPanel({people,snapshot,enabled,currentBank,createAction,movementAction}:Props) {
  const router = useRouter();
  const [pending,start] = useTransition();
  const [message,setMessage] = useState('');
  const [parent,setParent] = useState('');
  const [child,setChild] = useState('');
  const [title,setTitle] = useState('');
  const [loanId,setLoanId] = useState('');
  const [kind,setKind] = useState<'OPENING_BALANCE'|'ADVANCE'|'REPAYMENT'>('OPENING_BALANCE');
  const [amount,setAmount] = useState('');
  const [effectiveDate,setEffectiveDate] = useState('');
  const [note,setNote] = useState('');
  const [useBank,setUseBank] = useState(false);
  const [createKey,setCreateKey] = useState<string|null>(null);
  const [movementKey,setMovementKey] = useState<string|null>(null);
  const inputClass='min-w-0 w-full rounded border border-slate-400 bg-white p-2 text-base text-slate-900';
  function newAccount() {
    if (!enabled || !createAction) return;
    const idempotency = createKey ?? requestKey(); setCreateKey(idempotency);
    setMessage('');
    start(async () => {
      const result = await createAction({parentPersonId:Number(parent),childPersonId:Number(child),title,
        linkedInnsynLoanId:null,vehicleEntityId:null,requestId:idempotency});
      if (result.ok) {setMessage('Lán vistað í staðbundnum prófunargrunni.');setCreateKey(null);setTitle('');router.refresh();}
      else setMessage(result.message);
    });
  }
  function addEntry() {
    if (!enabled || !movementAction) return;
    const n=parseEnteredFamilyLoanAmountIsk(amount);
    if (n === null) {setMessage('Skráðu jákvæða fjárhæð í heilum krónum.');return;}
    const idempotency = movementKey ?? requestKey();setMovementKey(idempotency);
    setMessage('');
    start(async () => {
      const result = await movementAction({loanId:Number(loanId),kind,amountIsk:n,effectiveDate,note,
        reversalOfId:null,bankTransactionId:useBank && kind!=='OPENING_BALANCE' ? currentBank.id : null,
        requestId:idempotency});
      if (result.ok) {setMessage('Færsla vistuð með rekjanleika í staðbundnum prófunargrunni.');setMovementKey(null);setAmount('');setNote('');setUseBank(false);router.refresh();}
      else setMessage(result.message);
    });
  }
  return <section className="mt-4 space-y-4" aria-label="Varanleg fjölskyldulánasaga" data-testid="family-loan-journal">
    <h3 className="text-lg font-bold">Lánasaga og eftirstöðvar</h3>
    {!enabled && <p role="status" className="rounded border border-amber-400 bg-amber-50 p-3 text-amber-900">
      Varanleg vistun er lokuð. Þessi keyrsla notar ekki staðfestan V03-prófunargrunn. Engar skuldir eru reiknaðar úr óstaðfestum bankahreyfingum.
    </p>}
    {enabled && snapshot && <>
      {!snapshot.accounts.length ? <p>Engin fjölskyldulán hafa verið stofnuð í þessum staðbundna prófunargrunni.</p> :
        <div className="space-y-2">{snapshot.balances.map(b => <article key={b.loanId} className="rounded border p-3">
          <div className="font-semibold">{b.title} — lán #{b.loanId}</div>
          <div className="text-lg font-bold">Eftirstöðvar: {kr(b.outstandingIsk)}</div>
          <div className="text-sm">Samtals lánveitt: {kr(b.totalAdvancedIsk)} · Afborganir: {kr(b.totalRepaidIsk)} · Færslur: {b.movementCount}</div>
        </article>)}</div>}
      <div className="rounded border p-3 space-y-2">
        <h4 className="font-semibold">Stofna lán milli foreldris og barns</h4>
        <div className="grid gap-2 sm:grid-cols-2">
          <label>Foreldri<select className={inputClass} value={parent} onChange={e=>{setParent(e.target.value);setCreateKey(null);}}>
            <option value="">Veldu</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
          <label>Barn<select className={inputClass} value={child} onChange={e=>{setChild(e.target.value);setCreateKey(null);}}>
            <option value="">Veldu</option>{people.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
          </select></label>
        </div>
        <label>Heiti láns<input className={inputClass} value={title} onChange={e=>{setTitle(e.target.value);setCreateKey(null);}} placeholder="T.d. lán vegna bifreiðar" maxLength={160}/></label>
        <p className="text-sm text-slate-700">Ökutækja- og Innsýn-tenging er ekki sjálfkrafa staðfest við stofnun. Þær eru ekki ályktaðar af heiti láns.</p>
        <button type="button" disabled={pending || !parent || !child || parent===child || !title.trim()}
          className="rounded bg-teal-800 px-3 py-2 font-semibold text-white disabled:opacity-50" onClick={newAccount}>Stofna lán</button>
      </div>
      {snapshot.accounts.length>0 && <div className="rounded border p-3 space-y-2">
        <h4 className="font-semibold">Skrá lánveitingu eða afborgun</h4>
        <label>Lán<select className={inputClass} value={loanId} onChange={e=>{setLoanId(e.target.value);setMovementKey(null);}}>
          <option value="">Veldu lán</option>{snapshot.accounts.map(a=><option key={a.id} value={a.id}>{a.title} (#{a.id})</option>)}
        </select></label>
        <label>Tegund<select className={inputClass} value={kind} onChange={e=>{setKind(e.target.value as typeof kind);setUseBank(false);setMovementKey(null);}}>
          <option value="OPENING_BALANCE">Upphafsskuld samkvæmt heimild</option><option value="ADVANCE">Ný lánveiting</option>
          <option value="REPAYMENT">Afborgun barns til foreldris</option>
        </select></label>
        <div className="grid gap-2 sm:grid-cols-2">
          <label>Fjárhæð (kr.)<input className={inputClass} inputMode="numeric" value={amount} onChange={e=>{setAmount(e.target.value);setMovementKey(null);}} placeholder="10.000" /></label>
          <label>Dagsetning<input className={inputClass} type="date" value={effectiveDate} onChange={e=>{setEffectiveDate(e.target.value);setMovementKey(null);}} /></label>
        </div>
        <label>Heimild / skýring<input className={inputClass} maxLength={240} value={note} onChange={e=>{setNote(e.target.value);setMovementKey(null);}} placeholder="Hvaða samningur eða greiðsla sannar þetta?" /></label>
        {kind !== 'OPENING_BALANCE' && <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={useBank} onChange={e=>{setUseBank(e.target.checked);setMovementKey(null);}} />
          Tengja valda bankafærslu #{currentBank.id} (einungis ef <strong>öll fjárhæðin</strong> er þessi lánveiting/afborganir; engin gjöf eða innkaup í sömu millifærslu)
        </label>}
        <button type="button" disabled={pending || !loanId || !amount || !effectiveDate || !note.trim()}
          className="rounded bg-teal-800 px-3 py-2 font-semibold text-white disabled:opacity-50" onClick={addEntry}>Vista staðfesta færslu</button>
      </div>}
      {!!snapshot.movements.length && <details className="rounded border p-3"><summary className="cursor-pointer font-semibold">Færslusaga ({snapshot.movements.length})</summary>
        <div className="mt-2 max-h-80 overflow-y-auto space-y-2">{snapshot.movements.map(m=><div className="border-b py-2 text-sm" key={m.id}>
          <strong>#{m.id}</strong> · {m.effectiveDate} · {m.kind} · {kr(m.amountIsk)} · {m.note}
          {m.bankTransactionId ? ` · Bankafærsla #${m.bankTransactionId}` : ' · Án bankatengingar'}
        </div>)}</div></details>}
    </>}
    {message && <p role="status" className="rounded border p-2 font-semibold">{message}</p>}
    <p className="text-sm text-slate-700">Eftirstöðvar hér eru skuld barns við foreldri samkvæmt skráðri lánasögu, ekki staða skuldar við banka. Engin sjálfvirk bókun fer fram.</p>
  </section>;
}
