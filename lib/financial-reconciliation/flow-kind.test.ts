import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyBankReconciliationFlow,
  DOCUMENT_OBLIGATION_FLOW_KIND,
  RECONCILIATION_FLOW_KINDS,
} from "./flow-kind";

const classify = (
  text: string,
  sourceRawData: string | null = null,
  amount: string | number = "-100",
) => classifyBankReconciliationFlow({ text, amount, sourceRawData });

test("flow kind catalog keeps document obligation explicit and UNKNOWN safe", () => {
  assert.equal(DOCUMENT_OBLIGATION_FLOW_KIND, "DOCUMENT_OBLIGATION");
  assert.ok(RECONCILIATION_FLOW_KINDS.includes("UNKNOWN"));
  assert.ok(RECONCILIATION_FLOW_KINDS.includes("CARD_ACCOUNT_MOVEMENT"));
});

test("explicit bank-originated flows classify deterministically", () => {
  assert.deepEqual(classify("Þjónustugjald Netbanka"), {
    kind: "BANK_FEE", resolution: "DETERMINISTIC", evidence: "BANK_FEE_TEXT",
  });
  assert.deepEqual(classify("Útvextir"), {
    kind: "INTEREST", resolution: "DETERMINISTIC", evidence: "INTEREST_TEXT",
  });
  assert.deepEqual(classify("Bakfærsla"), {
    kind: "REVERSAL", resolution: "DETERMINISTIC", evidence: "REVERSAL_TEXT",
  });
  assert.deepEqual(classify("Kreditkort"), {
    kind: "CARD_ACCOUNT_MOVEMENT", resolution: "DETERMINISTIC", evidence: "CARD_ACCOUNT_MOVEMENT_TEXT",
  });
  assert.deepEqual(classify("Afborgun láns - millifærsla"), {
    kind: "LOAN_PAYMENT", resolution: "DETERMINISTIC", evidence: "LOAN_PAYMENT_TEXT",
  });
  assert.deepEqual(classify("Millifærsla"), {
    kind: "TRANSFER", resolution: "DETERMINISTIC", evidence: "TRANSFER_TEXT",
  });
});

test("structured card markers classify card purchase without merchant inference", () => {
  const sourceRawData = JSON.stringify({
    counterparty: "Merchant ehf, **-1234",
    counterpartyKennitala: "1234567890",
    paymentExplanation: "Úttekt með debetkorti",
  });
  assert.deepEqual(classify("Merchant ehf", sourceRawData), {
    kind: "CARD_PURCHASE", resolution: "DETERMINISTIC", evidence: "CARD_PURCHASE_MARKER",
  });
});

test("known counterparty and amount direction alone remain UNKNOWN", () => {
  const sourceRawData = JSON.stringify({
    counterparty: "Example ehf",
    counterpartyKennitala: "1234567890",
  });
  assert.deepEqual(classify("Example ehf", sourceRawData, "125000"), {
    kind: "UNKNOWN", resolution: "UNKNOWN", evidence: "NO_DETERMINISTIC_FLOW",
  });
  assert.deepEqual(classify("Example ehf", sourceRawData, "-125000"), {
    kind: "UNKNOWN", resolution: "UNKNOWN", evidence: "NO_DETERMINISTIC_FLOW",
  });
});

test("malformed or irrelevant raw data fails closed", () => {
  assert.equal(classify("Óþekkt", "{bad json").kind, "UNKNOWN");
  assert.equal(classify("Verslun", JSON.stringify({ counterparty: "Verslun" })).kind, "UNKNOWN");
});
