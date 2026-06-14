import type {Digest} from '../types.js';
import {cue as cueTree} from '../noun/cue.js';
import {hashNounStructural, hashNounWhole} from './structural.js';

/** Varlen hash over whole jammed noun (`wasm hashNoun`). */
export const hashNoun = (nounJam: Uint8Array): Digest => {
  const tree = cueTree(nounJam);
  if (!tree) throw new Error('unable to cue noun jam');
  return hashNounWhole(tree) as Digest;
};

/** Structural hash-noun (`wasm hashStructuredNoun` / node hax check). */
export const hashStructuredNoun = (nounJam: Uint8Array): Digest => {
  const tree = cueTree(nounJam);
  if (!tree) throw new Error('unable to cue noun jam');
  return hashNounStructural(tree) as Digest;
};
