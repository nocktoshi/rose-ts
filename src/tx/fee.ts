import {encodeWitness} from '../noun/codec.js';
import {nounWords} from '../noun/words.js';
import {noteDataFeeWords} from '../hash/note.js';
import type {
  LockRoot,
  Name,
  NoteData,
  SeedV1,
  Spend1V1,
  SpendV1,
  TxEngineSettings,
} from '../types.js';
import {lockRootHash} from '../hash/index.js';
import {missingUnlocksFee as missingUnlocksFeeImpl} from './unlocks.js';

const seedNoteDataWords = (seed: SeedV1): bigint =>
  noteDataFeeWords(seed.note_data);

export const spendCalcWords = (spend: SpendV1): [bigint, bigint] => {
  if (spend.tag !== 1) {
    const seeds = Array.isArray(spend.seeds) ? spend.seeds : [];
    const seedWords = seeds.reduce((acc, s) => acc + seedNoteDataWords(s), 0n);
    return [seedWords, 0n];
  }
  const s = spend as Spend1V1;
  const seeds = Array.isArray(s.seeds) ? s.seeds : [];
  const seedWords = seeds.reduce((acc, sd) => acc + seedNoteDataWords(sd), 0n);
  const witnessWords = nounWords(encodeWitness(s.witness));
  return [seedWords, witnessWords];
};

const mergeNoteDataByLockRoot = (spends: SpendV1[]): Map<string, NoteData> => {
  const merged = new Map<string, NoteData>();
  for (const spend of spends) {
    const seeds = spend.tag === 1 ? spend.seeds : spend.seeds;
    for (const seed of seeds) {
      const key = lockRootHash(seed.lock_root);
      const prev = merged.get(key);
      if (!prev) {
        merged.set(key, [...seed.note_data]);
        continue;
      }
      const map = new Map(prev);
      for (const [k, v] of seed.note_data) map.set(k, v);
      merged.set(key, [...map.entries()]);
    }
  }
  return merged;
};

export const wordsForOrderedSpends = (
  spends: Iterable<SpendV1>,
  settings: TxEngineSettings,
): [bigint, bigint] => {
  if (settings.tx_engine_version === 0) {
    throw new Error('fee() called on v0 settings');
  }
  const list = [...spends];
  let sw = 0n;
  let ww = 0n;
  if (settings.tx_engine_patch === 0) {
    for (const spend of list) {
      const [s, w] = spendCalcWords(spend);
      sw += s;
      ww += w;
    }
  } else {
    for (const spend of list) {
      const [, w] = spendCalcWords(spend);
      ww += w;
    }
    for (const noteData of mergeNoteDataByLockRoot(list).values()) {
      sw += noteDataFeeWords(noteData);
    }
  }
  return [sw, ww];
};

export const wordsForUnorderedSpends = (
  spends: Iterable<[Name, SpendV1]>,
  settings: TxEngineSettings,
): [bigint, bigint] =>
  wordsForOrderedSpends(
    [...spends].map(([, s]) => s),
    settings,
  );

export const calcFeeFromSpends = (
  spends: Iterable<SpendV1>,
  settings: TxEngineSettings,
): bigint => {
  const [sw, ww] = wordsForOrderedSpends(spends, settings);
  const fee =
    BigInt(settings.cost_per_word) * sw +
    (BigInt(settings.cost_per_word) * ww) / BigInt(settings.witness_word_div);
  const minFee = BigInt(settings.min_fee);
  return fee > minFee ? fee : minFee;
};

export const missingUnlocksFee = (
  spend: SpendV1,
  settings: TxEngineSettings,
): bigint => missingUnlocksFeeImpl(spend, settings);

export const lockRootKey = (root: LockRoot): string => lockRootHash(root);
