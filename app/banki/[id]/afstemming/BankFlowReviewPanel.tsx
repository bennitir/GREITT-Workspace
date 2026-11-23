"use client";

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { SavedOwnTransfer } from '@/lib/financial-reconciliation/own-account-transfer-service';
import type { OwnTransferActionResult } from './internal-transfer-actions';
import type { InternalTransferReviewResult } from '@/lib/personal-finance/internal-transfer-evidence';
import { formatCounterBankDate } from './format-counter-bank-date';
import BankAccountOwnerPanel from './BankAccountOwnerPanel';
import type { BankAccountOwnerReviewResult } from './internal-transfer-actions';

const translations = {
  is: {
    title: 'Hvaðan og hvert fór greiðslan?', source: 'Reikningur sem færslan tilheyrir',
    incoming: 'Innborgun á þennan reikning', outgoing: 'Útgreiðsla af þessum reikningi', unknownDirection: 'Óstaðfest greiðslustefna',
    target: 'Reikningur mótaðila', unknown: 'Ekki staðfestur í fyrirliggjandi færslugögnum',
    bankText: 'Texti á bankafærslu (ekki staðfestur viðtakandi)',
    explain: 'Nafn í bankatexta sannar ekki hver á móttökureikninginn. Millifærsla milli eigin reikninga er hvorki lán né gjöf.',
    look: 'Leita að mögulegri mótfærslu á öðrum reikningi sama fyrirtækis',
    looking: 'Leita í skráðum reikningum…',
    noHits: 'Engin mótfærsla fannst á öðrum skráðum reikningi sama fyrirtækis innan þriggja daga. Það útilokar ekki millifærslu á reikning sem vantar hér.',
    hits: 'Mögulegar mótfærslur til yfirferðar',
    warning: 'Sama fjárhæð, gagnstætt formerki og nálæg dagsetning eru vísbendingar. Bókarinn velur og staðfestir pörunina; engin sjálfvirk bókun.',
    more: 'Fleiri færslur gætu passað; niðurstaðan er ekki tæmandi.',
    fail: 'Ekki tókst að ljúka skrifvarinni athugun. Engin breyting varð á gögnum.',
    missingAccount: 'Reikningsnúmer ekki skráð', bankMovement: 'Bankafærsla',
    noReceiptNeeded: 'Fyrir eigin millifærslu milli skráðra reikninga sama eiganda þarf ekki sérstakt fylgiskjal. Bankahreyfingarnar tvær nægja.',
    choose: 'Velja mótfærslu', selected: 'Staðfesting eigin millifærslu', confirm: 'Tengja sem eigin millifærslu', confirmed: 'Eigin millifærsla staðfest', confirmedDetails: 'Báðar færslur eru tengdar. Engin gjalda-, tekju-, lána- eða gjafabókun var gerð.', undo: 'Afturkalla tengingu', undoReason: 'Ástæða afturköllunar (að minnsta kosti 8 stafir)', undoButton: 'Afturkalla með aðgerðasögu', locked: 'Vistun er ekki virk í þessu umhverfi. Val og yfirferð eru möguleg, en engin staðfesting eða afturköllun er skrifuð.', noMatchStatus: 'Þessi mótfærsla er þegar afstemmd og ekki tiltæk til pörunar.', failedSave: 'Ekki var hægt að staðfesta pörunina. Engum gögnum var breytt.', saved: 'Tenging staðfest. Uppfæri yfirlit…', chooseHint: 'Báðar færslur og reikningar eru sýndir hér til yfirferðar. Pörunin verður aldrei gerð sjálfkrafa.', otherSide: 'Hin hlið millifærslunnar',
  },
  en: {
    title: 'Where did this payment go?', source: 'Account containing this transaction',
    incoming: 'Incoming to this account', outgoing: 'Outgoing from this account', unknownDirection: 'Direction unverified',
    target: 'Counterparty account', unknown: 'Not verified from available transaction data',
    bankText: 'Bank transaction text (not a verified recipient)',
    explain: 'A name in the bank text does not prove account ownership. A transfer between your own accounts is neither a loan nor a gift.',
    look: 'Look for possible opposite entry on another account of this company', looking: 'Searching recorded accounts…',
    noHits: 'No opposite entry found within three days on other accounts of this company. An unlisted account is still possible.',
    hits: 'Possible opposite entries for review',
    warning: 'Matching amount and opposite sign are suggestions only. The bookkeeper chooses and confirms the pair; no automatic booking.',
    more: 'More entries may match; this is not exhaustive.', fail: 'Read-only check failed; no data was changed.',
    missingAccount: 'Account number not recorded', bankMovement: 'Bank transaction',
    noReceiptNeeded: 'No separate receipt is needed for transfers between registered accounts of the same owner; the two bank entries suffice.',
    choose: 'Select opposite entry', selected: 'Confirm own-account transfer', confirm: 'Link as own-account transfer', confirmed: 'Own-account transfer confirmed', confirmedDetails: 'Both entries are linked. No expense, income, loan or gift was posted.', undo: 'Undo link', undoReason: 'Reason for undo (at least 8 characters)', undoButton: 'Undo with audit trail', locked: 'Saving is disabled in this environment. You can inspect the match, but no confirmation or undo is written.', noMatchStatus: 'This entry is already reconciled and cannot be paired.', failedSave: 'Could not confirm the transfer. No data was changed.', saved: 'Link confirmed. Refreshing…', chooseHint: 'Review both movements and accounts. No automatic matching.', otherSide: 'Opposite entry',
  },
  pl: {
    title: 'Skąd i dokąd trafiła płatność?', source: 'Rachunek tej transakcji',
    incoming: 'Wpływ na ten rachunek', outgoing: 'Wypływ z tego rachunku', unknownDirection: 'Kierunek niepotwierdzony',
    target: 'Rachunek drugiej strony', unknown: 'Niepotwierdzony w dostępnych danych transakcji',
    bankText: 'Opis transakcji (nie potwierdza odbiorcy)',
    explain: 'Nazwisko w opisie nie potwierdza właściciela rachunku. Przelew między własnymi rachunkami nie jest pożyczką ani darowizną.',
    look: 'Szukaj możliwej transakcji przeciwnej na innym rachunku tej firmy', looking: 'Wyszukiwanie…',
    noHits: 'Nie znaleziono przeciwnej transakcji na innych rachunkach tej firmy w ciągu trzech dni. Inny rachunek może nie być zarejestrowany.',
    hits: 'Możliwe transakcje przeciwne do sprawdzenia',
    warning: 'Kwota, przeciwny znak i zbliżona data to tylko wskazówki. Właściciel i odbiorca NIE są potwierdzeni. Bez automatycznej klasyfikacji i zapisu.',
    more: 'Mogą istnieć dalsze pasujące transakcje.', fail: 'Nie udało się wykonać odczytu. Nie zmieniono danych.',
    missingAccount: 'Brak numeru rachunku', bankMovement: 'Transakcja',
    noReceiptNeeded: 'Przelew między własnymi rachunkami nie wymaga faktury. Dowodem są oba zapisy bankowe i potwierdzone właścicielstwo.',
    choose: 'Wybierz drugą transakcję', selected: 'Potwierdzenie przelewu własnego', confirm: 'Połącz jako przelew własny', confirmed: 'Przelew własny potwierdzony', confirmedDetails: 'Obie transakcje są połączone, bez księgowania kosztu, przychodu, pożyczki lub darowizny.', undo: 'Cofnij połączenie', undoReason: 'Przyczyna cofnięcia (min. 8 znaków)', undoButton: 'Cofnij z zapisem audytowym', locked: 'Zapis wyłączony w tym środowisku. Można sprawdzić, ale nie potwierdzić ani cofnąć.', noMatchStatus: 'Ta transakcja jest już uzgodniona.', failedSave: 'Nie udało się potwierdzić. Nie zmieniono danych.', saved: 'Połączono. Odświeżanie…', chooseHint: 'Sprawdź oba rachunki i transakcje; bez automatycznego łączenia.', otherSide: 'Druga strona przelewu',
  },
  sr: {
    title: 'Odakle i gde je otišla uplata?', source: 'Račun ove transakcije',
    incoming: 'Uplata na ovaj račun', outgoing: 'Isplata sa ovog računa', unknownDirection: 'Smer nije potvrđen',
    target: 'Račun druge strane', unknown: 'Nije potvrđeno dostupnim podacima',
    bankText: 'Opis bankarske transakcije (nije potvrđen primalac)',
    explain: 'Ime u opisu ne dokazuje vlasništvo nad računom. Prenos između sopstvenih računa nije zajam ni poklon.',
    look: 'Pronađi mogući suprotni unos na drugom računu iste firme', looking: 'Pretraga računa…',
    noHits: 'Nema suprotnog unosa u roku od tri dana na drugim računima iste firme. Drugi račun možda nije evidentiran.',
    hits: 'Mogući suprotni unosi za proveru',
    warning: 'Iznos, suprotan znak i blizak datum su samo naznake. Vlasništvo i odredište NISU potvrđeni. Bez automatskog knjiženja ili čuvanja.',
    more: 'Moguće je da postoje dodatni unosi.', fail: 'Provera nije uspela; podaci nisu izmenjeni.',
    missingAccount: 'Broj računa nije evidentiran', bankMovement: 'Transakcija',
    noReceiptNeeded: 'Za potvrđen prenos između sopstvenih računa nije potreban račun. Dokazi su dve bankarske stavke i potvrđeno vlasništvo.',
    choose: 'Izaberi suprotnu stavku', selected: 'Potvrda prenosa između sopstvenih računa', confirm: 'Poveži kao sopstveni prenos', confirmed: 'Sopstveni prenos potvrđen', confirmedDetails: 'Obe stavke su povezane; ništa nije knjiženo kao trošak, prihod, zajam ili poklon.', undo: 'Poništi vezu', undoReason: 'Razlog poništavanja (najmanje 8 znakova)', undoButton: 'Poništi uz evidenciju', locked: 'Upis nije dozvoljen u ovom okruženju. Pregled je moguć, potvrda nije.', noMatchStatus: 'Stavka je već usaglašena.', failedSave: 'Povezivanje nije uspelo. Podaci nisu promenjeni.', saved: 'Povezano. Osvežavam…', chooseHint: 'Proveri obe stavke i račune. Bez automatskog povezivanja.', otherSide: 'Druga stavka',
  },
} as const;

