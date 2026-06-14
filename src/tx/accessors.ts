import type {
  Digest,
  Name,
  Nicks,
  RawTxV1,
  Spend1V1,
  SpendCondition,
  SpendV1,
  SpendsV1,
  TxEngineSettings,
} from '../types.js';
import {rawTxV1CalcId} from '../hash/tx.js';
import {spendConditionFromWitness} from './witness.js';
import {spendCalcWords, wordsForUnorderedSpends} from './fee.js';

export const spendV1Fee = (spend: SpendV1): Nicks => spend.fee;

export const spendV1TotalGifts = (spend: SpendV1): Nicks => {
  const seeds = spend.tag === 1 ? spend.seeds : spend.seeds;
  let total = 0n;
  for (const seed of seeds) total += BigInt(seed.gift);
  return String(total) as Nicks;
};

export const spendV1UnclampedFee = (
  spend: SpendV1,
  settings: TxEngineSettings,
): Nicks => {
  const [sw, ww] = spendCalcWords(spend);
  const fee = BigInt(settings.cost_per_word) * (sw + ww);
  return String(fee) as Nicks;
};

export const spendsV1TotalGifts = (spends: SpendsV1): Nicks => {
  let total = 0n;
  for (const [, spend] of spends) {
    total += BigInt(spendV1TotalGifts(spend));
  }
  return String(total) as Nicks;
};

export const spendsV1TotalFees = (spends: SpendsV1): Nicks => {
  let total = 0n;
  for (const [, spend] of spends) {
    total += BigInt(spend.fee);
  }
  return String(total) as Nicks;
};

export const spendsV1UnclampedFee = (
  spends: SpendsV1,
  settings: TxEngineSettings,
): Nicks => {
  const [sw, ww] = wordsForUnorderedSpends(spends, settings);
  const fee =
    BigInt(settings.cost_per_word) * sw +
    (BigInt(settings.cost_per_word) * ww) / BigInt(settings.witness_word_div);
  return String(fee) as Nicks;
};

export const spendsV1Fee = (
  spends: SpendsV1,
  settings: TxEngineSettings,
): Nicks => {
  const unclamped = BigInt(spendsV1UnclampedFee(spends, settings));
  const minFee = BigInt(settings.min_fee);
  return String(unclamped > minFee ? unclamped : minFee) as Nicks;
};

export const rawTxV1InputNames = (raw: RawTxV1): Name[] =>
  raw.spends.map(([name]) => name);

export const rawTxV1InputSpendConditions = (raw: RawTxV1): SpendCondition[] => {
  const conditions: SpendCondition[] = [];
  for (const [, spend] of raw.spends) {
    if (spend.tag !== 1) return [];
    const s = spend as Spend1V1;
    conditions.push(spendConditionFromWitness(s.witness));
  }
  return conditions;
};

export const rawTxV1New = (spends: SpendsV1): RawTxV1 => {
  const id = rawTxV1CalcId({version: 1, id: '' as Digest, spends});
  return {version: 1, id, spends};
};

export const rawTxV1Version = (raw: RawTxV1): 1 => {
  void raw;
  return 1;
};
