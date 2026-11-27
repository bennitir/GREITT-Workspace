import 'server-only';
import type { Prisma } from '@/app/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { requireActiveCompanyReadAccess } from '@/lib/core/company-read-access';
import { getRequestAuthContext } from '@/lib/core/request-context';
import { calculateFamilyLoanLedger, type FamilyLoanLedgerAccount, type FamilyLoanMovement } from './family-loan-ledger';
import { checkJournalCreate, checkJournalMovement, type JournalCreateInput,
  type JournalMovementInput, type JournalSnapshot } from './family-loan-journal-contract';
import { assembleJournalSnapshot } from './family-loan-journal-projection';
import { parseStoredFamilyLoanAmountIsk } from './family-loan-journal-amount';
import { familyLoanJournalLocalEnabled } from './family-loan-journal-policy';

const unavailable = 'FAMILY_JOURNAL_LOCAL_STORAGE_DISABLED';

async function getActor() {
  const { companyId, access } = await requireActiveCompanyReadAccess();
  const { sessionUser, effectiveUser, sessionToken } = await getRequestAuthContext();
  if ((access.role !== 'OWNER' && access.role !== 'ADMIN') ||
      !access.canReconcileBookkeeping || !sessionUser || !sessionToken ||
      sessionUser.id !== effectiveUser?.id) throw Error('FAMILY_JOURNAL_ACCESS_DENIED');
  return { companyId, userId: sessionUser.id, sessionToken };
}

type DbMovement = Omit<FamilyLoanMovement, 'amountIsk'> & { amountIsk: string };
async function session(tx: Prisma.TransactionClient,
  companyId: number, token: string) {
  await tx.$queryRaw`SELECT set_config('gloggt.company_id', ${String(companyId)}, true),
    set_config('gloggt.session_token', ${token}, true)`;
}
async function readJournal(tx: Prisma.TransactionClient,
  companyId: number): Promise<JournalSnapshot> {
  const accounts = await tx.$queryRaw<FamilyLoanLedgerAccount[]>`
    SELECT id,"companyId","parentPersonId","childPersonId",title,
      "linkedInnsynLoanId","vehicleEntityId"
    FROM public."FamilyLoanLedgerAccount" WHERE "companyId"=${companyId}
    ORDER BY id LIMIT 501`;
  if (accounts.length > 500) throw Error('JOURNAL_HISTORY_LIMIT');
  const movements = await tx.$queryRaw<DbMovement[]>`
    SELECT id,"companyId","loanId",kind,"amountIsk"::text AS "amountIsk",
      to_char("effectiveDate",'YYYY-MM-DD') AS "effectiveDate",
      "bankTransactionId","reversalOfId",note,"createdByUserId"
    FROM public."FamilyLoanLedgerMovement" WHERE "companyId"=${companyId}
    ORDER BY id LIMIT 10001`;
  return assembleJournalSnapshot(companyId, accounts, movements);
}

/** Real, RLS-backed read, only from the known local V03 test database. */
export async function getFamilyLoanJournal(): Promise<JournalSnapshot | null> {
  if (!familyLoanJournalLocalEnabled()) return null;
  const { companyId, sessionToken } = await getActor();
  return prisma.$transaction(async tx => {
    await session(tx, companyId, sessionToken);
    return readJournal(tx, companyId);
  }, { isolationLevel: 'RepeatableRead' });
}

