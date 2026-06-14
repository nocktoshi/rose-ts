import type {
  Digest,
  Lock,
  Nicks,
  Note,
  NockchainTx,
  RawTxV1,
  TxEngineSettings,
} from '../types.js';
import {rawTxV1CalcId} from '../hash/tx.js';
import {
  lockFromList,
  lockRootHash,
  noteDataEmpty,
  noteHash,
  pkhSingle,
  spendConditionNewPkh,
} from '../hash/index.js';
import {SpendBuilder, TxBuilder} from './builder.js';
import {rawTxV1Outputs} from './outputs.js';
import {applyWitness} from './spends.js';

const TX_ENGINE_SETTINGS_V1_BYTHOS_DEFAULT: TxEngineSettings = {
  tx_engine_version: 1,
  tx_engine_patch: 1,
  min_fee: '256' as Nicks,
  cost_per_word: '16384' as Nicks, // 1 << 14
  witness_word_div: 4,
};

const nockchainTxToRawTx = (tx: NockchainTx): RawTxV1 => {
  const spends = applyWitness(tx.spends, tx.witness_data);
  const id = rawTxV1CalcId({version: 1, id: '' as Digest, spends});
  return {version: 1, id, spends};
};

/** Full OR(claim | refund) lock — use with `lock_sp_index: 0` to claim. */
export const htlcOrLock = (
  hNock: Digest,
  buyerPkh: Digest,
  sellerPkh: Digest,
  refundHeight: bigint,
): Lock => {
  const pkhSc = spendConditionNewPkh(pkhSingle(buyerPkh));
  const haxPrim = {tag: 'hax' as const, preimages: [hNock]};
  const claimSpendCondition = [...pkhSc, haxPrim];

  const refundPkhSc = spendConditionNewPkh(pkhSingle(sellerPkh));
  const timPrim = {
    tag: 'tim' as const,
    rel: {min: null, max: null},
    abs: {min: Number(refundHeight), max: null},
  };
  const refundSpendCondition = [...refundPkhSc, timPrim];

  return lockFromList([claimSpendCondition, refundSpendCondition]);
};

/** Digest of the HTLC OR lock tree. */
export const htlcLockRootDigest = (
  hNock: Digest,
  buyerPkh: Digest,
  sellerPkh: Digest,
  refundHeight: bigint,
): Digest => lockRootHash(htlcOrLock(hNock, buyerPkh, sellerPkh, refundHeight));

/** Extract the HTLC gift output `name.first` from simulated lock outputs. */
export const giftOutputFirstNameFromLockOutputs = (
  outputs: {name: {first: string}; assets: unknown}[],
  giftNicks: bigint,
): Digest => {
  for (const out of outputs) {
    if (BigInt(out.assets as string | number | bigint) === giftNicks) {
      return out.name.first as Digest;
    }
  }
  throw new Error('HTLC gift output not found in lock transaction outputs');
};

/**
 * Note `name.first` for the HTLC gift output (what the buyer claims).
 * Depends on the input note parent hash — only known once the funding note is chosen.
 */
export const htlcGiftOutputFirstName = (params: {
  hNock: Digest;
  buyerPkh: Digest;
  sellerPkh: Digest;
  refundHeight: bigint;
  giftNicks: bigint;
  inputNote: Note;
  /** Override the gift output's parent_hash (default: hash of inputNote). */
  parentHash?: Digest;
  /** Pkh the input note is locked to (default: sellerPkh). */
  inputPkh?: Digest;
  settings?: TxEngineSettings;
}): Digest => {
  const lockRootDigest = htlcLockRootDigest(
    params.hNock,
    params.buyerPkh,
    params.sellerPkh,
    params.refundHeight,
  );

  const parentHash = params.parentHash ?? noteHash(params.inputNote);
  const inputLock = lockFromList([
    spendConditionNewPkh(
      pkhSingle((params.inputPkh ?? params.sellerPkh) as Digest),
    ),
  ]);
  const spend = SpendBuilder.new(params.inputNote, inputLock, 0, inputLock);
  spend.seed({
    lock_root: lockRootDigest,
    note_data: noteDataEmpty(),
    gift: String(params.giftNicks) as Nicks,
    parent_hash: parentHash,
    output_source: null,
  });
  spend.computeRefund(false);

  const settings = params.settings ?? TX_ENGINE_SETTINGS_V1_BYTHOS_DEFAULT;
  const builder = new TxBuilder(settings);
  builder.spend(spend);
  builder.recalcAndSetFee(false);

  const raw = nockchainTxToRawTx(builder.build());
  const outputs = rawTxV1Outputs(raw, 0, settings);
  return giftOutputFirstNameFromLockOutputs(outputs, params.giftNicks);
};
