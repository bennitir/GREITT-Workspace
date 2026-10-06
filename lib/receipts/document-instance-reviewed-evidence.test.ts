import assert from "node:assert/strict";
import test from "node:test";

import {
  findReviewedInstallmentEvidence,
  reviewedCanonicalTextDigest,
  reviewedTextConfirmsObligationReference,
} from "./document-instance-reviewed-evidence";

const legacy16 =
  "Skuldabréf/innheimtubréf vegna gjalddaga 16 af 480. Krafa nr. 294755, innheimtubréf nr. 338379. Til greiðslu eru 242.189 kr.";
const current17 =
  "Afborgunartilkynning vegna verðtryggðs skuldabréfs. Innheimtubréf númer 338379, tilvísun 109815 og krafa nr. 294755. Gjalddagi 01.02.2026, eindagi 02.02.2026 og gjalddagi 17 af 480.";

const ergo12 =
  "Afborgunartilkynning vegna láns nr. 104907. Gjalddagi 12 af 24. Krafa nr. 24683. Til greiðslu 46.147 kr.";
const ergo13 =
  "Afborgunartilkynning fyrir lán nr. 104907, gjalddagi 13 af 24. Krafa nr. 24683. Samtals 46.147 kr.";

test("reviewed Festa summaries expose 16/480 and 17/480 under the repeated obligation reference", () => {
  assert.deepEqual(findReviewedInstallmentEvidence(legacy16, "338379"), {
    fieldLabel: "gjalddaga",
    sequenceText: "16",
    totalText: "480",
    verbatimText: "gjalddaga 16 af 480",
  });
  assert.deepEqual(findReviewedInstallmentEvidence(current17, "338379"), {
    fieldLabel: "gjalddagi",
    sequenceText: "17",
    totalText: "480",
    verbatimText: "gjalddagi 17 af 480",
  });
});


test("reviewed loan claim references can distinguish repeated Ergo installments", () => {
  assert.deepEqual(findReviewedInstallmentEvidence(ergo12, "24683"), {
    fieldLabel: "Gjalddagi",
    sequenceText: "12",
    totalText: "24",
    verbatimText: "Gjalddagi 12 af 24",
  });
  assert.deepEqual(findReviewedInstallmentEvidence(ergo13, "24683"), {
    fieldLabel: "gjalddagi",
    sequenceText: "13",
    totalText: "24",
    verbatimText: "gjalddagi 13 af 24",
  });
  assert.equal(
    reviewedTextConfirmsObligationReference(ergo13, "24683"),
    true,
  );
});

test("claim semantics do not turn an ordinary invoice number into an obligation reference", () => {
  assert.equal(
    findReviewedInstallmentEvidence(
      "Reikningur 24683. Gjalddagi 13 af 24.",
      "24683",
    ),
    null,
  );
});

test("a number in reviewed text is not enough without explicit obligation-reference semantics", () => {
  assert.equal(
    findReviewedInstallmentEvidence(
      "Reikningur 338379. Gjalddagi 17 af 480.",
      "338379",
    ),
    null,
  );
  assert.equal(
    reviewedTextConfirmsObligationReference(
      "Reikningur 338379. Gjalddagi 17 af 480.",
      "338379",
    ),
    false,
  );
});

test("reviewed canonical digest is stable across whitespace but changes with the reviewed facts", () => {
  assert.equal(
    reviewedCanonicalTextDigest("Innheimtubréf nr. 338379\nGjalddagi 16 af 480"),
    reviewedCanonicalTextDigest(" Innheimtubréf nr. 338379   Gjalddagi 16 af 480 "),
  );
  assert.notEqual(
    reviewedCanonicalTextDigest("Innheimtubréf nr. 338379 Gjalddagi 16 af 480"),
    reviewedCanonicalTextDigest("Innheimtubréf nr. 338379 Gjalddagi 17 af 480"),
  );
});
