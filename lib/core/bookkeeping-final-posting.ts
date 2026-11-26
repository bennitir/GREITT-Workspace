/**
 * Universal, fail-closed posting checks for persisted and manual booking lines.
 * Only the DB transaction owning the posting may supply the account snapshot;
 * never use the caller's list of "allowed accounts" as proof.
 *
 * Monetary precision is cents (integer minor units). This is intentionally a
 * guard for current Float-backed legacy storage, not a replacement for moving
 * the ledger to Decimal / integer minor units in a later migration.
 */
export type PostingLine = {
  account: string;
  debit: number;
  credit: number;
  text?: string;
};

export type PostingAccount = { number: string; isActive: boolean };

function toMinorUnits(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error("Debet og kredit verða að vera gildar óneikvæðar fjárhæðir.");
  }
  const amount = Math.round(value * 100);
  if (!Number.isSafeInteger(amount) || Math.abs(value * 100 - amount) > 0.000001) {
    throw new Error("Bókunarfjárhæð verður að hafa mest tvo aukastafi.");
  }
  return amount;
}

export function assertFinalBookkeepingPosting(
  entries: readonly PostingLine[],
  accounts: readonly PostingAccount[],
  postingDate: Date | null | undefined,
): void {
  if (!(postingDate instanceof Date) || !Number.isFinite(postingDate.getTime())) {
    throw new Error("Dagsetning bókunar vantar eða er ógild.");
  }
  if (entries.length < 2) {
    throw new Error("Bókun þarf að innihalda debet- og kreditlínur.");
  }

  const activeAccounts = new Set(accounts.filter((a) => a.isActive).map((a) => a.number));
  let debitTotal = 0;
  let creditTotal = 0;
  for (const entry of entries) {
    if (typeof entry.account !== "string" || !entry.account.trim() ||
        !activeAccounts.has(entry.account) || entry.account !== entry.account.trim()) {
      throw new Error("Bókunarlína vísar ekki í virkan reikningslykil fyrirtækisins.");
    }
    const debit = toMinorUnits(entry.debit);
    const credit = toMinorUnits(entry.credit);
    if ((debit === 0 && credit === 0) || (debit > 0 && credit > 0)) {
      throw new Error("Hver bókunarlína verður að hafa annaðhvort debet eða kredit.");
    }
    debitTotal += debit;
    creditTotal += credit;
    if (!Number.isSafeInteger(debitTotal) || !Number.isSafeInteger(creditTotal)) {
      throw new Error("Bókunarfjárhæð fer yfir örugg stærðarmörk.");
    }
  }
  if (debitTotal !== creditTotal || debitTotal === 0) {
    throw new Error("Bókunin stemmir ekki: samtala debet og kredit verður að vera jöfn.");
  }
}
