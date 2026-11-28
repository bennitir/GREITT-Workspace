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

/**
 * Account registration is the accountant's owner declaration for company accounts.
 * A later explicit owner audit overrides it; a revoked or invalid latest audit blocks
 * matching instead of silently falling back to company registration.
 */
export type RegisteredBankOwner = Readonly<{
  accountId: number;
  companyId: number;
  ownerKind: BankOwnerKind;
  ownerId: number;
  basis: 'COMPANY_ACCOUNT_REGISTRATION' | 'EXPLICIT_OWNER_RECORD';
  auditId: number | null;
}>;

export function resolveRegisteredBankOwner(
  latestEvent: BankOwnerAudit | null,
  companyId: number,
  accountId: number,
): RegisteredBankOwner | null {
  if (!positive(companyId) || !positive(accountId)) return null;
  if (!latestEvent) return {
    accountId, companyId, ownerKind: 'COMPANY', ownerId: companyId,
    basis: 'COMPANY_ACCOUNT_REGISTRATION', auditId: null,
  };
  if (latestEvent.companyId !== companyId || latestEvent.entityId !== accountId ||
      latestEvent.entityType !== 'BankAccount') return null;
  // Both explicit revocation and malformed newer owner events take precedence.
  const confirmed = parseBankOwnerAudit(latestEvent);
  if (!confirmed) return null;
  return {
    accountId, companyId, ownerKind: confirmed.ownerKind,
    ownerId: confirmed.ownerId, basis: 'EXPLICIT_OWNER_RECORD',
    auditId: confirmed.auditId,
  };
}

export function commonRegisteredBankOwner(
  source: RegisteredBankOwner | null,
  target: RegisteredBankOwner | null,
  companyId: number, sourceAccountId: number, targetAccountId: number,
): { ownerKind: BankOwnerKind; ownerId: number;
     basis: 'COMPANY_ACCOUNT_REGISTRATION' | 'EXPLICIT_OWNER_RECORD';
     evidenceAuditIds: number[] } | null {
  if (!positive(companyId) || !positive(sourceAccountId) || !positive(targetAccountId) ||
      sourceAccountId === targetAccountId || !source || !target ||
      source.companyId !== companyId || target.companyId !== companyId ||
      source.accountId !== sourceAccountId || target.accountId !== targetAccountId ||
      source.ownerKind !== target.ownerKind || source.ownerId !== target.ownerId) return null;
  return {
    ownerKind: source.ownerKind, ownerId: source.ownerId,
    basis: source.basis === 'COMPANY_ACCOUNT_REGISTRATION' &&
      target.basis === 'COMPANY_ACCOUNT_REGISTRATION'
      ? 'COMPANY_ACCOUNT_REGISTRATION' : 'EXPLICIT_OWNER_RECORD',
    evidenceAuditIds: [source.auditId, target.auditId].filter((v): v is number => v !== null),
  };
}
