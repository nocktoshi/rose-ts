import {describe, it} from 'vitest';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';

const BUYER_PKH = '9zpwNfGdcPT1QUKw2Fnw2zvftzpAYEjzZfTqGW8KLnf3NmEJ7yR5t2Y';

describe('parity: lock APIs', () => {
  it('lockHeight matches wasm', async () => {
    const wasm = await getWasm();
    const sc = wasm.spendConditionNewPkh(wasm.pkhSingle(BUYER_PKH));
    const lock = wasm.lockFromList([sc]);
    expectParity(
      'lockHeight',
      wasm.lockHeight(lock),
      RoseTs.lockHeight(lock as never),
    );
  });

  it('spendConditionHash matches wasm', async () => {
    const wasm = await getWasm();
    const sc = wasm.spendConditionNewPkh(wasm.pkhSingle(BUYER_PKH));
    expectParity(
      'spendConditionHash',
      wasm.spendConditionHash(sc),
      RoseTs.spendConditionHash(sc as never),
    );
  });

  it('lockHash matches wasm on HTLC lock', async () => {
    const wasm = await getWasm();
    const hNock = '8XiEzPMGNQp29EwSdtGhHsyEmXsDR2AkZfuTWCfydWVA8XbKsLk7BGo';
    const lock = RoseTs.htlcOrLock(
      hNock,
      'ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ',
      'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp',
      1000n,
    );
    expectParity('lockHash', wasm.lockHash(lock), RoseTs.lockHash(lock));
  });

  it('lockProve matches wasm on single-PKH lock', async () => {
    const wasm = await getWasm();
    const sc = wasm.spendConditionNewPkh(wasm.pkhSingle(BUYER_PKH));
    const lock = wasm.lockFromList([sc]);
    expectParity(
      'lockProve',
      wasm.lockProve(lock, 0),
      RoseTs.lockProve(lock as never, 0),
    );
  });

  it('hashU64 matches wasm', async () => {
    const wasm = await getWasm();
    expectParity('hashU64', wasm.hashU64(1000n), RoseTs.hashU64(1000n));
  });
});
