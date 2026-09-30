import assert from "node:assert/strict";
import test from "node:test";
import {
  collectSourceDocumentTemporalContext,
  extractSourceDocumentTemporalContext,
} from "./source-document-temporal";

const iso = (date: Date | null) => date?.toISOString() ?? null;

test("extracts one explicit Icelandic month and payment dates without guessing", () => {
  const result = extractSourceDocumentTemporalContext({
    documentDate: new Date("2026-07-29T00:00:00.000Z"),
    summary: "Kílómetragjald júlí 2026. Gjalddagi 01.08.2026, eindagi 17.08.2026.",
  });
  assert.deepEqual(result.documentDates.map(iso), ["2026-07-29T00:00:00.000Z"]);
  assert.equal(iso(result.periodStart), "2026-07-01T12:00:00.000Z");
  assert.equal(iso(result.periodEnd), "2026-07-31T12:00:00.000Z");
  assert.equal(iso(result.dueDate), "2026-08-01T12:00:00.000Z");
  assert.equal(iso(result.finalDueDate), "2026-08-17T12:00:00.000Z");
});

test("booking-entry text can supply period and due date when summary is sparse", () => {
  const result = extractSourceDocumentTemporalContext({
    bookingEntries: [
      { text: "Hiti og hitaveita, febrúar 2026" },
      { text: "Skuld vegna orkureiknings, gjalddagi 23.03.2026" },
    ],
  });
  assert.equal(iso(result.periodStart), "2026-02-01T12:00:00.000Z");
  assert.equal(iso(result.periodEnd), "2026-02-28T12:00:00.000Z");
  assert.equal(iso(result.dueDate), "2026-03-23T12:00:00.000Z");
  assert.equal(result.finalDueDate, null);
});

test("month ranges are preserved while conflicting periods fail closed", () => {
  const range = extractSourceDocumentTemporalContext({
    summary: "Kílómetragjald janúar og febrúar 2026",
  });
  assert.equal(iso(range.periodStart), "2026-01-01T12:00:00.000Z");
  assert.equal(iso(range.periodEnd), "2026-02-28T12:00:00.000Z");

  const conflict = extractSourceDocumentTemporalContext({
    bookingEntries: [{ text: "júlí 2026" }, { text: "ágúst 2026" }],
  });
  assert.equal(conflict.periodStart, null);
  assert.equal(conflict.periodEnd, null);
});

test("multiple source documents merge only unique non-conflicting temporal facts", () => {
  const merged = collectSourceDocumentTemporalContext([
    {
      documentDate: new Date("2026-07-29T00:00:00.000Z"),
      summary: "júlí 2026. Eindagi 17.08.2026",
    },
    {
      documentDate: new Date("2026-07-30T00:00:00.000Z"),
      summary: "júlí 2026. Eindagi 17.08.2026",
    },
  ]);
  assert.equal(merged.documentDates.length, 2);
  assert.equal(iso(merged.periodStart), "2026-07-01T12:00:00.000Z");
  assert.equal(iso(merged.finalDueDate), "2026-08-17T12:00:00.000Z");

  const conflicting = collectSourceDocumentTemporalContext([
    { summary: "Eindagi 17.08.2026" },
    { summary: "Eindagi 15.09.2026" },
  ]);
  assert.equal(conflicting.finalDueDate, null);
});
