import assert from "node:assert/strict";
import test from "node:test";
import {
  buildBankClassificationSuggestionIndex,
  classificationExcludesBusinessCoverage,
  classificationExcludesDocumentCoverage,
  suggestBankTransactionClassification,
  validateFinancialSourceClassificationTransition,
} from "./source-classification";


test("only personal rows are excluded from overall business coverage", () => {
  assert.equal(classificationExcludesBusinessCoverage("PERSONAL"), true);
  assert.equal(classificationExcludesBusinessCoverage("INTERNAL_TRANSFER"), false);
  assert.equal(classificationExcludesBusinessCoverage("NON_DOCUMENT"), false);
  assert.equal(classificationExcludesBusinessCoverage("BUSINESS"), false);
});

test("personal, internal transfer and non-document are excluded from document coverage", () => {
  assert.equal(classificationExcludesDocumentCoverage("PERSONAL"), true);
  assert.equal(classificationExcludesDocumentCoverage("INTERNAL_TRANSFER"), true);
  assert.equal(classificationExcludesDocumentCoverage("NON_DOCUMENT"), true);
  assert.equal(classificationExcludesDocumentCoverage("BUSINESS"), false);
  assert.equal(classificationExcludesDocumentCoverage("REVIEW"), false);
});

test("explicit bank fee can suggest non-document without AI", () => {
  assert.deepEqual(
    suggestBankTransactionClassification({
      text: "Þjónustugjald",
      amount: -450,
      sourceRawData: null,
    }),
    { classification: "NON_DOCUMENT", evidence: "EXPLICIT_BANK_FEE_FLOW" },
  );
});

test("merchant text never becomes a personal suggestion by itself", () => {
  assert.equal(
    suggestBankTransactionClassification({
      text: "NETFLIX.COM",
      amount: -3546,
      sourceRawData: null,
    }),
    null,
  );
});

test("generic transfer text is not assumed to be an internal transfer", () => {
  assert.equal(
    suggestBankTransactionClassification({
      text: "Millifærsla",
      amount: -10000,
      sourceRawData: null,
    }),
    null,
  );
});


test("personal classification requires confirmed mixed-use context", () => {
  assert.equal(
    validateFinancialSourceClassificationTransition({
      classification: "PERSONAL",
      allowsPersonalTransactionExclusion: false,
      hasConfirmedReconciliation: false,
    }),
    "PERSONAL_CLASSIFICATION_REQUIRES_MIXED_USE",
  );
  assert.equal(
    validateFinancialSourceClassificationTransition({
      classification: "PERSONAL",
      allowsPersonalTransactionExclusion: true,
      hasConfirmedReconciliation: false,
    }),
    null,
  );
});

test("confirmed reconciliations cannot be reclassified out of document work", () => {
  assert.equal(
    validateFinancialSourceClassificationTransition({
      classification: "NON_DOCUMENT",
      allowsPersonalTransactionExclusion: true,
      hasConfirmedReconciliation: true,
    }),
    "RECONCILED_TRANSACTION_CANNOT_BE_EXCLUDED",
  );
  assert.equal(
    validateFinancialSourceClassificationTransition({
      classification: "BUSINESS",
      allowsPersonalTransactionExclusion: false,
      hasConfirmedReconciliation: true,
    }),
    null,
  );
});


test("two consistent confirmed exact-text rows can suggest personal without auto-applying it", () => {
  const index = buildBankClassificationSuggestionIndex([
    { text: "NETFLIX.COM", classification: "PERSONAL" },
    { text: "Netflix.com", classification: "PERSONAL" },
  ]);
  assert.deepEqual(index.get("netflix com"), {
    classification: "PERSONAL",
    evidence: "CONFIRMED_EXACT_TEXT_PATTERN",
    confirmationCount: 2,
  });
});

test("contradictory confirmed use blocks learned merchant suggestion", () => {
  const index = buildBankClassificationSuggestionIndex([
    { text: "SAME PARTY", classification: "PERSONAL" },
    { text: "Same Party", classification: "BUSINESS" },
    { text: "same party", classification: "PERSONAL" },
  ]);
  assert.equal(index.has("same party"), false);
});
