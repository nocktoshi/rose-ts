import {describe, it, expect} from 'vitest';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';

// Reproduces atomic-nock lock.ts lockNock(): a p2pkh input note spent to an HTLC
// gift seed (hash lock_root) built as a LOOSE object WITHOUT output_source, plus
// the computed refund. The built NockchainTx must be byte-identical to wasm's so
// the Rose extension (same serde as wasm) can deserialize and sign it — omitting
// output_source or using non-canonical seed order makes Rose reject signTx.
const SELLER = '9vXqzHoeNn6RvZVrrs2SJuCAMmaWYcAn6YoF7ch7ALEt3KbCjtLuoC4';
const BUYER = 'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp';

const inputNotePb = (assets: string) => ({
  note_version: {
    V1: {
      version: {value: '1'},
      origin_page: {value: '86402'},
      name: {
        first: SELLER,
        last: '7gQoEPHkFHPPiruiMXRdbgEb5XLs657Bkn36QtmgK29zsLskFxfszsd',
      },
      note_data: {entries: []},
      assets: {value: assets},
    },
  },
});

describe('COMPAT: lock.ts build matches wasm (loose seed, no output_source)', () => {
  it('rose-ts TxBuilder.build() is structurally identical to wasm', async () => {
    const wasm = await getWasm();
    const settings = RoseTs.txEngineSettingsV1BythosDefault();
    const lockRoot = RoseTs.htlcLockRootDigest(
      '2nEFkqYm51yfqsYgfRx72w8FF9bmWqnkJu8XqY8T7psXufjYNRxf5ME',
      BUYER,
      SELLER,
      83000n,
    );
    const giftNicks = '3276800';
    const assets = '529700000';

    const buildTs = () => {
      const note = RoseTs.noteFromProtobuf(inputNotePb(assets));
      const inputLock = RoseTs.lockFromList([
        RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(SELLER)),
      ]);
      const spend = RoseTs.SpendBuilder.new(note, inputLock, 0, inputLock);
      spend.seed({
        lock_root: lockRoot,
        note_data: [],
        gift: giftNicks,
        parent_hash: RoseTs.noteHash(note),
      } as never);
      spend.computeRefund(false);
      const b = new RoseTs.TxBuilder(settings);
      b.spend(spend);
      b.recalcAndSetFee(false);
      return b.build();
    };
    const buildWasm = () => {
      const note = wasm.noteFromProtobuf(inputNotePb(assets) as never);
      const inputLock = wasm.lockFromList([
        wasm.spendConditionNewPkh(wasm.pkhSingle(SELLER)),
      ]);
      const spend = new wasm.SpendBuilder(note, inputLock, 0, inputLock);
      spend.seed({
        lock_root: lockRoot,
        note_data: [],
        gift: giftNicks,
        parent_hash: wasm.noteHash(note),
      } as never);
      spend.computeRefund(false);
      const b = new wasm.TxBuilder(settings);
      b.spend(spend);
      b.recalcAndSetFee(false);
      return b.build();
    };

    const norm = (v: unknown) =>
      JSON.parse(
        JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)),
      );
    const tsTx = buildTs();
    expect(norm(tsTx)).toEqual(norm(buildWasm()));

    // Definitive Rose check: Rose deserializes the NockchainTx with the SAME
    // serde as wasm. wasm.nockchainTxToRawTx ingests a NockchainTx via that path,
    // so if it accepts rose-ts's build() output, Rose's nock_signTx will too.
    // (Before the canonicalSeedsV1 fix this threw — the htlc seed lacked
    // output_source — which is exactly the opaque Rose rejection.)
    expect(() => wasm.nockchainTxToRawTx(tsTx as never)).not.toThrow();
  });

  it('rose-ts noteFromProtobuf matches wasm (the notes[] passed to nock_signTx)', async () => {
    const wasm = await getWasm();
    const pb = inputNotePb('529936384');
    const norm = (v: unknown) =>
      JSON.parse(
        JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? x.toString() : x)),
      );
    expect(norm(RoseTs.noteFromProtobuf(pb))).toEqual(
      norm(wasm.noteFromProtobuf(pb as never)),
    );
  });
});
