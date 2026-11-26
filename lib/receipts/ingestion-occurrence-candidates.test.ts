import assert from "node:assert/strict";
import test from "node:test";

import { buildDeterministicData, buildReceiptSourceSnapshot } from "./ingestion";

function occurrenceFields(data: ReturnType<typeof buildDeterministicData>) {
  return {
    occurrenceSequenceCandidate: data.occurrenceSequenceCandidate,
    occurrenceTotalCandidate: data.occurrenceTotalCandidate,
    occurrenceSource: data.occurrenceSource,
  };
}

test("unambiguous printed installment number is an unverified observation", () => {
  const data = buildDeterministicData(`
    Innheimtubréf númer: 338379
    Gjalddagi 16 af 480
    Gjalddagi greiðslu: 01.01.2026
    Til greiðslu: 242.189 kr.
  `);
  assert.deepEqual(occurrenceFields(data), {
    occurrenceSequenceCandidate: 16,
    occurrenceTotalCandidate: 480,
    occurrenceSource: "PDF_TEXT_UNVERIFIED",
  });
  // A raw occurrence candidate must never become a booking decision or
  // a confirmed document-instance/obligation reference.
  assert.equal(Object.hasOwn(data, "confirmedOccurrence"), false);
  assert.equal(Object.hasOwn(data, "obligationId"), false);
});

test("installment number marker remains detectable without treating page count as installment", () => {
  const data = buildDeterministicData(
    "Innheimtubréf númer: 338379\nAfborgun nr. 16 af 480\nSíða 1 af 10",
  );
  assert.deepEqual(occurrenceFields(data), {
    occurrenceSequenceCandidate: 16,
    occurrenceTotalCandidate: 480,
    occurrenceSource: "PDF_TEXT_UNVERIFIED",
  });
});

test("same installment in multiple notations remains one unverified candidate", () => {
  const data = buildDeterministicData(
    "Gjalddagi 17 af 480\nAfborgun 17/480\nTil greiðslu 240.000 kr.",
  );
  assert.deepEqual(occurrenceFields(data), {
    occurrenceSequenceCandidate: 17,
    occurrenceTotalCandidate: 480,
    occurrenceSource: "PDF_TEXT_UNVERIFIED",
  });
});

test("conflicting installment numbers across a document suppress the file-level candidate", () => {
  const data = buildDeterministicData(
    "Gjalddagi 16 af 480\n--- ný síða ---\nGjalddagi 17 af 480",
  );
  assert.deepEqual(occurrenceFields(data), {
    occurrenceSequenceCandidate: undefined,
    occurrenceTotalCandidate: undefined,
    occurrenceSource: undefined,
  });
});

test("ordinary invoice, dates, and unlabelled fractions do not become installments", () => {
  const data = buildDeterministicData(
    "REIKNINGUR NR. 2026-17\nDags. 17/10\nMagn 17/480\nSamtals 45.126 kr.",
  );
  assert.deepEqual(occurrenceFields(data), {
    occurrenceSequenceCandidate: undefined,
    occurrenceTotalCandidate: undefined,
    occurrenceSource: undefined,
  });
});

test("non-PDF uploads do not manufacture PDF text observations", async () => {
  const result = await buildReceiptSourceSnapshot({
    fileName: "scan.jpg",
    buffer: Buffer.from("Gjalddagi 17 af 480", "utf8"),
  });
  assert.equal(result.sourceTextSource, "NONE");
  assert.equal(Object.hasOwn(result.deterministicData, "occurrenceSource"), false);
});
