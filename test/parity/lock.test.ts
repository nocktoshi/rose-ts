import {describe, it} from 'vitest';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';

/** Sample digests — valid base58 Tip5 form from wasm test fixtures. */
const BUYER_PKH = '9zpwNfGdcPT1QUKw2Fnw2zvftzpAYEjzZfTqGW8KLnf3NmEJ7yR5t2Y';
const SELLER_PKH = '66oU5Tv4ukTdcNTWHwWJeNP873vJW1MLCWooj4udDn1cq3Yw8mTS2wH';
const H_NOCK = '8XiEzPMGNQp29EwSdtGhHsyEmXsDR2AkZfuTWCfydWVA8XbKsLk7BGo';
const REFUND_HEIGHT = 9_999_999n;

const htlcOrLockWasm = (wasm: Awaited<ReturnType<typeof getWasm>>) => {
  const pkhSc = wasm.spendConditionNewPkh(wasm.pkhSingle(BUYER_PKH));
  const haxPrim = {tag: 'hax' as const, preimages: [H_NOCK]};
  const claimSpendCondition = [...pkhSc, haxPrim];

  const refundPkhSc = wasm.spendConditionNewPkh(wasm.pkhSingle(SELLER_PKH));
  const timPrim = {
    tag: 'tim' as const,
    rel: {min: null, max: null},
    abs: {min: Number(REFUND_HEIGHT), max: null},
  };
  const refundSpendCondition = [...refundPkhSc, timPrim];

  return wasm.lockFromList([claimSpendCondition, refundSpendCondition]);
};

const htlcOrLockTs = () => {
  const pkhSc = RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(BUYER_PKH));
  const haxPrim = {tag: 'hax' as const, preimages: [H_NOCK]};
  const claimSpendCondition = [...pkhSc, haxPrim];

  const refundPkhSc = RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(SELLER_PKH));
  const timPrim = {
    tag: 'tim' as const,
    rel: {min: null, max: null},
    abs: {min: Number(REFUND_HEIGHT), max: null},
  };
  const refundSpendCondition = [...refundPkhSc, timPrim];

  return RoseTs.lockFromList([claimSpendCondition, refundSpendCondition]);
};

describe('parity: lock', () => {
  it('pkhSingle matches wasm', async () => {
    const wasm = await getWasm();
    expectParity(
      'pkhSingle',
      wasm.pkhSingle(BUYER_PKH),
      RoseTs.pkhSingle(BUYER_PKH),
    );
  });

  it('spendConditionNewPkh matches wasm', async () => {
    const wasm = await getWasm();
    const pkh = wasm.pkhSingle(BUYER_PKH);
    expectParity(
      'spendConditionNewPkh',
      wasm.spendConditionNewPkh(pkh),
      RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(BUYER_PKH)),
    );
  });

  it('spendConditionFirstName matches wasm', async () => {
    const wasm = await getWasm();
    const sc = wasm.spendConditionNewPkh(wasm.pkhSingle(BUYER_PKH));
    expectParity(
      'spendConditionFirstName',
      wasm.spendConditionFirstName(sc),
      RoseTs.spendConditionFirstName(
        RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(BUYER_PKH)),
      ),
    );
  });

  it('HTLC lockFromList matches wasm (Number refundHeight)', async () => {
    const wasm = await getWasm();
    expectParity('htlc lockFromList', htlcOrLockWasm(wasm), htlcOrLockTs());
  });

  it('HTLC lockRootHash matches wasm', async () => {
    const wasm = await getWasm();
    const wasmLock = htlcOrLockWasm(wasm);
    const tsLock = htlcOrLockTs();
    expectParity(
      'lockRootHash',
      wasm.lockRootHash(wasmLock),
      RoseTs.lockRootHash(tsLock),
    );
  });

  it('noteDataEmpty matches wasm', async () => {
    const wasm = await getWasm();
    expectParity('noteDataEmpty', wasm.noteDataEmpty(), RoseTs.noteDataEmpty());
  });
});
