import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { findVehicleLoanDocumentMentions, loanReferenceInSummary, vehiclePlateQueryTerms } from './loan-document-evidence.ts';

const loans = [{ id: 10, identifierValue: '104907' }];
const docs = (summary) => [{ id: 12, receiptId: 20, summary }];
const found = (summary, plate = 'JNN32') => findVehicleLoanDocumentMentions(docs(summary), loans, plate).get(10) ?? [];

describe('U09 read-only plate + loan evidence', () => {
  it('finds the compact exact plate and loan reference in one document', () => {
    assert.equal(found('Vehicle JNN32, Ergo loan 104907.').length, 1);
  });
  it('finds hyphenated plates JNN-32 without requiring a stored hyphen', () => {
    assert.equal(found('Vehicle JNN-32, Ergo loan 104907.').length, 1);
    assert.equal(found('Vehicle JNN32, Ergo loan 104907.', 'JNN-32').length, 1);
  });
  it('finds plates separated by ordinary or nonbreaking whitespace', () => {
    assert.equal(found('Vehicle JNN 32, Ergo loan 104907.').length, 1);
    assert.equal(found('Vehicle JNN\u00a032, Ergo loan 104907.').length, 1);
  });
  it('does not mistake longer surrounding vehicle codes for the exact plate', () => {
    for (const value of ['AJNN-32', 'JNN-321', 'JNN-32B', 'JNN32A', 'XJNN32', 'JNN--32']) {
      assert.equal(found(`Vehicle ${value}, Ergo loan 104907.`).length, 0, value);
    }
  });
  it('does not match across letters or unsupported plate separators', () => {
    assert.equal(found('Vehicle JNN/32, Ergo loan 104907.').length, 0);
    assert.equal(found('Vehicle JNN - 32, Ergo loan 104907.').length, 1);
  });
  it('requires loan and plate in the same document, never cross-document inference', () => {
    const rows = [{ id: 1, receiptId: 5, summary: 'JNN-32' }, { id: 2, receiptId: 6, summary: '104907' }];
    assert.equal(findVehicleLoanDocumentMentions(rows, loans, 'JNN32').size, 0);
  });
  it('does not accept partial loan references or invalid loan identities', () => {
    assert.equal(loanReferenceInSummary('loan 1049073', '104907'), false);
    assert.equal(found('Vehicle JNN32, Ergo loan 1049073.').length, 0);
    assert.equal(findVehicleLoanDocumentMentions(docs('JNN32 104907'), [{ id: 0, identifierValue: '104907' }], 'JNN32').size, 0);
  });
  it('retains original evidence ids, source excerpt and ambiguity flags', () => {
    const rows = [{ id: 12, receiptId: 20, summary: 'JNN-32 and loans 104907 and 205808' }];
    const answer = findVehicleLoanDocumentMentions(rows, [...loans, { id: 11, identifierValue: '205808' }], 'JNN32');
    assert.equal(answer.size, 2);
    assert.deepEqual(answer.get(10)?.map(({ documentId, receiptId, multipleLoans }) => [documentId, receiptId, multipleLoans]), [[12, 20, true]]);
    assert.match(answer.get(10)[0].excerpt, /JNN-32/);
  });
  it('shows the actual hyphenated evidence near the middle of a long summary', () => {
    const long = `${'word '.repeat(100)} JNN-32, loan 104907 ${'word '.repeat(100)}`;
    const result = found(long);
    assert.equal(result.length, 1);
    assert.match(result[0].excerpt, /JNN-32/);
    assert.ok(result[0].excerpt.length <= 242);
  });
  it('filters invalid document ids and repeated document-loan pairs without double counting', () => {
    const rows = [...docs('JNN-32 104907'), ...docs('JNN-32 104907'), { id: -1, receiptId: 2, summary: 'JNN-32 104907' }];
    assert.equal(findVehicleLoanDocumentMentions(rows, loans, 'JNN32').get(10)?.length, 1);
  });
});

describe('vehicle plate search candidate retrieval', () => {
  it('covers common spellings before boundary-aware filtering', () => {
    const terms = vehiclePlateQueryTerms('ABC123');
    for (const name of ['ABC123','ABC-123','ABC 123','ABC  123',
      'ABC -123','ABC- 123','ABC - 123','ABC\t123','ABC\u00a0123']) {
      assert.ok(terms.includes(name), name);
      assert.equal(findVehicleLoanDocumentMentions(
        [{id:3,receiptId:8,summary:`${name} loan 104907`}], loans, 'ABC123',
      ).get(10)?.length, 1, name);
    }
  });
  it('rejects invalid plates and keeps unusual compact identifiers bounded', () => {
    assert.deepEqual(vehiclePlateQueryTerms('###'), []);
    assert.deepEqual(vehiclePlateQueryTerms('AB12CD3'), ['AB12CD3']);
  });
});
