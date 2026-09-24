export const VEHICLE_VAT_ELIGIBILITY_STATUSES = [
  "UNCONFIRMED",
  "NO_VAT_DEDUCTION",
  "VAT_ELIGIBLE",
] as const;

export type VehicleVatEligibilityStatus =
  (typeof VEHICLE_VAT_ELIGIBILITY_STATUSES)[number];

export function isVehicleVatEligibilityStatus(
  value: string
): value is VehicleVatEligibilityStatus {
  return (VEHICLE_VAT_ELIGIBILITY_STATUSES as readonly string[]).includes(value);
}

export function vehicleVatEligibilityAppliesOnDate(input: {
  status: string;
  validFrom: Date | null;
  transactionDate: Date;
}) {
  if (!isVehicleVatEligibilityStatus(input.status)) return false;
  if (input.status === "UNCONFIRMED") return false;
  if (!input.validFrom) return false;
  return input.transactionDate.getTime() >= input.validFrom.getTime();
}

export function vehicleAllowsVatEvaluation(input: {
  status: string;
  validFrom: Date | null;
  transactionDate: Date;
}) {
  return (
    input.status === "VAT_ELIGIBLE" &&
    vehicleVatEligibilityAppliesOnDate(input)
  );
}


// Fyrirtækisstillingin er harður stopp-punktur, ekki jákvætt VSK-leyfi.
// false merkir aðeins að engin fyrirtækisvíð lokun sé staðfest;
// það heimilar aldrei innskatt eitt og sér.
export function companyBlocksVehicleInputVat(input: {
  vehicleVatDeductionBlocked: boolean;
}) {
  return input.vehicleVatDeductionBlocked;
}
