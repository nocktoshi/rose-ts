import type {
  Digest,
  Nicks,
  NockchainTx,
  Note,
  RawTxV1,
  SpendsV1,
  TxEngineSettings,
} from '../types.js';
import {rawTxV1Outputs as outputs} from './outputs.js';
import {rawTxV1CalcId as calcId} from '../hash/tx.js';
import {applyWitness, splitWitness} from './spends.js';

export {
  SpendBuilder,
  TxBuilder,
  type SimpleSpendLockOptions,
} from './builder.js';
export {
  giftOutputFirstNameFromLockOutputs,
  htlcGiftOutputFirstName,
  htlcOrLock,
  htlcLockRootDigest,
} from './htlc.js';
export {multisigLock} from './multisig.js';
export {
  witnessFromLock,
  witnessNew,
  lockMerkleProofFromLock,
  witnessFromLockMerkleProof,
  witnessClearSignatures,
  witnessWithPkhSignature,
  witnessWithHaxPreimage,
  spendV1FromLock,
  spendConditionFromWitness,
} from './witness.js';
export {applyWitness, splitWitness} from './spends.js';

export const txEngineSettingsV1Default = (): TxEngineSettings => ({
  tx_engine_version: 1,
  tx_engine_patch: 0,
  min_fee: '256' as Nicks,
  cost_per_word: '32768' as Nicks,
  witness_word_div: 1,
});

export const txEngineSettingsV1BythosDefault = (): TxEngineSettings => ({
  tx_engine_version: 1,
  tx_engine_patch: 1,
  min_fee: '256' as Nicks,
  cost_per_word: '16384' as Nicks,
  witness_word_div: 4,
});

export {
  rawTxV1InputNames,
  rawTxV1InputSpendConditions,
  rawTxV1New,
  rawTxV1Version,
  spendV1Fee,
  spendV1TotalGifts,
  spendV1UnclampedFee,
  spendsV1Fee,
  spendsV1TotalFees,
  spendsV1TotalGifts,
  spendsV1UnclampedFee,
} from './accessors.js';
export {spendV1NewWitness, spendV1NewLegacy, spendV1SigHash} from './spend.js';
export type {OutputNoteData} from './types.js';

export const spendsV1ApplyWitness = (
  spends: SpendsV1,
  witnessData: NockchainTx['witness_data'],
): SpendsV1 => applyWitness(spends, witnessData);

export const nockchainTxToRawTx = (tx: NockchainTx): RawTxV1 => {
  const spends = applyWitness(tx.spends, tx.witness_data);
  const id = calcId({version: 1, id: '' as Digest, spends});
  return {version: 1, id, spends};
};

/** Inverse of `nockchainTxToRawTx` (rose-nockchain-types `RawTxV1::to_nockchain_tx`). */
export const rawTxV1ToNockchainTx = (raw: RawTxV1): NockchainTx => {
  const {spends, witnessData} = splitWitness(raw.spends);
  const id = calcId({version: 1, id: '' as Digest, spends});
  return {
    version: 1,
    id,
    spends,
    display: {inputs: {tag: 0, inputs: []}, outputs: []},
    witness_data: witnessData,
  };
};

export const rawTxV1Outputs = (
  obj: RawTxV1,
  originPage: number,
  settings: TxEngineSettings,
): Note[] => outputs(obj, originPage, settings);

export const rawTxTotalFees = (obj: RawTxV1): Nicks => {
  let total = 0n;
  for (const [, spend] of obj.spends) {
    total += BigInt(spend.fee);
  }
  return String(total) as Nicks;
};

export const rawTxV1CalcId = (obj: RawTxV1): Digest => calcId(obj);

export const nockchainTxOutputs = (
  tx: NockchainTx,
  originPage: number,
  settings: TxEngineSettings,
): Note[] => outputs(nockchainTxToRawTx(tx), originPage, settings);
