import test from 'node:test';
import assert from 'node:assert/strict';
import { indexConfirmedVisualDocumentLinks } from '../lib/financial-reconciliation/visual-confirmed-document-links.ts';

test('confirmed links require explicit document IDs', () => {
  const map = indexConfirmedVisualDocumentLinks([
    { id: 11, bankTransactionId: 22, documents: [{ documentId: 33 }] },
  ], []);

  assert.deepEqual(map.get(33), [
    { bankTransactionId: 22, reconciliationId: 11, origin: 'existing' },
  ]);
  assert.equal(map.has(22), false);
});

test('VOID history is not a confirmed document link', () => {
  const map = indexConfirmedVisualDocumentLinks([], [
    { id: 12, bankTransactionId: 23, status: 'VOID', documentIds: [34] },
  ]);

  assert.equal(map.has(34), false);
});

test('duplicate links collapse and invalid IDs are rejected', () => {
  const map = indexConfirmedVisualDocumentLinks([
    { id: 11, bankTransactionId: 22, documents: [{ documentId: 33 }, { documentId: 0 }] },
  ], [
    { id: 11, bankTransactionId: 22, status: 'CONFIRMED', documentIds: [33, -4] },
    { id: 13, bankTransactionId: 24, status: 'CONFIRMED', documentIds: [33] },
  ]);

  assert.equal(map.get(33)?.length, 2);
  assert.equal(map.has(0), false);
  assert.equal(map.has(-4), false);
});