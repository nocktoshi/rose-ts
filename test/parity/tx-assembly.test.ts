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
  '../../../rose-wasm/scripts',
);

const fixtureRaw = async (wasm: Awaited<ReturnType<typeof getWasm>>) => {
  const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
  return wasm.rawTxFromProtobuf(pb);
};

describe('parity: tx assembly', () => {
  it('spendV1NewWitness matches wasm', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const spend = mustAt(raw.spends, 0)[1];
    if (spend.tag !== 1) throw new Error('expected witness spend');
    const rebuilt = wasm.spendV1NewWitness(
      spend.witness,
      spend.seeds,
      spend.fee,
    );
    const tsRebuilt = RoseTs.spendV1NewWitness(
      spend.witness,
      spend.seeds,
      spend.fee,
    );
    expectParity('spendV1NewWitness', rebuilt, tsRebuilt);
  });

  it('spendV1SigHash matches wasm', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const spend = mustAt(raw.spends, 0)[1];
    expectParity(
      'spendV1SigHash',
      wasm.spendV1SigHash(spend),
      RoseTs.spendV1SigHash(spend as never),
    );
  });

  it('rawTxV1Version matches wasm', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    expectParity(
      'rawTxV1Version',
      wasm.rawTxV1Version(raw),
      RoseTs.rawTxV1Version(raw as never),
    );
  });

  it('PublicKey fromHex/toHex matches wasm', async () => {
    const wasm = await getWasm();
    const seed = new Uint8Array(32);
    seed[31] = 3;
    const key = wasm.deriveMasterKey(seed);
    const hex = wasm.publicKeyToHex(wasm.publicKeyFromBeBytes(key.publicKey));
    const tsPk = RoseTs.publicKeyFromBeBytes(key.publicKey);
    expectParity('publicKeyToHex', hex, RoseTs.publicKeyToHex(tsPk));
    const wasmFromHex = wasm.publicKeyFromHex(hex);
    const tsFromHex = RoseTs.publicKeyFromHex(hex);
    if (!wasmFromHex || !tsFromHex) throw new Error('fromHex failed');
    expectParity(
      'publicKeyFromHex round-trip',
      wasm.publicKeyToHex(wasmFromHex),
      RoseTs.publicKeyToHex(tsFromHex),
    );
  });

  it('publicKeyVerify matches wasm on fixture spend sig-hash', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const spend = mustAt(raw.spends, 0)[1];
    if (spend.tag !== 1) throw new Error('expected witness spend');
    const digest = wasm.spendV1SigHash(spend);
    const entry = mustAt(spend.witness.pkh_signature, 0);
    const pubkeyB58 = entry[1][0];
    const sig = entry[1][1];
    expectParity(
      'publicKeyVerify',
      wasm.publicKeyVerify(pubkeyB58, digest, sig),
      RoseTs.publicKeyVerify(
        RoseTs.PublicKey.fromBase58(pubkeyB58),
        digest,
        sig,
      ),
    );
  });
});
