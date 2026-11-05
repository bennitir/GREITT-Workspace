'use server';
import { saveFamilyTransferSplit } from '@/lib/personal-finance/transfer-split-repository';
import type { FamilyDraft } from '@/lib/personal-finance/transfer-split';

export async function confirmFamilyTransfer(input: FamilyDraft): Promise<{ok:true;id:number}|{ok:false;message:string}> {
  try {
    if (!input || typeof input !== 'object' ||
      ![input.bankTransactionId,input.parentPersonId,input.childPersonId].every(id=>Number.isSafeInteger(id)&&Number(id)>0) ||
      typeof input.bankAmount!=='string' || input.bankAmount.length>40 ||
      typeof input.purchaseAmount!=='string' || input.purchaseAmount.length>30 ||
      typeof input.description!=='string' || input.description.length>240 ||
      typeof input.parentName!=='string' || input.parentName.length>120 ||
      typeof input.childName!=='string' || input.childName.length>120 || input.transferConfirmed!==true) {
      return {ok:false,message:'Veldu skráða einstaklinga og yfirfarðu upphæðir og lýsingu.'};
    }
    const result=await saveFamilyTransferSplit(input);
    return {ok:true,id:result.id};
  } catch {
    // Never expose DB errors, session context or query parameters to the browser.
    return {ok:false,message:'Ekki tókst að staðfesta vistun. Endurhladdu síðuna til að sjá hvort skiptingin hafi þegar vistast. Ef ekki, yfirfarðu heimildir og tengsl færslunnar áður en þú reynir aftur.'};
  }
}
