import { buildEvidenceChain, type ChainConfirmation } from '../../_lib/visual-evidence-chain';
import type { VisualTransaction, VisualDocumentHit } from '../../_lib/visual-reconciliation';

const labels = {
  suggestion: 'Tillaga / tímabundið val — óstaðfest bankatenging',
  preview: 'Forskoðun — felur ekki í sér val eða tengingu',
  recorded: 'Fyrirliggjandi bókun — bankatenging óstaðfest',
  source: 'Sannanleg tenging í fyrirliggjandi upprunagögnum',
  confirmed: 'Staðfest afstemming',
};

export default function ReconciliationEvidenceChain({ bank, selected, preview, confirmations, incomplete }: {
  bank: VisualTransaction; selected: VisualDocumentHit[];
  preview: { receiptId: number; documentId: number | null } | null;
  confirmations: ChainConfirmation[]; incomplete: boolean;
}) {
  const chain = buildEvidenceChain(bank, selected, preview, confirmations);
  return <section className="mt-5 rounded-lg border border-slate-300 bg-white p-3" aria-label="Sönnunarkeðja afstemmingar" data-testid="reconciliation-evidence-chain">
    <details data-testid="evidence-chain-details">
    <summary className="cursor-pointer rounded font-semibold focus-visible:outline-2 focus-visible:outline-teal-700">Sönnunarkeðja · skoða tengsl ({chain.nodes.length} færslur)</summary>
    <p className="my-2 text-xs">Skrifvarið yfirlit úr hlöðnum gögnum. BankTransaction = bankafærsla, Receipt = fylgiskjal, AiDetectedDocument = greint skjal, ReceiptEntry = bókunarlína fylgiskjals, AiDetectedDocumentEntry = lína greinds skjals, FinancialEvent = fjárhagsatburður, FinancialEventPayment = skráð greiðsla.</p>
    {incomplete && <p role="status" className="text-sm text-amber-900">Gögn vantar í yfirlitið; vöntun tengingar sannar ekki að hún sé ekki til.</p>}
    <details><summary className="cursor-pointer text-sm">Einstakar færslur ({chain.nodes.length})</summary>
      <ul className="text-sm">{chain.nodes.map(node => <li key={node}>{node}</li>)}</ul>
    </details>
    <ul className="mt-3 space-y-3 text-sm leading-relaxed">{chain.relations.map((relation, index) => <li key={index} className="border-t pt-3">
      <span className="block break-words">{relation.from} → {relation.to}</span>
      <strong>{labels[relation.kind]}{relation.confirmationId !== null ? ` · FinancialReconciliation #${relation.confirmationId}` : ''}</strong>
    </li>)}</ul>
    {!chain.relations.length && <p className="mt-2 text-sm">Engin tengsl í hlöðnum gögnum.</p>}
    <p className="mt-2 text-xs">Hver færsla er talin einu sinni eftir auðkennisflokki og númeri. Tengsl eru ekki fjárhæðir og eru ekki lögð saman. Bókun á sama fylgiskjali sannar ekki bókun á tilteknu greindu skjali eða staðfesta bankapörun.</p>
    </details>
  </section>;
}
