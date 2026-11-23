import 'server-only';

import type { Prisma } from '@/app/generated/prisma/client';

/**
 * Contract v1 is a REJECTION GATE, not a migration and not proof that every
 * allocation workflow already holds an exclusive claim. A plain table named
 * BankAllocationClaim must NEVER unlock Production writes.
 *
 * Future reviewed server-side migration must implement a stable function:
 *   public.gloggt_bank_claim_guard_ready_v1() RETURNS boolean
 * that rechecks mandatory trigger coverage, historical backfill, absence of
 * conflicting claims, and distinct semantics for partial payments / reversal.
 * This release does NOT install such function or any trigger.
 */
import { bankAllocationContractFailure, type BankAllocationContractEvidence } from './bank-allocation-contract-policy';

/** SELECT-only PostgreSQL catalog inspection inside the caller's transaction.
 * This deliberately refuses ALL Production writes while the contract is absent.
 * It never creates a table, changes .env, or accepts a feature flag as evidence.
 */
export async function assertVerifiedBankAllocationContract(tx: Prisma.TransactionClient): Promise<void> {
  const evidenceRows = await tx.$queryRaw<BankAllocationContractEvidence[]>`
    SELECT
      to_regclass('public."BankAllocationClaim"') IS NOT NULL AS "tablePresent",
      COALESCE((SELECT c.relrowsecurity FROM pg_catalog.pg_class AS c
                WHERE c.oid = to_regclass('public."BankAllocationClaim"')), false) AS "rlsEnabled",
      EXISTS (
        SELECT 1
        FROM pg_catalog.pg_index AS i
        JOIN pg_catalog.pg_attribute AS a
          ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
        WHERE i.indrelid = to_regclass('public."BankAllocationClaim"')
          AND i.indisunique AND i.indisvalid AND i.indisready
          AND i.indnkeyatts = 1 AND i.indpred IS NULL
          AND a.attname = 'bankTransactionId'
      ) AS "uniqueBankTransaction",
      to_regprocedure('public.gloggt_bank_claim_guard_ready_v1()') IS NOT NULL AS "verifierPresent"
  `;
  if (evidenceRows.length !== 1) throw new Error('CLAIM_GUARD_UNVERIFIED');
  const evidence = evidenceRows[0];
  const basicFailure = bankAllocationContractFailure(evidence, null);
  if (basicFailure && basicFailure !== 'CLAIM_VERIFIER_REJECTED') {
    throw new Error('CLAIM_GUARD_UNVERIFIED');
  }
  // The function is a future database-side attestation, not supplied here.
  // If it returns false, errors, or is not installed, no writes can follow.
  const verifierRows = await tx.$queryRaw<Array<{ ready: boolean }>>`
    SELECT public.gloggt_bank_claim_guard_ready_v1() AS ready
  `;
  if (verifierRows.length !== 1 ||
      bankAllocationContractFailure(evidence, verifierRows[0]?.ready ?? false)) {
    throw new Error('CLAIM_GUARD_UNVERIFIED');
  }
}
