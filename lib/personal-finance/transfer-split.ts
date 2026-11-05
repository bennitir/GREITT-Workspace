import { buildOwnerExplanation } from './reconciliation-bridge';

export type FamilyPerson = { id: number; name: string };
export type FamilyDraft = {
  bankTransactionId: number; bankAmount: string;
  parentPersonId: number | null; childPersonId: number | null;
  parentName: string; childName: string; purchaseAmount: string; description: string;
  transferConfirmed: boolean;
};

/** First flow: a debit from the parent's account, ISK whole amounts only.
 * Reuses V03 owner-explanation semantics: never payment/booking authority.
 */
export function previewFamilyTransfer(input: FamilyDraft) {
  if (input.transferConfirmed !== true) throw Error('Staðfestu að þetta sé millifærsla foreldris til barns vegna innkaupanna, ekki birgjagreiðsla.');
  if (!Number.isSafeInteger(input.bankTransactionId) || input.bankTransactionId <= 0 ||
      !/^-\d+(?:\.0+)?$/.test(input.bankAmount)) throw Error('Veldu útgreiðslu af reikningi foreldris.');
  const total = -Number(input.bankAmount);
  if (!Number.isSafeInteger(total) || total <= 0) throw Error('Upphæð þarf að vera jákvæð í heilum krónum.');
  if (!/^\d+$/.test(input.purchaseAmount)) throw Error('Sláðu inn innkaupaupphæð í heilum krónum.');
  const purchase = Number(input.purchaseAmount);
  if (!Number.isSafeInteger(purchase) || purchase <= 0 || purchase > total) throw Error('Endurgreiðsla þarf að vera meiri en núll og ekki hærri en millifærslan.');
  if (!input.parentName.trim() || !input.childName.trim() || input.parentName.length > 120 || input.childName.length > 120) throw Error('Tilgreindu foreldri og barn.');
  if (input.parentPersonId !== null && input.parentPersonId === input.childPersonId) throw Error('Foreldri og barn verða að vera ólíkir einstaklingar.');
  if (!input.description.trim() || input.description.length > 240) throw Error('Lýstu innkaupunum í 1–240 stöfum.');
  const explanation = buildOwnerExplanation(total, {ownerConfirmed:true, description:input.description,
    purchaseAmountIsk:purchase, allocationCertainty:'EXACT'})!;
  return { ...explanation, totalAmountIsk:total, bankTransactionId:input.bankTransactionId,
    parentName:input.parentName.trim(), childName:input.childName.trim(),
    parentPersonId:input.parentPersonId, childPersonId:input.childPersonId,
    persisted:false as const };
}

export function requireFamilyPersonLinks(input: FamilyDraft, people: readonly FamilyPerson[]) {
  for (const id of [input.parentPersonId, input.childPersonId]) {
    if (!Number.isSafeInteger(id) || !people.some(p => p.id === id)) throw Error('Veldu skráða einstaklinga í þessu fyrirtæki áður en vistað er.');
  }
  if (input.parentPersonId === input.childPersonId) throw Error('Einstaklingar mega ekki vera sá sami.');
}
