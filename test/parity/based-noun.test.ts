import {describe, it, expect} from 'vitest';
import {hashPreimage} from '../../src/index.js';
import {nounIsBased} from '../../src/hash/structural.js';
import {PRIME} from '../../src/core/belt.js';
import {UBig} from '../../src/core/ubig.js';
import {atom, cons} from '../../src/noun/types.js';
import {jam} from '../../src/noun/jam.js';
import {HAX_PREIMAGE_JAM, HAX_PREIMAGE_DIGEST} from '../fixtures/hax.js';

// Port of iris-rs #25 (BasedNoun): hax preimages / note-data values must be
// `based` — every atom a valid field element (< PRIME) — and are hashed
// structurally. Decoding/ingest rejects non-based nouns, matching the node's
// based:witness check.
describe('based-noun (iris-rs #25)', () => {
  it("hashPreimage still matches the node's hash-noun for a real based preimage", () => {
    expect(hashPreimage(HAX_PREIMAGE_JAM)).toBe(HAX_PREIMAGE_DIGEST);
  });

  it('nounIsBased accepts field elements and rejects atoms >= PRIME', () => {
    expect(nounIsBased(atom(UBig.from(0n)))).toBe(true);
    expect(nounIsBased(atom(UBig.from(PRIME - 1n)))).toBe(true);
    expect(nounIsBased(atom(UBig.from(PRIME)))).toBe(false);
    expect(nounIsBased(atom(UBig.from((1n << 64n) - 1n)))).toBe(false); // u64::MAX
    expect(nounIsBased(atom(UBig.from(1n << 100n)))).toBe(false); // > u64
  });

  it('a cell is based only if every leaf is based', () => {
    expect(nounIsBased(cons(atom(UBig.from(1n)), atom(UBig.from(2n))))).toBe(
      true,
    );
    expect(nounIsBased(cons(atom(UBig.from(1n)), atom(UBig.from(PRIME))))).toBe(
      false,
    );
  });

  it('hashPreimage rejects a non-based preimage jam', () => {
    const badJam = jam(atom(UBig.from(PRIME)));
    expect(() => hashPreimage(badJam)).toThrow(/field element/i);
  });
});
