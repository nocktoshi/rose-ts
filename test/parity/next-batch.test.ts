import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'vitest';
import {mustAt} from '../../src/core/must.js';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures',
);

const BUYER_PKH = '9zpwNfGdcPT1QUKw2Fnw2zvftzpAYEjzZfTqGW8KLnf3NmEJ7yR5t2Y';

const fixtureRaw = async (wasm: Awaited<ReturnType<typeof getWasm>>) => {
  const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
  return wasm.rawTxFromProtobuf(pb);
};

describe('parity: next batch', () => {
  it('txEngineSettingsV1Default matches wasm', async () => {
    const wasm = await getWasm();
    expectParity(
      'txEngineSettingsV1Default',
      wasm.txEngineSettingsV1Default(),
      RoseTs.txEngineSettingsV1Default(),
    );
  });

  it('digest protobuf round-trip matches wasm', async () => {
    const wasm = await getWasm();
    const digest = BUYER_PKH;
    const wasmPb = wasm.digestToProtobuf(digest);
    const tsPb = RoseTs.digestToProtobuf(digest);
    expectParity('digestToProtobuf', wasmPb, tsPb);
    expectParity(
      'digestFromProtobuf',
      wasm.digestFromProtobuf(wasmPb),
      RoseTs.digestFromProtobuf(tsPb),
    );
  });

  it('spendConditionToProtobuf matches wasm', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const scPb =
      pb.spends[0].spend.spend_kind.Witness.witness.lock_merkle_proof
        .spend_condition;
    const sc = wasm.spendConditionFromProtobuf(scPb);
    expectParity(
      'spendConditionToProtobuf',
      wasm.spendConditionToProtobuf(sc),
      RoseTs.spendConditionToProtobuf(sc as never),
    );
  });

  it('raw tx accessors match wasm', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const wasmRaw = wasm.nockchainTxToRawTx(
      wasm.TxBuilder.fromRawTx(raw, settings).build(),
    );

    expectParity(
      'rawTxV1InputNames',
      wasm.rawTxV1InputNames(wasmRaw),
      RoseTs.rawTxV1InputNames(wasmRaw as never),
    );
    expectParity(
      'rawTxV1InputSpendConditions',
      wasm.rawTxV1InputSpendConditions(wasmRaw),
      RoseTs.rawTxV1InputSpendConditions(wasmRaw as never),
    );
    expectParity(
      'rawTxV1New id',
      wasm.rawTxV1New(wasmRaw.spends).id,
      RoseTs.rawTxV1New(wasmRaw.spends as never).id,
    );
  });

  it('spend fee accessors match wasm', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const wasmRaw = wasm.nockchainTxToRawTx(
      wasm.TxBuilder.fromRawTx(raw, settings).build(),
    );
    const spend = mustAt(wasmRaw.spends, 0)[1];

    expectParity(
      'spendV1Fee',
      wasm.spendV1Fee(spend),
      RoseTs.spendV1Fee(spend as never),
    );
    expectParity(
      'spendV1TotalGifts',
      wasm.spendV1TotalGifts(spend),
      RoseTs.spendV1TotalGifts(spend as never),
    );
    expectParity(
      'spendV1UnclampedFee',
      wasm.spendV1UnclampedFee(spend, settings),
      RoseTs.spendV1UnclampedFee(spend as never, settings),
    );
    expectParity(
      'spendsV1TotalGifts',
      wasm.spendsV1TotalGifts(wasmRaw.spends),
      RoseTs.spendsV1TotalGifts(wasmRaw.spends as never),
    );
    expectParity(
      'spendsV1TotalFees',
      wasm.spendsV1TotalFees(wasmRaw.spends),
      RoseTs.spendsV1TotalFees(wasmRaw.spends as never),
    );
    expectParity(
      'spendsV1UnclampedFee',
      wasm.spendsV1UnclampedFee(wasmRaw.spends, settings),
      RoseTs.spendsV1UnclampedFee(wasmRaw.spends as never, settings),
    );
    expectParity(
      'spendsV1Fee',
      wasm.spendsV1Fee(wasmRaw.spends, settings),
      RoseTs.spendsV1Fee(wasmRaw.spends as never, settings),
    );
  });

  it('lock helpers match wasm', async () => {
    const wasm = await getWasm();
    const pkh = wasm.pkhSingle(BUYER_PKH);
    const sc = wasm.spendConditionNewPkh(pkh);
    const lock = wasm.lockFromList([sc]);

    expectParity(
      'pkhNew',
      wasm.pkhNew(1n, [BUYER_PKH]),
      RoseTs.pkhNew(1n, [BUYER_PKH]),
    );
    expectParity('pkhHash', wasm.pkhHash(pkh), RoseTs.pkhHash(pkh as never));
    expectParity(
      'spendConditionPkh',
      wasm.spendConditionPkh(sc),
      RoseTs.spendConditionPkh(sc as never),
    );
    expectParity(
      'spendConditionBrn',
      wasm.spendConditionBrn(sc),
      RoseTs.spendConditionBrn(sc as never),
    );
    expectParity(
      'lockFromListBurnpad',
      wasm.lockFromListBurnpad([sc]),
      RoseTs.lockFromListBurnpad([sc as never]),
    );
    expectParity(
      'lockHeight burnpad',
      wasm.lockHeight(wasm.lockFromListBurnpad([sc])),
      RoseTs.lockHeight(RoseTs.lockFromListBurnpad([sc as never])),
    );
    void lock;
  });

  it('noun helpers match wasm', async () => {
    const wasm = await getWasm();
    const metadata = 'base:84532:0x742d35Cc6634C0532925a3b844Bc454e4438f44e';
    const wasmTas = wasm.tas(metadata);
    const tsTas = RoseTs.tas(metadata);
    expectParity('tas', wasmTas, tsTas);
    expectParity('untas', wasm.untas(wasmTas), RoseTs.untas(tsTas));

    const wasmBelts = wasm.atomToBelts(wasmTas);
    const tsBelts = RoseTs.atomToBelts(tsTas);
    expectParity('atomToBelts', wasmBelts, tsBelts);
    expectParity(
      'beltsToAtom',
      wasm.beltsToAtom(wasmBelts),
      RoseTs.beltsToAtom(tsBelts),
    );
  });
});
