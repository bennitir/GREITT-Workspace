'use client';

import type { FamilyLoanRegistryRow } from '@/lib/personal-finance/family-loan-registry';

/** Authoritative identity links only. No balances are invented from a bank movement. */
export default function FamilyLoanRegistryPanel({ loans, truncated }: { loans: FamilyLoanRegistryRow[]; truncated: boolean }) {
  return <section className="mt-4 space-y-3" aria-label="Yfirlit skráðra lána" data-testid="family-loan-registry">
    <h3 className="text-lg font-semibold">Skráð lán og bílalán</h3>
    <p className="text-sm">Sýnir lán sem þegar eru skráð í Innsýn hjá þessu fyrirtæki og aðeins staðfest tengsl við aðila og bíla. Skráð lánsnúmer er ekki staðfesting á lánasamningi. Staðfest skuld barns við foreldri og eftirstöðvar hjá lánveitanda eru aðskilin atriði.</p>
    {truncated && <p role="status" className="rounded bg-amber-50 p-2 text-amber-900">Yfirlitið sýnir aðeins fyrstu 500 lánin. Ekki nota það sem tæmandi skrá.</p>}
    {!loans.length ? <p className="rounded border border-amber-300 bg-amber-50 p-3" role="status">Engin virk lán fundust í staðfestri lánaskrá Innsýnar fyrir þetta fyrirtæki. Bankafærslur einar og sér stofna ekki lán.</p> : <div className="space-y-3">
      <p className="font-semibold">{loans.length} skráð lán</p>
      {loans.map(loan => <article key={loan.id} className="rounded border border-slate-300 bg-white p-3">
        <h4 className="font-semibold">{loan.name} · #{loan.id}</h4>
        <dl className="mt-2 grid grid-cols-1 gap-x-5 gap-y-1 text-sm sm:grid-cols-2">
          <dt className="text-slate-600">Skráð lánsnúmer</dt><dd>{loan.identifier ?? 'Óstaðfest'}</dd>
          <dt className="text-slate-600">Lántaki</dt><dd>{loan.borrower ?? 'Óstaðfestur'}</dd>
          <dt className="text-slate-600">Lánveitandi</dt><dd>{loan.lender ?? 'Óstaðfestur'}</dd>
          <dt className="text-slate-600">Bíll</dt><dd>{loan.vehicle ?? 'Engin staðfest tenging'}</dd>
          <dt className="text-slate-600">Eftirstöðvar hjá lánveitanda</dt><dd>Ekki staðfestar með lánayfirliti</dd>
          <dt className="text-slate-600">Skuld barns við foreldri</dt><dd>Ekki reiknuð án staðfestrar lánasögu</dd>
        </dl>
        {loan.needsReview && <p className="mt-2 rounded bg-amber-50 p-2 text-sm" role="status">Yfirfara: {loan.issues.join(' · ')}</p>}
      </article>)}
    </div>}
    <p className="text-sm font-medium">Þetta er lesyfirlit yfir skráða lánauðkenningu. Það vistar hvorki lán né afborganir og fullyrðir ekki um eftirstöðvar.</p>
  </section>;
}
