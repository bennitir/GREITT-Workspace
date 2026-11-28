'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { confirmFamilyTransfer } from './family-actions';
import { previewFamilyTransfer, type FamilyDraft, type FamilyPerson } from '@/lib/personal-finance/transfer-split';
import { formatVisualAmount } from '../../_lib/visual-reconciliation';
import type { SavedFamilyTransfer } from '@/lib/personal-finance/transfer-split-repository';

type SaveResult = {ok:true;id:number}|{ok:false;message:string};

export default function FamilyTransferPanel({ transaction, people, canEdit, blockReason, saved, storageEnabled=false, saveAction=confirmFamilyTransfer }: {
  transaction: {id:number; amount:string}; people: FamilyPerson[]; canEdit:boolean;
  blockReason:string|null;
  saved?:SavedFamilyTransfer;
  storageEnabled?:boolean;
  saveAction?:(input:FamilyDraft)=>Promise<SaveResult>;
}) {
  const router=useRouter();
  const [saving,setSaving]=useState(false);
  const [savedId,setSavedId]=useState<number|null>(null);
  const [parent, setParent] = useState(''); const [child, setChild] = useState('');
  const [parentName, setParentName] = useState(''); const [childName, setChildName] = useState('');
  const [purchase, setPurchase] = useState(''); const [description, setDescription] = useState('');
  const [confirmedDirection, setConfirmedDirection] = useState(false);
  const [preview, setPreview] = useState<ReturnType<typeof previewFamilyTransfer> | null>(null);
  const [error, setError] = useState('');
  const reset = () => {setPreview(null); setError('');};
  const style = 'mt-1 w-full rounded border border-slate-300 bg-white p-2';
  function review() {
    try {
      if (blockReason !== null) throw Error(blockReason);
      if (!confirmedDirection) throw Error('Staðfestu fyrst að foreldrið hafi millifært til barnsins.');
      setPreview(previewFamilyTransfer({bankTransactionId:transaction.id, bankAmount:transaction.amount,
        parentPersonId:parent ? Number(parent) : null, childPersonId:child ? Number(child) : null,
        parentName:people.find(p=>p.id===Number(parent))?.name ?? parentName,
        childName:people.find(p=>p.id===Number(child))?.name ?? childName,
        purchaseAmount:purchase, description, transferConfirmed:confirmedDirection})); setError('');
    } catch (e) {setPreview(null); setError(e instanceof Error ? e.message : 'Ekki tókst að yfirfara skiptingu.');}
  }
  async function save() {
    if(!preview||!storageEnabled||!canEdit||blockReason!==null||saving||savedId!==null)return;
    if(!preview.parentPersonId||!preview.childPersonId){setError('Veldu tvo skráða einstaklinga áður en vistað er.');return;}
    setSaving(true);setError('');
    try {
      const result=await saveAction({bankTransactionId:transaction.id,bankAmount:transaction.amount,
        parentPersonId:preview.parentPersonId,childPersonId:preview.childPersonId,parentName:preview.parentName,
        childName:preview.childName,purchaseAmount:String(preview.purchaseAmountIsk),description:preview.description,transferConfirmed:true});
      if(result.ok){setSavedId(result.id);router.refresh();}else setError(result.message);
    } catch {setError('Svar frá vistun barst ekki. Endurhladdu síðuna áður en þú reynir aftur.');}
    finally {setSaving(false);}
  }
  return <section className="mt-5 border-t pt-4" aria-label="Fjölskylduviðauki">
    <h3 className="font-semibold">Fjölskylduviðauki · endurgreiðsla og gjöf</h3>
    <p className="my-2 text-sm">Barn greiddi innkaup fyrir foreldri. Foreldrið millifærði til baka. Skiptingin er skýring, ekki bókun eða staðfest afstemming.</p>
    {saved ? <article data-testid="family-transfer-saved" className="my-3 rounded bg-teal-50 p-3">
      <strong>Vistuð fjölskylduskipting #{saved.id}</strong>
      <p>{saved.parentName} → {saved.childName}</p>
      <dl><dt>Endurgreiðsla</dt><dd>{formatVisualAmount(saved.reimbursementAmountIsk,'ISK','is')}</dd>
        <dt>Gjöf</dt><dd>{formatVisualAmount(saved.giftAmountIsk,'ISK','is')}</dd>
        <dt>Samtals</dt><dd>{formatVisualAmount(saved.totalAmountIsk,'ISK','is')}</dd></dl>
      <p>{saved.description}</p>
      <p className="mt-2 text-sm">Skráð {saved.createdAt} · notandi #{saved.createdByUserId} · aðgerðasaga #{saved.auditId}</p>
      <p className="text-sm">Engin sjálfvirk bókun. Ekki er hægt að yfirskrifa vistaða skiptingu.</p>
    </article> : blockReason !== null ? <p role="status" data-testid="family-transfer-blocked" className="my-2 rounded bg-amber-50 p-3">{blockReason}</p> : !canEdit ? <p>Aðeins notandi með afstemmingarheimild getur undirbúið skiptingu.</p> : <>
      {savedId!==null && <p role="status">Vistun #{savedId} tókst. Upplýsingar eru sóttar aftur úr gagnagrunni.</p>}
      <fieldset disabled={saving||savedId!==null} className="min-w-0">
      <p role="status" className="my-2 rounded bg-amber-50 p-2 text-sm">Óvistuð drög. {storageEnabled?'Yfirfarðu aðila og upphæðir áður en þú vistar.':'Vistun er ekki virk í þessari keyrslu.'} Óvistuð drög hverfa við endurhleðslu eða val annarrar bankafærslu.</p>
      <label className="block my-2">Foreldri · sendandi millifærslu
        <select aria-label="Skráð foreldri" className={style} value={parent} onChange={e=>{setParent(e.target.value);reset();}}>
          <option value="">Veldu einstakling eða sláðu inn nafn fyrir drög</option>
          {people.map(p=><option key={p.id} value={p.id}>{p.name} · #{p.id}</option>)}
        </select>
        {!parent && <input aria-label="Nafn foreldris í drögum" className={style} maxLength={120} value={parentName} onChange={e=>{setParentName(e.target.value);reset();}} />}
      </label>
      <label className="block my-2">Barn · greiddi innkaupin og tekur við millifærslu
        <select aria-label="Skráð barn" className={style} value={child} onChange={e=>{setChild(e.target.value);reset();}}>
          <option value="">Veldu einstakling eða sláðu inn nafn fyrir drög</option>
          {people.map(p=><option key={p.id} value={p.id}>{p.name} · #{p.id}</option>)}
        </select>
        {!child && <input aria-label="Nafn barns í drögum" className={style} maxLength={120} value={childName} onChange={e=>{setChildName(e.target.value);reset();}} />}
      </label>
      {(!parent || !child) && <p className="text-sm">Nöfn í drögum stofna ekki einstaklinga. Fyrir vistun þarf að velja tvo skráða einstaklinga þessa fyrirtækis.</p>}
      <label className="my-2 block">Innkaup barns / endurgreiðsla (kr.)
        <input inputMode="numeric" className={style} value={purchase} onChange={e=>{setPurchase(e.target.value);reset();}} />
      </label>
      <label className="my-2 block">Hvað keypti barnið fyrir foreldrið?
        <textarea className={style} maxLength={240} value={description} onChange={e=>{setDescription(e.target.value);reset();}} />
      </label>
      <label className="my-3 flex gap-2"><input type="checkbox" checked={confirmedDirection} onChange={e=>{setConfirmedDirection(e.target.checked);reset();}} />Þetta er útgreiðsla foreldris til barnsins vegna þessara innkaupa.</label>
      <button type="button" className="rounded border border-teal-700 px-3 py-2" onClick={review}>Sýna skiptingu</button>
      {error && <p role="alert" className="my-2 text-red-700">{error}</p>}
      {preview && <div data-testid="family-split-preview" className="my-3 rounded bg-teal-50 p-3" aria-live="polite">
        <strong>Óvistuð skipting · bankafærsla #{preview.bankTransactionId}</strong>
        <p>{preview.parentName} → {preview.childName}</p>
        <dl><dt>Endurgreiðsla innkaupa</dt><dd>{formatVisualAmount(String(preview.purchaseAmountIsk), 'ISK', 'is')}</dd>
          <dt>Gjöf til barns</dt><dd>{formatVisualAmount(String(preview.giftAmountIsk), 'ISK', 'is')}</dd>
          <dt>Samtals millifærsla</dt><dd>{formatVisualAmount(String(preview.totalAmountIsk), 'ISK', 'is')}</dd></dl>
        <p className="mt-2">{preview.description}</p>
        <button type="button" disabled={!storageEnabled||saving||savedId!==null||!preview.parentPersonId||!preview.childPersonId}
          onClick={save} className="mt-3 rounded bg-teal-800 px-3 py-2 text-white disabled:bg-slate-400">
          {saving?'Vista…':storageEnabled?'Vista skiptingu':'Vista skiptingu — ekki virkt í þessari keyrslu'}
        </button>
      </div>}
      </fieldset>
    </>}
  </section>;
}
