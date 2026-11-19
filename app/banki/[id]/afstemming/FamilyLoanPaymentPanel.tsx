'use client';

import { useState } from 'react';
import type { FamilyPerson } from '@/lib/personal-finance/transfer-split';
import { reviewFamilyLoanPayment, type FamilyLoanPaymentReview, type FamilyLoanPaymentReviewReason } from '@/lib/personal-finance/family-loan-payment-review';
import { formatVisualAmount } from '../../_lib/visual-reconciliation';
import { parseIskAmount as isk, parseBankDebitIsk as bankDebit, unallocatedIsk, previewFamilyLoanAllocation } from '@/lib/personal-finance/family-loan-draft-amounts';

const reasons: Record<FamilyLoanPaymentReviewReason, string> = {
  INVALID_INPUT: 'Ógildar eða ósamræmanlegar fjárhæðir eða auðkenni.',
  BANK_MOVEMENT_ALREADY_CLAIMED: 'Bankafærslan er þegar tengd annarri staðfestri ráðstöfun.',
  BANK_PAYEE_NOT_VERIFIED: 'Samband mótaðila bankans við lánveitanda er ekki staðfest.',
  LOAN_IDENTITY_NOT_VERIFIED: 'Samningur eða lánsnúmer hefur ekki verið staðfest.',
  CHILD_NOT_CONFIRMED_BORROWER: 'Ekki hefur verið staðfest að viðkomandi barn sé lántakandi.',
  PARENT_PAYMENT_NOT_VERIFIED: 'Ekki hefur verið staðfest að foreldrið sé greiðandi.',
  VEHICLE_ASSOCIATION_NOT_VERIFIED: 'Tengsl bíls við þetta lán eru óstaðfest.',
  PAYMENT_BREAKDOWN_UNVERIFIED: 'Sundurliðun úr greiðsluyfirliti lánveitanda vantar.',
  PAYMENT_COMPONENTS_UNEXPLAINED: 'Hluti greiðslunnar er ósundurliðaður.',
  FAMILY_ALLOCATION_UNCONFIRMED: 'Ákvörðun foreldris um gjöf/skuld liggur ekki fyrir.',
  FAMILY_ALLOCATION_UNRESOLVED: 'Hluti greiðslunnar er óflokkaður í fjölskylduuppgjöri.',
};

const style = 'mt-1 w-full rounded border border-slate-300 bg-white p-2 text-base';
const amount = (n: number) => formatVisualAmount(String(n), 'ISK', 'is');

type Props = {
  companyId: number;
  bankAccountId: number;
  transaction: { id: number; amount: string; date: string; text: string; bankStatus?: string | null };
  people: FamilyPerson[];
  canEdit: boolean;
  claimedReason: string | null;
};

