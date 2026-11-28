'use client';
import { useMemo } from 'react';
import type { FamilyPerson } from '@/lib/personal-finance/transfer-split';
import type { SavedFamilyTransfer } from '@/lib/personal-finance/transfer-split-repository';
import type { JournalSnapshot } from '@/lib/personal-finance/family-loan-journal-contract';
import { buildFamilyOverview } from '@/lib/personal-finance/family-overview';

const kr = (value: string | null) => value === null ? 'Óstaðfest' :
  `${new Intl.NumberFormat('is-IS', {maximumFractionDigits:0}).format(BigInt(value))} kr.`;

/** This is a read-only view of already confirmed records, never of guessed bank transfers. */
export default function FamilyOverviewPanel({ people, savedTransfers, storageEnabled,
  journalSnapshot, loanRegistryCount, loanRegistryTruncated, bankAccountId, previewOnly = false }: {
  people: FamilyPerson[];
  savedTransfers: SavedFamilyTransfer[];
  storageEnabled: boolean;
  journalSnapshot: JournalSnapshot | null;
  loanRegistryCount: number;
  loanRegistryTruncated: boolean;
  bankAccountId: number;
  previewOnly?: boolean;
}) {
  const overview = useMemo(() => buildFamilyOverview({
    people, transfers: savedTransfers, transfersAvailable: storageEnabled,
    journal: journalSnapshot,
  }), [people,savedTransfers,storageEnabled,journalSnapshot]);
// No family records are loaded when the company module is disabled. The preview
// is owner-only and intentionally displays UNKNOWN rather than fabricated zeroes.
if (previewOnly) {
  return <section className="mt-3 space-y-3" aria-label="Yfirlit eftir barni í lesham" data-testid="family-overview-readonly">
    <h3 className="text-lg font-bold text-slate-900">Yfirlit eftir barni</h3>
    <p className="text-sm text-slate-700">Leshamur. Fjölskyldueiningin er óvirk fyrir þetta fyrirtæki og staðfest fjölskyldugögn eru ekki sótt. Engin færsla er flokkuð eftir nafni á bankahreyfingu.</p>
    <div className="grid gap-2 sm:grid-cols-3">
      {['Skuld barna við foreldri', 'Gjafir til barna', 'Endurgreidd innkaup'].map(label =>
        <div key={label} className="rounded-lg border border-slate-300 bg-white p-3">
          <p className="text-sm font-semibold text-slate-700">{label}</p>
          <p className="mt-2 text-lg font-bold text-amber-900">Óstaðfest</p>
        </div>)}
    </div>
    <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="status">
      Staða eftir barni verður sýnd þegar fjölskyldueiningin hefur heimilaðan lesaðgang að staðfestum tengslum.
      Engin lán, gjafir eða endurgreiðslur eru ályktuð af bankatexta. Engin vistun, bókun eða afstemming er möguleg í þessum lesham.
    </p>
  </section>;
}
  return <section className="mt-4 space-y-4" aria-label="Fjölskylduyfirlit" data-testid="family-overview">
    <header className="space-y-2">
      <h3 className="text-xl font-bold text-slate-900">Fjölskylduyfirlit</h3>
      <p className="text-base text-slate-700">Lesyfirlit yfir staðfestar tengingar. Hér verður ekkert lán eða gjöf til út frá nafni á bankafærslu.</p>
    </header>
    <div className="grid gap-3 sm:grid-cols-3">
      <article className="rounded-lg border border-slate-300 bg-white p-4">
        <p className="text-sm font-semibold text-slate-700">Skuld barna við foreldri</p>
        <p className="mt-2 text-xl font-bold" data-testid="family-overview-debt">{kr(overview.outstandingIsk)}</p>
        <p className="mt-2 text-sm text-slate-600">Aðeins staðfest innri lánasaga, ekki skuldir við banka.</p>
      </article>
      <article className="rounded-lg border border-slate-300 bg-white p-4">
        <p className="text-sm font-semibold text-slate-700">Gjafir til barna</p>
        <p className="mt-2 text-xl font-bold" data-testid="family-overview-gifts">{kr(overview.giftIsk)}</p>
        <p className="mt-2 text-sm text-slate-600">Aðeins vistaðar skiptingar á bankareikningi #{bankAccountId}.</p>
      </article>
      <article className="rounded-lg border border-slate-300 bg-white p-4">
        <p className="text-sm font-semibold text-slate-700">Endurgreidd innkaup</p>
        <p className="mt-2 text-xl font-bold" data-testid="family-overview-reimbursement">{kr(overview.reimbursementIsk)}</p>
        <p className="mt-2 text-sm text-slate-600">Endurgreiðslur foreldris til barna, ekki lánsfjárhæðir.</p>
      </article>
    </div>
    {!overview.loanDataAvailable && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      Staðfest fjölskyldulánasaga er ekki aðgengileg í þessari keyrslu. Því eru eftirstöðvar óstaðfestar, ekki 0 kr.
    </p>}
    {!overview.splitDataAvailable && <p role="status" className="rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
      {overview.invalidSplitData ? 'Misræmi í vistuðum skiptingum. Summur úr þeim eru ekki sýndar.' :
        'Vistun og lestur fjölskylduskiptinga eru ekki virk í þessari keyrslu. Gjafir og endurgreiðslur eru óstaðfestar.'}
    </p>}
    <section aria-label="Staða eftir barni" className="space-y-3">
      <h4 className="text-lg font-bold">Staða eftir barni</h4>
      {!overview.rows.length ? <p className="rounded border p-3 text-base">
        Engin staðfest tenging við barn er aðgengileg enn. {overview.peopleCount} einstaklingar eru skráðir í fyrirtækinu,
        en þeir eru ekki sjálfkrafa taldir börn eða skuldarar.
      </p> : <div className="grid gap-3 xl:grid-cols-2">
        {overview.rows.map(child => <article key={child.childPersonId} className="rounded-lg border border-teal-300 bg-white p-4">
          <h5 className="text-lg font-bold">{child.name}</h5>
          <p className="text-xs text-slate-600">Einstaklingur #{child.childPersonId}</p>
          <dl className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 text-sm sm:text-base">
            <dt>Skuld við foreldri</dt><dd className="text-right font-semibold">{kr(child.outstandingIsk)}</dd>
            <dt>Lánveitt samkvæmt lánasögu</dt><dd className="text-right">{kr(child.advancedIsk)}</dd>
            <dt>Afborganir samkvæmt lánasögu</dt><dd className="text-right">{kr(child.repaidIsk)}</dd>
            <dt>Gjafir frá foreldri</dt><dd className="text-right">{kr(child.giftIsk)}</dd>
            <dt>Endurgreidd innkaup</dt><dd className="text-right">{kr(child.reimbursementIsk)}</dd>
          </dl>
          <p className="mt-2 text-xs text-slate-600">Skráð lán: {overview.loanDataAvailable ? child.loanCount : 'Óstaðfest'} · Vistaðar skiptingar á þessum reikningi: {overview.splitDataAvailable ? child.splitCount : 'Óstaðfest'}</p>
        </article>)}
      </div>}
    </section>
    <details className="rounded border border-slate-300 p-3">
      <summary className="cursor-pointer font-semibold">Skráðir einstaklingar og önnur lánagögn</summary>
      <p className="mt-2 text-sm">{overview.peopleCount} virkir einstaklingar skráðir í fyrirtækinu. Tengsl þeirra við börn eru aðeins sýnd þegar þau eru staðfest í lánasögu eða fjölskylduskiptingu.</p>
      <p className="mt-2 text-sm">Skráð lán í Innsýn: {loanRegistryCount}{loanRegistryTruncated ? ' eða fleiri (listi takmarkaður)' : ''}. Þau eru ekki sjálfkrafa skuldir barns og ekki lögð við eftirstöðvar hér.</p>
      {!!people.length && <ul className="mt-2 list-inside list-disc text-sm">{people.map(p => <li key={p.id}>{p.name} (#{p.id})</li>)}</ul>}
    </details>
    <p className="text-sm text-slate-600">Tölur fyrir gjafir og innkaup ná aðeins til núverandi bankareiknings. Lánasaga, þegar hún er tiltæk, nær til fyrirtækisins. Þessar mismunandi heimildir eru ekki lagðar saman í eina stöðu. Engin sjálfvirk bókun.</p>
  </section>;
}
