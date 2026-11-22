/**
 * Operator-confirmed BANK ACCOUNT owner evidence, not transaction-to-person evidence.
 * No owner is inferred from IBAN, account name, company membership or bank text.
 * The audit is append-only in the application: the latest relevant action wins.
 * Invalid or revoked latest evidence fails closed.
 */
export const BANK_OWNER_VERSION = 'bank-account-owner-v1' as const;
export const BANK_OWNER_CONFIRM = 'CONFIRM_BANK_ACCOUNT_OWNER' as const;
export const BANK_OWNER_REVOKE = 'REVOKE_BANK_ACCOUNT_OWNER' as const;
export type BankOwnerKind = 'COMPANY' | 'PRIVATE_PERSON';
export type BankOwnerEvidenceKind = 'NETBANK' | 'BANK_STATEMENT';

export type BankOwnerAudit = Readonly<{
  id: number;
  companyId: number;
  entityType: string;
  entityId: number;
  action: string;
  source: string;
  userId: number | null;
  afterData: unknown;
}>;

export type ConfirmedBankOwner = Readonly<{
  accountId: number;
  companyId: number;
  auditId: number;
  ownerKind: BankOwnerKind;
  ownerId: number;
  evidenceKind: BankOwnerEvidenceKind;
}>;

const positive = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

export function parseBankOwnerAudit(event: BankOwnerAudit | null): ConfirmedBankOwner | null {
  if (!event || !positive(event.id) || !positive(event.companyId) ||
      !positive(event.entityId) || !positive(event.userId) ||
      event.entityType !== 'BankAccount' || event.source !== 'USER' ||
      event.action !== BANK_OWNER_CONFIRM) return null;
  const v = event.afterData;
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const claim = v as Record<string, unknown>;
  if (claim.version !== BANK_OWNER_VERSION || claim.ownershipAttested !== true ||
      !positive(claim.ownerId) ||
      (claim.ownerKind !== 'COMPANY' && claim.ownerKind !== 'PRIVATE_PERSON') ||
      (claim.evidenceKind !== 'NETBANK' && claim.evidenceKind !== 'BANK_STATEMENT')) return null;
  // A company-owner claim cannot point at a different company.
  if (claim.ownerKind === 'COMPANY' && claim.ownerId !== event.companyId) return null;
  return {
    accountId: event.entityId,
    companyId: event.companyId,
    auditId: event.id,
    ownerKind: claim.ownerKind,
    ownerId: claim.ownerId,
    evidenceKind: claim.evidenceKind,
  };
}

/** Last relevant action for this exact account/company; a later revoke overrides confirmation. */
export function latestConfirmedBankAccountOwner(
  events: readonly BankOwnerAudit[], companyId: number, accountId: number,
): ConfirmedBankOwner | null {
  if (!positive(companyId) || !positive(accountId)) return null;
  const latest = events
    .filter(event => event.companyId === companyId && event.entityType === 'BankAccount' &&
      event.entityId === accountId &&
      (event.action === BANK_OWNER_CONFIRM || event.action === BANK_OWNER_REVOKE))
    .sort((a, b) => b.id - a.id)[0];
  return parseBankOwnerAudit(latest ?? null);
}

/** Same explicitly confirmed canonical owner, not just two accounts in one company. */
export function commonConfirmedBankAccountOwner(
  source: ConfirmedBankOwner | null, target: ConfirmedBankOwner | null,
  companyId: number, sourceAccountId: number, targetAccountId: number,
): { ownerKind: BankOwnerKind; ownerId: number; evidenceAuditIds: [number, number] } | null {
  if (!positive(companyId) || !positive(sourceAccountId) || !positive(targetAccountId) ||
      sourceAccountId === targetAccountId || !source || !target ||
      source.companyId !== companyId || target.companyId !== companyId ||
      source.accountId !== sourceAccountId || target.accountId !== targetAccountId ||
      !positive(source.auditId) || !positive(target.auditId) ||
      source.ownerKind !== target.ownerKind || source.ownerId !== target.ownerId) return null;
  return {
    ownerKind: source.ownerKind, ownerId: source.ownerId,
    evidenceAuditIds: [source.auditId, target.auditId],
  };
}