/** Local review, not a source-of-truth loan register or a confirmation action. */
export default function FamilyLoanPaymentPanel({ companyId, bankAccountId, transaction, people, canEdit, claimedReason }: Props) {
  const [parent, setParent] = useState('');
  const [child, setChild] = useState('');
  const [loanId, setLoanId] = useState('');
  const [lenderId, setLenderId] = useState('');
  const [payeeVerified, setPayeeVerified] = useState(false);
  const [contractVerified, setContractVerified] = useState(false);
  const [parentPaid, setParentPaid] = useState(false);
  const [childBorrowerVerified, setChildBorrowerVerified] = useState(false);
  const [vehicle, setVehicle] = useState('');
  const [vehicleVerified, setVehicleVerified] = useState(false);
  const [principal, setPrincipal] = useState('');
  const [interest, setInterest] = useState('');
  const [indexation, setIndexation] = useState('');
  const [fees, setFees] = useState('');
  const [breakdownVerified, setBreakdownVerified] = useState(false);
  const [childReceivable, setChildReceivable] = useState('');
  const [gift, setGift] = useState('');
  const [allocationVerified, setAllocationVerified] = useState(false);
  const [statementDate, setStatementDate] = useState('');
  const [statementPrincipal, setStatementPrincipal] = useState('');
  const [statementVerified, setStatementVerified] = useState(false);
  const [result, setResult] = useState<FamilyLoanPaymentReview | null>(null);
  const [error, setError] = useState('');
  const change = (setter: (value: string) => void) => (event: { target: { value: string } }) => {
    setter(event.target.value); setResult(null); setError('');
  };
  const toggle = (setter: (value: boolean) => void) => (event: { target: { checked: boolean } }) => {
    setter(event.target.checked); setResult(null); setError('');
  };
  const blocked = claimedReason !== null || transaction.bankStatus !== 'UNRECONCILED';
  const debit = (() => { try { return bankDebit(transaction.amount); } catch { return null; } })();
  const lenderProgress = debit === null ? null : previewFamilyLoanAllocation(
    debit, [principal, interest, indexation, fees],
    'Sundurliðun til lánveitanda má ekki vera hærri en bankagreiðslan.',
  );
  const familyProgress = debit === null ? null : previewFamilyLoanAllocation(
    debit, [childReceivable, gift],
    'Skuld barns og gjöf mega saman ekki vera hærri en bankagreiðslan.',
  );

  function inspect() {
    setResult(null); setError('');
    try {
      if (!canEdit || blocked) throw Error(claimedReason ?? 'Bankafærslan er ekki laus til nýrrar flokkunar.');
      if (debit === null) throw Error('Þessi lánayfirferð á aðeins við útgreiðslur, ekki innkomnar afborganir.');
      if (!parent || !child || parent === child || !loanId.trim() || !lenderId.trim())
        throw Error('Veldu foreldri og barn og sláðu inn lánsnúmer og auðkenni lánveitanda.');
      if (!childBorrowerVerified) throw Error('Staðfestu sérstaklega að barnið sé lántakandi.');
      const parts = [principal, interest, indexation, fees].map(n => isk(n, true));
      const [p, i, idx, f] = parts;
      const remaining = unallocatedIsk(debit, parts, 'Sundurliðun til lánveitanda má ekki vera hærri en bankagreiðslan.');
      const receivable = isk(childReceivable, true);
      const granted = isk(gift, true);
      const familyRemaining = unallocatedIsk(debit, [receivable, granted], 'Skuld barns og gjöf mega saman ekki vera hærri en bankagreiðslan.');
      if ((statementDate && !statementPrincipal.trim()) || (!statementDate && statementPrincipal.trim()))
        throw Error('Skráðu bæði dagsetningu og eftirstöðvar samkvæmt yfirliti, eða hvorugt.');
      const statement = statementDate ? {
        verified: statementVerified,
        asOfDate: statementDate,
        outstandingPrincipalIsk: isk(statementPrincipal),
      } : null;
      // Both party IDs here are provisional user-supplied draft references, not
      // canonical identity resolution by the server. Never persist this result.
      const review = reviewFamilyLoanPayment({
        companyId, bankAccountId, bankTransactionId: transaction.id,
        date: transaction.date.slice(0, 10), signedBankAmountIsk: -debit,
        bankPayeeCanonicalPartyId: payeeVerified ? lenderId.trim() : null,
        payerPersonId: parentPaid ? parent : '', ownerPersonId: parent, childPersonId: child,
        loan: {
          canonicalObligationId: loanId.trim(), lenderCanonicalPartyId: lenderId.trim(),
          borrowerPersonId: childBorrowerVerified ? child : '', contractIdentityVerified: contractVerified,
          vehicleRegistration: vehicle.trim() || null, vehicleAssociationVerified: vehicleVerified,
          lenderStatement: statement,
        },
        breakdown: { principalIsk: p, interestIsk: i, paidIndexationIsk: idx,
          feesIsk: f, unexplainedIsk: remaining, sourceVerified: breakdownVerified },
        familyAllocation: { childOwesParentIsk: receivable, giftIsk: granted,
          unresolvedIsk: familyRemaining, ownerConfirmed: allocationVerified },
        // UI projection only; writes must re-read every claim from the DB.
        alreadyClaimedBankTransactionIds: blocked ? [transaction.id] : [],
      });
      setResult(review);
    } catch (e) { setError(e instanceof Error ? e.message : 'Ekki tókst að yfirfara lánagreiðsluna.'); }
  }

  return <section className="mt-4 space-y-3" aria-label="Yfirferð lánagreiðslu" data-testid="family-loan-review">
    <h3 className="font-semibold">Lán og bílalán · sundurliðun greiðslu</h3>
    <p className="text-sm">Bankafærsla #{transaction.id} · {transaction.text} · {amount(debit ?? 0)} út. Allar upplýsingar hér eru <strong>óvistuð drög</strong>. Bankagreiðsla til lánveitanda stofnar ekki sjálfkrafa skuld barns við foreldri.</p>
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm" role="status">
      Engin varanleg lánaskrá er enn tengd þessari síðu. Nafn eða auðkenni sem þú slærð inn hér er ekki sjálfvirkt sannreynt í bankanum. Vistun, bókun og afstemming eru óvirk.
    </p>
    {!canEdit ? <p>Aðeins notandi með afstemmingarheimild má undirbúa lánagreiningu.</p> : blocked ?
      <p role="status" className="rounded bg-amber-50 p-3">{claimedReason ?? 'Færslan er þegar afstemmd eða ekki laus til nýrrar ráðstöfunar.'}</p> : debit === null ?
      <p role="status" className="rounded bg-amber-50 p-3">Þessi færsla er ekki útgreiðsla. Endurgreiðsla barns af láni þarf að tengjast fyrirliggjandi skuldbindingu og er ekki færð hér.</p> :
      <div className="space-y-4">
        <fieldset className="space-y-2 rounded border p-3" onChange={() => { setResult(null); setError(''); }}>
          <legend className="px-1 font-semibold">1. Aðilar og skuldbinding</legend>
          <label className="block">Foreldri · greiðandi
            <select className={style} value={parent} onChange={change(setParent)}><option value="">Veldu skráðan einstakling</option>{people.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select>
          </label>
          <label className="block">Barn · lántakandi
            <select className={style} value={child} onChange={change(setChild)}><option value="">Veldu skráðan einstakling</option>{people.map(p => <option key={p.id} value={String(p.id)}>{p.name}</option>)}</select>
          </label>
          <label className="block">Auðkenni/lánsnúmer af lánasamningi
            <input className={style} value={loanId} maxLength={100} onChange={change(setLoanId)} placeholder="Ekki giska á lánsnúmer" />
          </label>
          <label className="block">Auðkenni lánveitanda úr yfirförnum gögnum
            <input className={style} value={lenderId} maxLength={100} onChange={change(setLenderId)} placeholder="Ekki sjálfvirkt staðfest" />
          </label>
          <label className="block">Bílnúmer (ef þetta er bílalán)
            <input className={style} value={vehicle} maxLength={20} onChange={change(setVehicle)} placeholder="Valfrjálst fyrir önnur lán" />
          </label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={contractVerified} onChange={toggle(setContractVerified)} />Lánasamningur og númer yfirfarin</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={parentPaid} onChange={toggle(setParentPaid)} />Ég hef staðfest að foreldrið greiddi þessa færslu</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={childBorrowerVerified} onChange={toggle(setChildBorrowerVerified)} />Ég hef staðfest að barnið sé lántakandi</label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={payeeVerified} onChange={toggle(setPayeeVerified)} />Ég hef borið mótaðila bankafærslu saman við lánveitanda í frumgögnum</label>
          {vehicle.trim() && <label className="flex items-start gap-2"><input type="checkbox" checked={vehicleVerified} onChange={toggle(setVehicleVerified)} />Ég hef staðfest að þetta lán tengist bílnum á greiðsludegi</label>}
        </fieldset>
        <fieldset className="space-y-2 rounded border p-3">
          <legend className="px-1 font-semibold">2. Hvað fékk lánveitandinn? {amount(debit)}</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {([
              ['Höfuðstóll','principal',principal,setPrincipal], ['Vextir','interest',interest,setInterest],
              ['Greiddar verðbætur','indexation',indexation,setIndexation], ['Gjöld','fees',fees,setFees],
            ] as const).map(([label,id,value,setter]) => <label className="block" key={id}>{label} (kr.)
              <input inputMode="numeric" className={style} value={value} onChange={change(setter)} placeholder="0" />
            </label>)}
          </div>
          <label className="flex items-start gap-2"><input type="checkbox" checked={breakdownVerified} onChange={toggle(setBreakdownVerified)} />Sundurliðun yfirfarin í greiðsluyfirliti lánveitanda</label>
          <p className="text-sm">Óútskýrðar krónur eru reiknaðar sem mismunur. Þeim er ekki sjálfkrafa úthlutað á höfuðstól.</p>
        </fieldset>
        <fieldset className="space-y-2 rounded border p-3">
          <legend className="px-1 font-semibold">3. Hvað á barnið að endurgreiða foreldri?</legend>
          <p className="text-sm">Þetta er sérstök ákvörðun, óháð því hvernig lánveitandinn skiptir greiðslunni.</p>
          <label className="block">Ný skuld barns við foreldri (kr.)
            <input inputMode="numeric" className={style} value={childReceivable} onChange={change(setChildReceivable)} placeholder="0" />
          </label>
          <label className="block">Gjöf/aðstoð án endurgreiðslukröfu (kr.)
            <input inputMode="numeric" className={style} value={gift} onChange={change(setGift)} placeholder="0" />
          </label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={allocationVerified} onChange={toggle(setAllocationVerified)} />Ég hef sérstaklega ákveðið skiptinguna fyrir fjölskylduuppgjörið</label>
          <p className="text-sm">Óráðstafaður hluti er áfram óviss; hann telst hvorki skuld barns né gjöf.</p>
        </fieldset>
        <fieldset className="space-y-2 rounded border p-3">
          <legend className="px-1 font-semibold">4. Staða hjá lánveitanda (ef yfirlit er til)</legend>
          <label className="block">Dagsetning yfirlits
            <input type="date" className={style} value={statementDate} onChange={change(setStatementDate)} />
          </label>
          <label className="block">Eftirstöðvar höfuðstóls samkvæmt yfirliti (kr.)
            <input inputMode="numeric" className={style} value={statementPrincipal} onChange={change(setStatementPrincipal)} placeholder="Ekki reiknað út frá afborgun" />
          </label>
          <label className="flex items-start gap-2"><input type="checkbox" checked={statementVerified} onChange={toggle(setStatementVerified)} />Eftirstöðvar staðfestar með yfirliti lánveitanda</label>
        </fieldset>
        {lenderProgress && familyProgress && <aside className="rounded border border-teal-300 bg-teal-50 p-3" aria-label="Staða óvistaðrar sundurliðunar" data-testid="family-loan-live-progress">
          <h4 className="font-semibold">Sundurliðun jafnóðum · {amount(debit)}</h4>
          <div className="mt-2 grid gap-3 text-sm sm:grid-cols-2" aria-live="polite">
            <div>
              <strong>Til lánveitanda</strong>
              {lenderProgress.error ? <p className="font-semibold text-red-800" role="alert">{lenderProgress.error}</p> : <>
                <p>Sundurliðað: {amount(lenderProgress.allocatedIsk!)}</p>
                <p>Ósundurliðað: <strong>{amount(lenderProgress.remainingIsk!)}</strong></p>
              </>}
            </div>
            <div>
              <strong>Milli foreldris og barns</strong>
              {familyProgress.error ? <p className="font-semibold text-red-800" role="alert">{familyProgress.error}</p> : <>
                <p>Skuld + gjöf: {amount(familyProgress.allocatedIsk!)}</p>
                <p>Óflokkað: <strong>{amount(familyProgress.remainingIsk!)}</strong></p>
              </>}
            </div>
          </div>
          <p className="mt-2 text-xs font-medium text-slate-700">Þetta er aðeins reikningur úr óvistuðum drögum. Skuld barns, staða hjá lánveitanda og bókun breytast ekki.</p>
        </aside>}
        <button type="button" onClick={inspect} className="rounded bg-teal-800 px-4 py-2 font-semibold text-white">Yfirfara sundurliðun (ekki vista)</button>
        {error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
        {result && <section className="space-y-2 rounded border border-teal-300 bg-teal-50 p-3" role="status" data-testid="family-loan-review-result">
          <h4 className="font-semibold">Niðurstaða óvistaðra draga</h4>
          <p>Greitt til lánveitanda: <strong>{amount(result.paidToLenderIsk)}</strong></p>
          <p>Höfuðstóll: {amount(result.loanPayment.principalIsk)} · vextir: {amount(result.loanPayment.interestIsk)} · verðbætur: {amount(result.loanPayment.paidIndexationIsk)} · gjöld: {amount(result.loanPayment.feesIsk)}</p>
          <p>Ósundurliðað hjá lánveitanda: <strong>{amount(result.loanPayment.unexplainedIsk)}</strong></p>
          <p>Ný hugsanleg skuld barns við foreldri: <strong>{amount(result.family.childOwesParentIsk)}</strong></p>
          <p>Gjöf: {amount(result.family.giftIsk)} · óflokkað: {amount(result.family.unresolvedIsk)}</p>
          <p>Eftirstöðvar hjá lánveitanda: <strong>{result.lenderBalance ? `${amount(result.lenderBalance.outstandingPrincipalIsk)} (${result.lenderBalance.asOfDate})` : 'Ekki staðfestar'}</strong></p>
          {result.reasons.length ? <><p className="font-semibold">Atriði sem krefjast yfirferðar:</p><ul className="list-disc pl-5">{result.reasons.map(reason => <li key={reason}>{reasons[reason]}</li>)}</ul></> :
            <p>Innsláttur stenst útreikning og yfirlýsta yfirferð. <strong>Þetta staðfestir ekki auðkenni í gagnagrunni og er ekki vistun eða samþykki láns.</strong></p>}
          <p className="text-sm font-semibold">Drögin eru ekki skráð í skuldayfirlit og hafa engin áhrif á eftirstöðvar.</p>
        </section>}
      </div>}
  </section>;
}
