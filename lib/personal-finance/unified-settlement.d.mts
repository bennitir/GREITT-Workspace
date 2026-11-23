/**
 * GLÖGGT — one deterministic settlement equation for any company/person/vehicle.
 * READ ONLY. Bank hints, invoice payments and insurance transfers are NOT debt.
 * This module never reads/writes SQL, creates AuditEvents or charges interest.
 * Legacy ledger adapters may call balanceEffect without changing their storage.
 */
export type SettlementKind = 'COST' | 'ADVANCE' | 'REPAYMENT' | 'WAIVER' | 'CORRECTION_INCREASE' | 'CORRECTION_DECREASE' | 'GIFT' | 'OTHER' | 'VENDOR_PAYMENT' | 'EVIDENCE_ONLY';
export type Confirmation = 'USER_CONFIRMED' | 'REVIEW_ONLY';
export type SettlementOpening = {
    date: string;
    amountKr: number;
    confirmed: true;
    evidenceRef: string;
};
export type SettlementEvent = {
    id: string;
    companyId: number;
    personId: number;
    date: string;
    kind: SettlementKind;
    amountKr: number;
    confirmation: Confirmation;
    evidenceRef: string | null;
    allocationKey: string;
    vehicleRegistration: string | null;
};
export type SettlementRow = SettlementEvent & {
    effectKr: number;
    balanceKr: number | null;
};
export type SettlementProjection = {
    companyId: number;
    personId: number;
    from: string;
    through: string;
    openingKr: number | null;
    deltaKr: number;
    balanceKr: number | null;
    confirmedCount: number;
    reviewCount: number;
    rows: SettlementRow[];
    vehicleChargedKr: Record<string, number>;
    /** Calculated only: no assertion that all sources are present. */
    status: 'REVIEW_ONLY';
};
/** The single mathematical sign rule. Never infer a kind from bank direction. */
export declare function balanceEffect(kind: SettlementKind, amountKr: number): number;
/**
 * Pure projection. A "REVIEW_ONLY" event NEVER changes the balance.
 * The caller must explicitly supply a confirmed opening AND real confirmed
 * events. Unknown opening => null balance, not a manufactured zero.
 * Multiple allocations of a single bank row may have distinct allocationKeys;
 * the calling repository must verify that total allocated <= source amount.
 */
export declare function projectSettlement(input: {
    companyId: number;
    personId: number;
    from: string;
    through: string;
    opening: SettlementOpening | null;
    events: readonly SettlementEvent[];
}): SettlementProjection;
/** Advisory year boundary; NEVER creates a ledger event or bank transaction. */
export declare function previewCarryForward(p: SettlementProjection): {
    nextDate: string;
    openingKr: number;
    confirmationRequired: true;
} | null;
