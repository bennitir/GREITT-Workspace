/** Read-only presentation grouping. A confirmed link is never treated as a fresh match,
 * even if a stale bank-status projection still says UNRECONCILED.
 * Unknown status stays visible for review, not silently considered reconciled. */
export type VisualWorkRow = {
  id: number;
  bankStatus?: string | null;
  evidence?: readonly { status: string }[];
};

export function splitVisualWorkQueue<T extends VisualWorkRow>(
  rows: readonly T[], confirmedBankIds: ReadonlySet<number>,
): { pending: T[]; completed: T[] } {
  const pending: T[] = [];
  const completed: T[] = [];
  for (const row of rows) {
    const alreadyReconciled = row.bankStatus === 'RECONCILED' ||
      confirmedBankIds.has(row.id) || row.evidence?.some(item => item.status === 'confirmed') === true;
    (alreadyReconciled ? completed : pending).push(row);
  }
  return { pending, completed };
}
