import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {mustAt} from '../../src/core/must.js';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';
import {HAX_PREIMAGE_DIGEST, HAX_PREIMAGE_JAM} from '../fixtures/hax.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../fixtures',
);

const fixtureRaw = async (wasm: Awaited<ReturnType<typeof getWasm>>) => {
  const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
  return wasm.rawTxFromProtobuf(pb);
};

describe('parity: witness assembly', () => {
  it('lockMerkleProofFromLock matches fixture witness', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const spend = mustAt(raw.spends, 0)[1];
    if (spend.tag !== 1) throw new Error('expected witness spend');
    const sc = spend.witness.lock_merkle_proof.spend_condition;
    const lock = wasm.lockFromList([sc]);
    const tsLmp = RoseTs.lockMerkleProofFromLock(lock as never, 0);
    expectParity(
      'lockMerkleProofFromLock',
      spend.witness.lock_merkle_proof,
      tsLmp,
    );
  });

  it('witnessNew matches fixture witness shell', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const spend = mustAt(raw.spends, 0)[1];
    if (spend.tag !== 1) throw new Error('expected witness spend');
    const sc = spend.witness.lock_merkle_proof.spend_condition;
    const lock = wasm.lockFromList([sc]);
    const tsWitness = RoseTs.witnessNew(lock as never, 0);
    expectParity(
      'witnessNew lock_merkle_proof',
      spend.witness.lock_merkle_proof,
      tsWitness.lock_merkle_proof,
    );
    expectParity(
      'witnessFromLock',
      tsWitness,
      RoseTs.witnessFromLock(lock as never, 0),
    );
  });

  it('spendV1FromLock matches spendV1NewWitness on fixture seeds', async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const spend = mustAt(raw.spends, 0)[1];
    if (spend.tag !== 1) throw new Error('expected witness spend');
    const sc = spend.witness.lock_merkle_proof.spend_condition;
    const lock = wasm.lockFromList([sc]);
    const tsWitness = RoseTs.witnessNew(lock as never, 0);
    const tsSpend = RoseTs.spendV1FromLock(
      lock as never,
      0,
      spend.seeds,
      spend.fee,
    );
    const wasmSpend = wasm.spendV1NewWitness(tsWitness, spend.seeds, spend.fee);
    expectParity('spendV1FromLock unsigned', wasmSpend, tsSpend);
  });

  it('witnessWithHaxPreimage attaches preimage noun', async () => {
    const wasm = await getWasm();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const buyerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(0));
    const sellerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(1));
    const lock = RoseTs.htlcOrLock(hNock, buyerPkh, sellerPkh, 1000n);
    const witness = RoseTs.witnessNew(lock, 0);
    const preimageNoun = wasm.cue(HAX_PREIMAGE_JAM);
    const withHax = RoseTs.witnessWithHaxPreimage(
      witness,
      HAX_PREIMAGE_DIGEST,
      preimageNoun as never,
    );
    expect(withHax.hax_map).toHaveLength(1);
    expect(mustAt(withHax.hax_map, 0)[0]).toBe(HAX_PREIMAGE_DIGEST);
  });
});
