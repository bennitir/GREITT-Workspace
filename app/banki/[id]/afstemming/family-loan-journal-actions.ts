'use server';
import { createFamilyLoanJournalAccount, addFamilyLoanJournalMovement } from '@/lib/personal-finance/family-loan-journal-repository';
import type { JournalCreateInput, JournalMovementInput, JournalActionResult } from '@/lib/personal-finance/family-loan-journal-contract';
/** No client-controlled company or user ID. All identities and source records
 * are re-fetched by the repository in a serializable transaction.
 */
export async function createFamilyLoanJournalAction(input: JournalCreateInput): Promise<JournalActionResult> {
  try {
    const id = await createFamilyLoanJournalAccount(input);
    return { ok: true, id };
  } catch {
    return { ok: false, message: 'Lánið var ekki vistað. Athugaðu staðbundinn prófunargrunn, aðgang og tengsl aðila. Ekkert var bókað.' };
  }
}
export async function addFamilyLoanJournalMovementAction(input: JournalMovementInput): Promise<JournalActionResult> {
  try {
    const id = await addFamilyLoanJournalMovement(input);
    return { ok: true, id };
  } catch {
    return { ok: false, message: 'Lánsfærslan var ekki vistuð. Athugaðu lán, dagsetningu, fjárhæð og hvort bankafærslan sé þegar ráðstafað.' };
  }
}
