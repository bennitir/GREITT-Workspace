import 'server-only';
import { prisma } from '@/lib/prisma';
import { familyTransferBlockReason } from './transfer-eligibility';

/** Called only after company authorization. Missing bank data fails closed. */
export async function getFamilyTransferBlocks(companyId:number, bankAccountId:number, ids:number[]) {
  const [banks, links, payments, classifications] = await Promise.all([
    prisma.bankTransaction.findMany({where:{id:{in:ids},bankAccountId,bankAccount:{companyId}},select:{id:true,status:true,amount:true}}),
    prisma.financialReconciliationParticipant.findMany({where:{sourceType:'BANK_TRANSACTION',sourceKey:{in:ids.map(String)},
      reconciliation:{companyId,status:{not:'VOID'}}},select:{sourceKey:true}}),
    prisma.financialEventPayment.findMany({where:{bankTransactionId:{in:ids},bankTransaction:{bankAccount:{companyId}}},select:{bankTransactionId:true}}),
    prisma.financialSourceClassification.findMany({where:{companyId,sourceType:'BANK_TRANSACTION',sourceKey:{in:ids.map(String)}},select:{sourceKey:true,classification:true}}),
  ]);
  return Object.fromEntries(ids.map(id=>{
    const bank=banks.find(b=>b.id===id);
    return [id,bank?familyTransferBlockReason({bankStatus:bank.status,amount:bank.amount.toString(),
      classification:classifications.find(c=>c.sourceKey===String(id))?.classification??null,
      hasReconciliation:links.some(l=>l.sourceKey===String(id)),hasPayment:payments.some(p=>p.bankTransactionId===id)}):'Bankafærsla er ekki aðgengileg.'];
  })) as Record<number,string|null>;
}