export default function BankFlowReviewPanel({ language, bankAccountId, bankAccountName, bankAccountNumber,
  bankTransactionId, bankAmount, bankText, inspectAction, saved, confirmEnabled, confirmAction, voidAction,
  ownerReviewAction, onBeginOwnTransferReview }: {
  language: string; bankAccountId: number; bankAccountName: string; bankAccountNumber: string | null;
  bankTransactionId: number; bankAmount: string; bankText: string;
  inspectAction: (bankAccountId: number, transactionId: number) => Promise<InternalTransferReviewResult>;
  saved?: SavedOwnTransfer;
  confirmEnabled: boolean;
  confirmAction: (bankAccountId: number, sourceId: number, targetId: number) => Promise<OwnTransferActionResult>;
  voidAction: (bankAccountId: number, reconciliationId: number, reason: string) => Promise<OwnTransferActionResult>;
  ownerReviewAction: (sourceAccountId: number, targetAccountId: number) => Promise<BankAccountOwnerReviewResult>;
  onBeginOwnTransferReview?: () => void;
}) {
  const t = translations[language as keyof typeof translations] ?? translations.is;
  const router = useRouter();
  const [result, setResult] = useState<InternalTransferReviewResult | null>(null);
  const [chosenId, setChosenId] = useState<number | null>(null);
  const [accountOwnersMatch, setAccountOwnersMatch] = useState(false);
  const [voidReason, setVoidReason] = useState('');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const amount = Number(bankAmount);
  const direction = !Number.isFinite(amount) || amount === 0 ? t.unknownDirection : amount < 0 ? t.outgoing : t.incoming;
  function inspect() {
    // An own-transfer review must not leave an unrelated automatic receipt preview on screen.
    onBeginOwnTransferReview?.();
    setResult(null); setChosenId(null); setAccountOwnersMatch(false); setActionMessage(null);
    startTransition(async () => {
      try { setResult(await inspectAction(bankAccountId, bankTransactionId)); }
      catch { setResult({ ok: false, code: 'UNAVAILABLE' }); }
    });
  }
  function confirmSelected() {
    if (!confirmEnabled || !chosenId || !accountOwnersMatch || saved) return;
    setActionMessage(null);
    startTransition(async () => {
      try {
        const response = await confirmAction(bankAccountId, bankTransactionId, chosenId);
        if (!response.ok) { setActionMessage(`${t.failedSave} (${response.code})`); return; }
        setActionMessage(t.saved); router.refresh();
      } catch { setActionMessage(t.failedSave); }
    });
  }
  function undoSelected() {
    if (!confirmEnabled || !saved || voidReason.trim().length < 8) return;
    setActionMessage(null);
    startTransition(async () => {
      try {
        const response = await voidAction(bankAccountId, saved.id, voidReason.trim());
        if (!response.ok) { setActionMessage(`${t.failedSave} (${response.code})`); return; }
        setActionMessage(t.saved); router.refresh();
      } catch { setActionMessage(t.failedSave); }
    });
  }
  const chosen = result?.ok ? result.matches.find(hit => hit.transactionId === chosenId) : undefined;
  return <section data-testid="bank-flow-read-only" className="mt-3 rounded-lg border border-slate-300 bg-slate-50 p-3 text-sm">
    <h4 className="font-semibold text-slate-900">{t.title}</h4>
    <p className="mt-1 font-medium text-slate-800">{direction}</p>
    <dl className="mt-2 space-y-2">
      <div><dt className="font-semibold">{t.source}</dt><dd className="break-words">{bankAccountName} · {bankAccountNumber || t.missingAccount}</dd></div>
      <div><dt className="font-semibold">{t.target}</dt><dd className={saved ? "font-semibold text-emerald-900" : "font-semibold text-amber-900"}>{saved ? <>{t.confirmed}: {saved.oppositeBankAccountName} · {saved.oppositeBankAccountNumber || t.missingAccount}</> : t.unknown}</dd></div>
      <div><dt className="font-semibold">{t.bankText}</dt><dd className="break-words">{bankText}</dd></div>
    </dl>
    <p className="mt-2 text-xs text-slate-700">{t.explain}</p>
    {saved && <section data-testid="own-transfer-saved" className="mt-3 rounded border border-emerald-400 bg-emerald-50 p-3">
      <strong>{t.confirmed} #{saved.id}</strong>
      <p className="mt-1">{t.otherSide}: #{saved.oppositeTransactionId} · {saved.oppositeBankAccountName} · {saved.oppositeBankAccountNumber || t.missingAccount}</p>
      <p className="mt-1 text-xs">{formatCounterBankDate(saved.confirmedAt, language)} · {saved.amount} ISK · {t.confirmedDetails}</p>
      <label className="mt-3 block text-sm font-semibold">{t.undoReason}
        <textarea value={voidReason} onChange={e => setVoidReason(e.target.value)} maxLength={500} rows={2}
          className="mt-1 block w-full rounded border border-slate-300 bg-white p-2" />
      </label>
      <button type="button" onClick={undoSelected} disabled={!confirmEnabled || pending || voidReason.trim().length < 8}
        className="mt-2 rounded border border-amber-800 bg-white px-3 py-2 font-semibold text-amber-950 disabled:opacity-50">{t.undoButton}</button>
    </section>}
    {!saved && <button type="button" onClick={inspect} disabled={pending}
      className="mt-3 rounded border border-teal-700 bg-white px-3 py-2 font-semibold text-teal-900 disabled:opacity-60">
      {pending ? t.looking : t.look}
    </button>}
    {result && <div className="mt-3" role="status" aria-live="polite">
      {!result.ok ? <p className="text-amber-900">{t.fail}</p> : <>
        <p className="font-semibold">{result.matches.length ? t.hits : t.noHits}</p>
        {result.matches.length > 0 && <ul className="mt-2 space-y-2">
          {result.matches.map(hit => <li key={hit.transactionId} className="rounded border border-slate-200 bg-white p-2">
            <p className="font-semibold">{hit.bankAccountName} · {hit.bankAccountNumber || t.missingAccount}</p>
            <p>{t.bankMovement} #{hit.transactionId} · {formatCounterBankDate(hit.date, language)} · {hit.amount} ISK</p>
            <p className="break-words text-slate-700">{hit.text}</p>
            {hit.status !== 'UNRECONCILED' ? <p className="mt-1 text-xs text-amber-900">{t.noMatchStatus}</p> :
              <button type="button" onClick={() => {setChosenId(hit.transactionId); setAccountOwnersMatch(false); setActionMessage(null);}}
                className="mt-2 rounded border border-teal-700 px-2 py-1 text-teal-900" aria-pressed={chosenId === hit.transactionId}>{t.choose}</button>}
          </li>)}
        </ul>}
        {chosen && <section data-testid="own-transfer-confirm-preview" className="mt-3 rounded border border-teal-300 bg-teal-50 p-3">
          <h5 className="font-bold">{t.selected}</h5>
          <p className="mt-1">#{bankTransactionId}: {bankAccountName} · {bankAmount} ISK</p>
          <p>#{chosen.transactionId}: {chosen.bankAccountName} · {chosen.amount} ISK</p>
          <p className="mt-1 text-xs">{t.chooseHint}</p>
          <p className="mt-2 text-xs text-slate-700">{t.noReceiptNeeded}</p>
          <BankAccountOwnerPanel key={`${bankAccountId}:${chosen.bankAccountId}`}
            language={language} sourceAccountId={bankAccountId}
            targetAccountId={chosen.bankAccountId} sourceName={bankAccountName}
            targetName={chosen.bankAccountName}
            reviewAction={ownerReviewAction} onPairableChange={setAccountOwnersMatch} />
          <button type="button" onClick={confirmSelected} disabled={!accountOwnersMatch || !confirmEnabled || pending}
            className="mt-3 rounded bg-teal-800 px-3 py-2 font-semibold text-white disabled:opacity-50">{t.confirm}</button>
        </section>}
        {result.matches.length > 0 && <p className="mt-2 text-xs font-semibold text-amber-900">{t.warning}</p>}
        {result.truncated && <p className="mt-2 text-xs text-amber-900">{t.more}</p>}
      </>}
    </div>}
    {!confirmEnabled && <p className="mt-3 text-xs font-semibold text-amber-900" data-testid="own-transfer-storage-disabled">{t.locked}</p>}
    {actionMessage && <p className="mt-2 rounded border border-slate-200 p-2" role="status">{actionMessage}</p>}
  </section>;
}
