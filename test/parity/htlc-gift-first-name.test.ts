import {describe, it} from 'vitest';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';
import {HAX_PREIMAGE_JAM} from '../fixtures/hax.js';

const BUYER_PKH = 'ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ';
const SELLER_PKH = 'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp';

const sellerNotePb = (assets: string) => ({
  note_version: {
    V1: {
      version: {value: '1'},
      origin_page: {value: '13'},
      name: {
        first: '4aAqswWFkNi6bey6Ac58QxsmMLV3VAC1LKnXwAaQvhYSZb6epr7aXap',
        last: 'pnCZnNbZ1NGqeP2vSBBzQM3ecpjCoAnmFJH6Z6gGwpfjjBhNtddZqj',
      },
      note_data: {entries: []},
      assets: {value: assets},
    },
  },
});

describe('parity: htlcGiftOutputFirstName', () => {
  it('matches wasm lock-tx simulation', async () => {
    const wasm = await getWasm();
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const giftNicks = 65536n;
    const parentHash =
      '66oU5Tv4ukTdcNTWHwWJeNP873vJW1MLCWooj4udDn1cq3Yw8mTS2wH' as RoseTs.Digest;
    const inputNote = wasm.noteFromProtobuf(sellerNotePb('4294967296'));

    const lockRootDigest = wasm.lockRootHash(
      wasm.lockFromList([
        [
          ...wasm.spendConditionNewPkh(wasm.pkhSingle(BUYER_PKH)),
          {tag: 'hax', preimages: [hNock]},
        ],
        [
          ...wasm.spendConditionNewPkh(wasm.pkhSingle(SELLER_PKH)),
          {
            tag: 'tim',
            rel: {min: null, max: null},
            abs: {min: 1000, max: null},
          },
        ],
      ]),
    );

    const inputLock = wasm.lockFromList([
      wasm.spendConditionNewPkh(wasm.pkhSingle(SELLER_PKH)),
    ]);
    const spend = new wasm.SpendBuilder(inputNote, inputLock, 0, inputLock);
    spend.seed({
      lock_root: lockRootDigest,
      note_data: wasm.noteDataEmpty(),
      gift: String(giftNicks),
      parent_hash: parentHash,
    });
    spend.computeRefund(false);

    const builder = new wasm.TxBuilder(settings);
    builder.spend(spend);
    builder.recalcAndSetFee(false);
    const raw = wasm.nockchainTxToRawTx(builder.build());
    const wasmOutputs = wasm.rawTxV1Outputs(raw, 0, settings);
    const wasmFirst = RoseTs.giftOutputFirstNameFromLockOutputs(
      wasmOutputs,
      giftNicks,
    );

    const tsFirst = RoseTs.htlcGiftOutputFirstName({
      hNock,
      buyerPkh: BUYER_PKH,
      sellerPkh: SELLER_PKH,
      refundHeight: 1000n,
      giftNicks,
      inputNote: inputNote as never,
      parentHash,
      settings,
    });

    expectParity('htlcGiftOutputFirstName', wasmFirst, tsFirst);
  });

  it('is stable across synthetic input note assets', async () => {
    const wasm = await getWasm();
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const giftNicks = 65536n;
    const parentHash =
      '66oU5Tv4ukTdcNTWHwWJeNP873vJW1MLCWooj4udDn1cq3Yw8mTS2wH' as RoseTs.Digest;
    const base = wasm.noteFromProtobuf(sellerNotePb('4294967296'));
    const common = {
      hNock,
      buyerPkh: BUYER_PKH,
      sellerPkh: SELLER_PKH,
      refundHeight: 1000n,
      giftNicks,
      parentHash,
      settings,
    };

    const firstA = RoseTs.htlcGiftOutputFirstName({
      ...common,
      inputNote: {...base, assets: '8589934592'} as never,
    });
    const firstB = RoseTs.htlcGiftOutputFirstName({
      ...common,
      inputNote: {...base, assets: '12884901888'} as never,
    });

    expectParity('htlcGiftOutputFirstName stability', firstA, firstB);
  });
});
