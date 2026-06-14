import type {
  Digest,
  Hax,
  Lock,
  LockPrimitive,
  LockRoot,
  LockTim,
  Nicks,
  NoteData,
  Pkh,
  SeedV1,
  SpendCondition,
} from '../types.js';

import {mustAt} from '../core/must.js';
import {cue} from '../noun/cue.js';
import {hashNounStructural, nounIsBased} from './structural.js';
import {proveHashableLock} from '../core/merkle.js';
import {lockHeight} from '../core/lock.js';
import {
  hashHax,
  hashLock,
  hashLockRoot,
  hashPkh,
  hashSpendCondition,
  hashToDigest,
  hashTuple,
  hashBool,
  hashU64 as hashU64Belts,
} from '../core/hashable.js';
import {fromWire, type NounWire} from '../noun/types.js';
import {noteDataPushPkh} from './note.js';

export const hashPreimage = (preimageJam: Uint8Array): Digest => {
  const noun = cue(preimageJam);
  if (!noun) throw new Error('unable to cue preimage jam');
  if (!nounIsBased(noun)) {
    throw new Error(
      'Preimage contains atom leaves that are not valid field elements',
    );
  }
  return hashNounStructural(noun) as Digest;
};

export const pkhSingle = (hash: Digest): Pkh => ({
  m: 1,
  hashes: [hash] as unknown as Pkh['hashes'],
});

export const pkhNew = (m: number | bigint, hashes: Digest[]): Pkh => ({
  m: Number(m),
  hashes: hashes as unknown as Pkh['hashes'],
});

export const pkhHash = (pkh: Pkh): Digest => hashToDigest(hashPkh(pkh));

export const haxHash = (hax: Hax): Digest => hashToDigest(hashHax(hax));

export const haxHashPreimage = (preimage: NounWire): Digest =>
  hashNounStructural(fromWire(preimage)) as Digest;

export const spendConditionPkh = (sc: SpendCondition): Pkh[] =>
  sc
    .filter((p): p is LockPrimitive & {tag: 'pkh'} => p.tag === 'pkh')
    .map(p => ({m: p.m, hashes: p.hashes}));

export const spendConditionHax = (sc: SpendCondition): Hax[] =>
  sc
    .filter((p): p is LockPrimitive & {tag: 'hax'} => p.tag === 'hax')
    .map(p => ({preimages: p.preimages}));

export const spendConditionTim = (sc: SpendCondition): LockTim[] =>
  sc
    .filter((p): p is LockPrimitive & {tag: 'tim'} => p.tag === 'tim')
    .map(p => ({rel: p.rel, abs: p.abs}));

export const spendConditionBrn = (sc: SpendCondition): boolean =>
  sc.some(p => p.tag === 'brn');

export const spendConditionNewPkh = (pkh: Pkh): SpendCondition => {
  const hashes = Array.isArray(pkh.hashes) ? pkh.hashes : [];
  return [{tag: 'pkh', m: pkh.m, hashes: hashes as unknown as Pkh['hashes']}];
};

export const spendConditionFirstName = (obj: SpendCondition): Digest =>
  hashToDigest(hashTuple(hashBool(true), hashSpendCondition(obj)));

export const lockFromList = (sps: SpendCondition[]): Lock => {
  const n = sps.length;
  if (n === 1) return mustAt(sps, 0);
  if (n === 2) return {tag: 2, p: mustAt(sps, 0), q: mustAt(sps, 1)};
  if (n === 4) {
    return {
      tag: 4,
      p: {p: mustAt(sps, 0), q: mustAt(sps, 1)},
      q: {p: mustAt(sps, 2), q: mustAt(sps, 3)},
    };
  }
  if (n === 8) {
    return {
      tag: 8,
      p: {
        p: {p: mustAt(sps, 0), q: mustAt(sps, 1)},
        q: {p: mustAt(sps, 2), q: mustAt(sps, 3)},
      },
      q: {
        p: {p: mustAt(sps, 4), q: mustAt(sps, 5)},
        q: {p: mustAt(sps, 6), q: mustAt(sps, 7)},
      },
    };
  }
  if (n === 16) {
    const v8 = (i: number) => ({
      p: {p: mustAt(sps, i), q: mustAt(sps, i + 1)},
      q: {p: mustAt(sps, i + 2), q: mustAt(sps, i + 3)},
    });
    return {
      tag: 16,
      p: {p: v8(0), q: v8(4)},
      q: {p: v8(8), q: v8(12)},
    };
  }
  throw new Error(
    `Invalid spend condition count ${n}, must be 1, 2, 4, 8, or 16`,
  );
};

export const lockFromListBurnpad = (sps: SpendCondition[]): Lock => {
  if (sps.length === 0 || sps.length > 16) {
    throw new Error(
      `Spend condition count must be between 1 and 16, got ${sps.length}`,
    );
  }
  const padded = [...sps];
  const target = 1 << Math.ceil(Math.log2(sps.length));
  const brn: SpendCondition = [{tag: 'brn'}];
  while (padded.length < target) padded.push(brn);
  return lockFromList(padded);
};

export const lockRootHash = (v: LockRoot): Digest =>
  hashToDigest(hashLockRoot(v));

export {lockHeight};

export const lockProve = (lock: Lock, leafIndex: number) => {
  const {proof, axis} = proveHashableLock(lock, leafIndex);
  return {proof, axis: Number(axis)};
};

export const hashU64 = (value: bigint): Digest =>
  hashToDigest(hashU64Belts(value));

export const spendConditionHash = (sc: SpendCondition): Digest =>
  hashToDigest(hashSpendCondition(sc));

export const lockHash = (lock: Lock): Digest => hashToDigest(hashLock(lock));

export const noteDataEmpty = (): NoteData => [];

export {
  noteHash,
  nameV1,
  nameHash,
  noteDataFeeWords,
  noteDataPushPkh,
  noteDataPushLock,
  noteDataPushMemo,
  noteDataPushBlob,
  decodeNoteDataPackedUtf8,
  decodePackedBlobUtf8,
  encodeBlobBelts,
  MAX_MEMO_UTF8_BYTES,
  MAX_BLOB_UTF8_BYTES,
} from './note.js';
export {hashNoun, hashStructuredNoun} from './noun.js';
export {
  hashName,
  hashSeedV1Digest,
  hashSeedsV1Digest,
  hashSpendV1SigHash,
  hashWitnessDigest,
  hashPkhSignatureDigest,
  hashSpendsV1,
  hashLockMerkleProofDigest,
} from './tx.js';

export const seedV1NewSinglePkh = (
  pkh: Digest,
  gift: Nicks,
  parentHash: Digest,
  includeLockData: boolean,
): SeedV1 => {
  const pkhObj = pkhSingle(pkh);
  const lock = spendConditionNewPkh(pkhObj);
  let note_data = noteDataEmpty();
  if (includeLockData) {
    note_data = noteDataPushPkh(note_data, pkhObj);
  }
  return {
    output_source: null,
    lock_root: lock,
    note_data,
    gift,
    parent_hash: parentHash,
  };
};
