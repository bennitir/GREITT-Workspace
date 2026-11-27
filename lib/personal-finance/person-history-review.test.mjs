import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {classifyHistoryEvidence} from './person-history-review.ts';

const marks=(text,person='Jóhann',plate='JNN32')=>
  classifyHistoryEvidence({text},person,plate);

describe('read-only U08 person/plate evidence',()=>{
  it('preserves an exact Icelandic person-name match',()=>{
    assert.deepEqual(marks('Jóhann greiddi tryggingu.'),['PERSON','INSURANCE']);
  });
  it('does not attribute Jóhanna to Jóhann',()=>{
    assert.deepEqual(marks('Jóhanna greiddi tryggingu.'),['INSURANCE']);
  });
  it('does not match a name embedded within a longer name',()=>{
    assert.ok(!marks('Jóhanna Kristín í heimild.', 'Anna Kristín').includes('PERSON'));
    assert.ok(marks('Anna Kristín í heimild.', 'Anna Kristín').includes('PERSON'));
  });
  it('does not match a name embedded in a long alphanumeric token',()=>{
    assert.ok(!marks('ABJóhann12 bókaði þjónustu.').includes('PERSON'));
  });
  it('recognizes bare, spaced, and hyphenated plate spellings',()=>{
    for(const spelling of ['JNN32','JNN 32','JNN-32','JNN–32']){
      assert.ok(marks(`Trygging á ${spelling}.`).includes('PLATE'),spelling);
    }
  });
  it('does not match an embedded or extended plate number',()=>{
    for(const spelling of ['XJNN32','JNN321','JNN32X']){
      assert.ok(!marks(`Trygging á ${spelling}.`).includes('PLATE'),spelling);
    }
  });
  it('retains unrelated evidence categories',()=>{
    const result=marks('Sjóvá bifreiðagjald JNN-32');
    assert.deepEqual(result,['PLATE','INSURANCE','VEHICLE_TAX']);
  });
  it('does not invent identity or plate evidence from unrelated text',()=>{
    assert.deepEqual(marks('Handvirk leiðrétting í yfirliti.'),[]);
  });
});
