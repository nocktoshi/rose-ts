import {hashFixed, hashVarlen} from '../core/tip5/index.js';
import {PRIME} from '../core/belt.js';
import {digestFromBelts, digestToBase58} from '../core/digest.js';
import type {NounTree} from '../noun/types.js';

/**
 * Whether every atom leaf is a valid field element (`based`, in node terms) —
 * i.e. `0 <= atom < PRIME`. Nouns hashed into commitments (hax preimages,
 * note-data values) must be based: the node embeds them in a structural
 * `hashable:tip5` and rejects non-based leaves (`based:witness`,
 * tx-engine-1.hoon). Mirrors iris-rs `BasedNoun::from_noun` validation.
 */
export const nounIsBased = (noun: NounTree): boolean => {
  if (noun.tag === 'atom') {
    const v = noun.value.tryIntoU64();
    return v !== null && v < PRIME;
  }
  return nounIsBased(noun.head) && nounIsBased(noun.tail);
};

/** Throw unless `noun` is based (all atoms are valid field elements). */
export const assertBasedNoun = (noun: NounTree): void => {
  if (!nounIsBased(noun)) {
    throw new Error('noun atoms must be valid field elements (not based)');
  }
};

const structuralDigestBelts = (noun: NounTree): bigint[] => {
  if (noun.tag === 'atom') {
    const v = noun.value.tryIntoU64();
    if (v === null) throw new Error('atom too large for structural hash');
    return hashVarlen([1n, v]);
  }
  const l = structuralDigestBelts(noun.head);
  const r = structuralDigestBelts(noun.tail);
  return hashFixed([...l, ...r]);
};

export const hashNounStructural = (noun: NounTree): string =>
  digestToBase58(digestFromBelts(structuralDigestBelts(noun)));

export const hashNounWholeBelts = (noun: NounTree): bigint[] => {
  const leaves: bigint[] = [];
  const dyck: bigint[] = [];

  const visit = (n: NounTree): void => {
    if (n.tag === 'atom') {
      const v = n.value.tryIntoU64();
      if (v === null) throw new Error('atom too large');
      leaves.push(v);
    } else {
      dyck.push(0n);
      visit(n.head);
      dyck.push(1n);
      visit(n.tail);
    }
  };

  visit(noun);
  const combined = [BigInt(leaves.length), ...leaves, ...dyck];
  return hashVarlen(combined);
};

export const hashNounWhole = (noun: NounTree): string =>
  digestToBase58(digestFromBelts(hashNounWholeBelts(noun)));
