import type {NounTree} from './types.js';

/** Atom = 1 word; cell = sum of children (rose-nockchain-types `noun_words`). */
export const nounWords = (noun: NounTree): bigint => {
  if (noun.tag === 'atom') return 1n;
  return nounWords(noun.head) + nounWords(noun.tail);
};
