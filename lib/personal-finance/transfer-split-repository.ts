import 'server-only';
import { prisma } from '@/lib/prisma';
import { requireActiveCompanyReadAccess } from '@/lib/core/company-read-access';
import { getRequestAuthContext } from '@/lib/core/request-context';
import { previewFamilyTransfer, requireFamilyPersonLinks, type FamilyDraft } from './transfer-split';
import { familyTransferBlockReason } from './transfer-eligibility';
import { familySplitStorageEnabled } from './family-storage-policy';

export type SavedFamilyTransfer = {
  id:number; bankTransactionId:number; parentPersonId:number; childPersonId:number;
  parentName:string; childName:string; totalAmountIsk:string; reimbursementAmountIsk:string;
  giftAmountIsk:string; description:string; createdByUserId:number; createdAt:string; auditId:number;
};

async function familyContext() {
  const {companyId,access}=await requireActiveCompanyReadAccess();
  const {sessionUser,effectiveUser,sessionToken}=await getRequestAuthContext();
  if(!access.canReconcileBookkeeping || !sessionUser || !sessionToken || sessionUser.id!==effectiveUser?.id) throw Error('FAMILY_ACCESS_DENIED');
  return {companyId,userId:sessionUser.id,sessionToken};
}

/** No table access before approved deployment. The WHERE clause and DB RLS both
 * bind reads to the authenticated company; session context expires at COMMIT.
 */
export async function getFamilyTransferSplits(bankAccountId:number):Promise<SavedFamilyTransfer[]> {
  if (!familySplitStorageEnabled()) return [];
  if(!Number.isSafeInteger(bankAccountId)||bankAccountId<=0)throw Error('FAMILY_INVALID_ACCOUNT');
  const {companyId,sessionToken}=await familyContext();
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT set_config('gloggt.company_id',${String(companyId)},true), set_config('gloggt.session_token',${sessionToken},true)`;
    const rows=await tx.$queryRaw<(Omit<SavedFamilyTransfer,'createdAt'> & {createdAt:Date})[]>`
      SELECT f.id,f."bankTransactionId",f."parentPersonId",f."childPersonId",f."parentName",f."childName",
        f."totalAmountIsk"::text,f."reimbursementAmountIsk"::text,f."giftAmountIsk"::text,
        f.description,f."createdByUserId",f."createdAt",
        (SELECT min(a.id) FROM public."AuditEvent" a WHERE a."companyId"=f."companyId"
          AND a."entityType"='FAMILY_TRANSFER_SPLIT' AND a."entityId"=f.id
          AND a.action='FAMILY_TRANSFER_SPLIT_CREATED') AS "auditId"
      FROM public."FamilyTransferSplit" f
      JOIN public."BankTransaction" b ON b.id=f."bankTransactionId"
      JOIN public."BankAccount" ba ON ba.id=b."bankAccountId"
      WHERE f."companyId"=${companyId} AND ba."companyId"=${companyId} AND ba.id=${bankAccountId}
      ORDER BY f.id`;
    if(rows.some(r=>!r.auditId))throw Error('FAMILY_AUDIT_MISSING');
    return rows.map(r=>({...r,createdAt:r.createdAt.toISOString()}));
  });
}

/** Called from the family Server Action. Deployment flag remains fail-closed.
 * Reviewed SQL, runtime permissions and DB checks must precede enablement.
 * Authentication, module opt-in and all source amounts are re-read on the server.
 */
export async function saveFamilyTransferSplit(input: FamilyDraft) {
  if (!familySplitStorageEnabled()) throw Error('FAMILY_STORAGE_NOT_ENABLED');
  const {companyId,userId,sessionToken}=await familyContext();
  if (!Number.isSafeInteger(input.bankTransactionId) || input.bankTransactionId <= 0) throw Error('FAMILY_INVALID_BANK_ID');
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT set_config('gloggt.company_id',${String(companyId)},true), set_config('gloggt.session_token',${sessionToken},true)`;
    const module = await tx.companyModule.findUnique({where:{companyId_moduleId:{companyId,moduleId:'fjolskylduvidauki'}}});
    if (module?.enabled !== true) throw Error('FAMILY_MODULE_DISABLED');
    const bank = await tx.bankTransaction.findFirst({where:{id:input.bankTransactionId,bankAccount:{companyId,isActive:true}}});
    if (!bank) throw Error('FAMILY_BANK_NOT_FOUND');
    const [link,payment,classification] = await Promise.all([
      tx.financialReconciliationParticipant.findFirst({where:{sourceType:'BANK_TRANSACTION',sourceKey:String(bank.id),reconciliation:{companyId,status:{not:'VOID'}}},select:{id:true}}),
      tx.financialEventPayment.findFirst({where:{bankTransactionId:bank.id},select:{id:true}}),
      tx.financialSourceClassification.findUnique({where:{companyId_sourceType_sourceKey:{companyId,sourceType:'BANK_TRANSACTION',sourceKey:String(bank.id)}},select:{classification:true}}),
    ]);
    const block=familyTransferBlockReason({bankStatus:bank.status,amount:bank.amount.toString(),classification:classification?.classification??null,hasReconciliation:!!link,hasPayment:!!payment});
    if(block!==null)throw Error('FAMILY_TRANSFER_REVIEW_REQUIRED');
    const people = await tx.insightEntity.findMany({where:{companyId,entityType:'PERSON',status:'ACTIVE',
      id:{in:[input.parentPersonId ?? -1,input.childPersonId ?? -1]}},select:{id:true,name:true}});
    requireFamilyPersonLinks(input,people);
    const validated = previewFamilyTransfer({...input,bankAmount:bank.amount.toString(),
      parentName:people.find(p=>p.id===input.parentPersonId)!.name,
      childName:people.find(p=>p.id===input.childPersonId)!.name});
    // Never trust a stale browser preview after the source bank amount changes.
    if (Number(input.bankAmount) !== Number(bank.amount.toString())) throw Error('FAMILY_BANK_AMOUNT_CHANGED');
    const rows = await tx.$queryRaw<{id:number}[]>`
      INSERT INTO public."FamilyTransferSplit"
        ("companyId","bankTransactionId","parentPersonId","childPersonId","totalAmountIsk","reimbursementAmountIsk","giftAmountIsk","description","createdByUserId","transferConfirmed")
      VALUES (${companyId},${bank.id},${input.parentPersonId},${input.childPersonId},${validated.totalAmountIsk},
        ${validated.purchaseAmountIsk},${validated.giftAmountIsk},${validated.description},${userId},${input.transferConfirmed}) RETURNING id`;
    const id = rows[0].id;
    // Mandatory AFTER INSERT DB trigger creates AuditEvent in this same transaction.
    // Trigger failure aborts split + claim + audit; runtime cannot bypass the trigger.
    return {id};
  },{isolationLevel:'Serializable'});
}
