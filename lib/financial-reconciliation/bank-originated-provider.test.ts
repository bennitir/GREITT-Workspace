import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBankOriginatedFlowCandidate,
  getBankOriginatedFlowProvider,
} from "./bank-originated-provider";

function bank(overrides: Partial<Parameters<typeof buildBankOriginatedFlowCandidate>[0]> = {}) {
  return {
    id: 1,
    bankAccountId: 2,
    date: new Date("2026-03-03T00:00:00.000Z"),
    text: "Þjónustugjald",
    amount: "-160",
    reference: null,
    sourceRawData: null,
    ...overrides,
  };
}

test("BANK_FEE provider creates a read-only CHARGE proposal from explicit fee text", () => {
  const candidate = buildBankOriginatedFlowCandidate(bank());
  assert.ok(candidate);
  assert.equal(candidate.flowKind, "BANK_FEE");
  assert.equal(candidate.providerCode, "EXPLICIT_BANK_FEE_TEXT");
  assert.equal(candidate.proposedEventType, "CHARGE");
  assert.equal(candidate.proposedEventAmount, "160");
  assert.equal(candidate.writeState, "READ_ONLY");
});

test("INTEREST provider preserves existing CHARGE/CREDIT direction semantics", () => {
  const expense = buildBankOriginatedFlowCandidate(bank({
    text: "Útvextir",
    amount: "-1302.00",
  }));
  assert.ok(expense);
  assert.equal(expense.flowKind, "INTEREST");
  assert.equal(expense.proposedEventType, "CHARGE");
  assert.equal(expense.proposedEventAmount, "1302");

  const income = buildBankOriginatedFlowCandidate(bank({
    text: "Innvextir",
    amount: "705.50",
  }));
  assert.ok(income);
  assert.equal(income.flowKind, "INTEREST");
  assert.equal(income.proposedEventType, "CREDIT");
  assert.equal(income.proposedEventAmount, "-705.50");
});

test("deterministic kinds without a registered provider fail closed", () => {
  assert.equal(
    buildBankOriginatedFlowCandidate(bank({
      text: "Kreditkort",
      amount: "-10000",
    })),
    null,
  );
  assert.equal(getBankOriginatedFlowProvider("CARD_ACCOUNT_MOVEMENT"), null);
});

test("UNKNOWN and invalid/zero amounts produce no candidate", () => {
  assert.equal(
    buildBankOriginatedFlowCandidate(bank({
      text: "Alexander Hrafnar Benediktsson",
      amount: "-5000",
    })),
    null,
  );
  assert.equal(buildBankOriginatedFlowCandidate(bank({ amount: "0" })), null);
  assert.equal(buildBankOriginatedFlowCandidate(bank({ amount: "-1.001" })), null);
});

test("provider refuses a mismatched classification", () => {
  const provider = getBankOriginatedFlowProvider("BANK_FEE");
  assert.ok(provider);
  assert.equal(
    provider.buildCandidate(bank(), {
      kind: "INTEREST",
      resolution: "DETERMINISTIC",
      evidence: "INTEREST_TEXT",
    }),
    null,
  );
});