export async function createFamilyLoanJournalAccount(input: JournalCreateInput): Promise<number> {
  if (!familyLoanJournalLocalEnabled()) throw Error(unavailable);
  checkJournalCreate(input);
  const { companyId, userId, sessionToken } = await getActor();
  return prisma.$transaction(async tx => {
    await session(tx, companyId, sessionToken);
    const module = await tx.companyModule.findUnique({ where: { companyId_moduleId:
      { companyId, moduleId: 'fjolskylduvidauki' } }, select: { enabled: true } });
    if (module?.enabled !== true) throw Error('FAMILY_MODULE_DISABLED');
    const existing = await tx.$queryRaw<(FamilyLoanLedgerAccount & { createKey: string })[]>`
      SELECT id,"companyId","parentPersonId","childPersonId",title,"linkedInnsynLoanId",
        "vehicleEntityId","createKey"::text AS "createKey"
      FROM public."FamilyLoanLedgerAccount" WHERE "companyId"=${companyId} AND "createKey"=${input.requestId}::uuid`;
    if (existing.length) {
      const old = existing[0];
      if (old.parentPersonId !== input.parentPersonId || old.childPersonId !== input.childPersonId ||
          old.title !== input.title.trim() || old.linkedInnsynLoanId !== input.linkedInnsynLoanId ||
          old.vehicleEntityId !== input.vehicleEntityId) throw Error('FAMILY_IDEMPOTENCY_COLLISION');
      return old.id;
    }
    const rows = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO public."FamilyLoanLedgerAccount"
        ("companyId","parentPersonId","childPersonId",title,"linkedInnsynLoanId",
         "vehicleEntityId","createdByUserId","createKey")
      VALUES (${companyId},${input.parentPersonId},${input.childPersonId},${input.title.trim()},
        ${input.linkedInnsynLoanId},${input.vehicleEntityId},${userId},${input.requestId}::uuid)
      RETURNING id`;
    return rows[0].id;
  }, { isolationLevel: 'Serializable' });
}

export async function addFamilyLoanJournalMovement(input: JournalMovementInput): Promise<number> {
  if (!familyLoanJournalLocalEnabled()) throw Error(unavailable);
  checkJournalMovement(input);
  const { companyId, userId, sessionToken } = await getActor();
  return prisma.$transaction(async tx => {
    await session(tx, companyId, sessionToken);
    const module = await tx.companyModule.findUnique({ where: { companyId_moduleId:
      { companyId, moduleId: 'fjolskylduvidauki' } }, select: { enabled: true } });
    if (module?.enabled !== true) throw Error('FAMILY_MODULE_DISABLED');
    // Serialize competing entries for this particular loan, even when the user
    // has multiple tabs open. The SQL trigger rechecks identity and source.
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(${companyId},${input.loanId})`;
    const loans = await tx.$queryRaw<FamilyLoanLedgerAccount[]>`
      SELECT id,"companyId","parentPersonId","childPersonId",title,
        "linkedInnsynLoanId","vehicleEntityId" FROM public."FamilyLoanLedgerAccount"
      WHERE "companyId"=${companyId} AND id=${input.loanId}`;
    if (loans.length !== 1) throw Error('FAMILY_JOURNAL_LOAN_MISSING');
    const previous = await tx.$queryRaw<(DbMovement & { idempotencyKey: string })[]>`
      SELECT id,"companyId","loanId",kind,"amountIsk"::text AS "amountIsk",
        to_char("effectiveDate",'YYYY-MM-DD') AS "effectiveDate",
        "bankTransactionId","reversalOfId",note,"createdByUserId",
        "idempotencyKey"::text AS "idempotencyKey"
      FROM public."FamilyLoanLedgerMovement" WHERE "companyId"=${companyId}
        AND "loanId"=${input.loanId} ORDER BY id`;
    const prior = previous.find(r => r.idempotencyKey === input.requestId);
    if (prior) {
      if (prior.kind !== input.kind || parseStoredFamilyLoanAmountIsk(prior.amountIsk) !== input.amountIsk ||
          prior.effectiveDate !== input.effectiveDate || prior.note !== input.note.trim() ||
          prior.bankTransactionId !== input.bankTransactionId || prior.reversalOfId !== input.reversalOfId)
        throw Error('FAMILY_IDEMPOTENCY_COLLISION');
      return prior.id;
    }
    // Validate the resulting whole loan history BEFORE INSERT. DB uniqueness and
    // audit triggers provide an independent guard against concurrent/other writes.
    const proposed: FamilyLoanMovement = {
      id: Math.max(0, ...previous.map(p => p.id)) + 1, companyId, loanId: input.loanId,
      kind: input.kind, amountIsk: input.amountIsk, effectiveDate: input.effectiveDate,
      bankTransactionId: input.bankTransactionId, reversalOfId: input.reversalOfId,
      note: input.note.trim(), createdByUserId: userId,
    };
    // A reversal refers to a real ID and cannot collide with the temporary ID.
    calculateFamilyLoanLedger({ companyId, loans, movements: [
      ...previous.map(r => ({ ...r, amountIsk: parseStoredFamilyLoanAmountIsk(r.amountIsk) })), proposed] });
    const rows = await tx.$queryRaw<{ id: number }[]>`
      INSERT INTO public."FamilyLoanLedgerMovement"
        ("companyId","loanId",kind,"amountIsk","effectiveDate","bankTransactionId",
         "reversalOfId",note,"idempotencyKey","createdByUserId")
      VALUES (${companyId},${input.loanId},${input.kind},${input.amountIsk},
        ${input.effectiveDate}::date,${input.bankTransactionId},${input.reversalOfId},
        ${input.note.trim()},${input.requestId}::uuid,${userId}) RETURNING id`;
    return rows[0].id;
  }, { isolationLevel: 'Serializable' });
}
