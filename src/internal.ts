/**
 * @nockchain/rose-ts/internal — low-level, consensus-critical protocol
 * primitives (noun tree, tip5 sponge, Goldilocks field arithmetic, tip5
 * digests, structural hashing).
 *
 * These are the building blocks the wallet API is itself built on. They are
 * exposed on a dedicated subpath so that node/indexer code (e.g. block parsing
 * and block-id recomputation) can hash and serialize nouns *identically* to the
 * wallet, rather than re-implementing — and risking divergence from — these
 * routines. Unstable surface: prefer the top-level API where one exists.
 */

// --- Noun tree representation + wire (string|array) conversion. ---
export type {NounWire, NounAtom, NounCell, NounTree} from './noun/types.js';
export {
  atom,
  cons,
  toWire,
  fromWire,
  mugNoun,
  weightNoun,
} from './noun/types.js';

// --- jam/cue at the NounTree level (richer than the public string-wire form). ---
export {jam as jamTree} from './noun/jam.js';
export {cue as cueTree} from './noun/cue.js';

// --- tip5 hashing primitives (Goldilocks sponge). ---
export {permute, hashVarlen, hashFixed} from './core/tip5/index.js';

// --- Goldilocks field element arithmetic. ---
export type {Belt} from './core/belt.js';
export {
  PRIME,
  basedCheck,
  badd,
  bneg,
  bsub,
  bmul,
  binv,
  bpow,
  montify,
  montReduction,
  beltsFromBytes,
} from './core/belt.js';

// --- Big unsigned integers as noun atoms. ---
export {UBig, beltsFromUbig} from './core/ubig.js';

// --- tip5 digest <-> base58 / bytes / belts. ---
export type {DigestBelts} from './core/digest.js';
export {
  beltsToUint,
  digestToBase58,
  digestFromBelts,
  digestFromBase58,
  digestBeltsToBase58,
  digestBeltsToBytes,
  digestBytesFromBase58,
} from './core/digest.js';

// --- Structural noun hashing helpers. ---
export {
  nounIsBased,
  assertBasedNoun,
  hashNounStructural,
  hashNounWholeBelts,
  hashNounWhole,
} from './hash/structural.js';
