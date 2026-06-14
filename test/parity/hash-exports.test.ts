import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'vitest';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';
import {HAX_PREIMAGE_JAM} from '../fixtures/hax.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../rose-wasm/scripts',
);

describe('parity: exported hash helpers', () => {
  it('hashNoun matches wasm on golden jam', async () => {
    const wasm = await getWasm();
    expectParity(
      'hashNoun',
      wasm.hashNoun(HAX_PREIMAGE_JAM),
      RoseTs.hashNoun(HAX_PREIMAGE_JAM),
    );
  });

  it('hashStructuredNoun matches wasm hashPreimage on golden jam', async () => {
    const wasm = await getWasm();
    const wasmDigest = wasm.hashPreimage(HAX_PREIMAGE_JAM);
    const tsDigest = RoseTs.hashStructuredNoun(HAX_PREIMAGE_JAM);
    expectParity('hashStructuredNoun', wasmDigest, tsDigest);
  });

  it('nameHash matches wasm on fixture input name', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const raw = wasm.rawTxFromProtobuf(pb);
    const name = raw.spends[0][0];
    expectParity(
      'nameHash',
      wasm.nameHash(name),
      RoseTs.nameHash(name as never),
    );
  });

  it('hashSpendV1SigHash matches wasm on fixture spend', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const raw = wasm.rawTxFromProtobuf(pb);
    const spend = raw.spends[0][1];
    expectParity(
      'hashSpendV1SigHash',
      wasm.spendV1SigHash(spend),
      RoseTs.hashSpendV1SigHash(spend as never),
    );
  });

  it('witnessFromLock matches fixture witness lock_merkle_proof', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const raw = wasm.rawTxFromProtobuf(pb);
    const fixtureWitness = raw.spends[0][1].witness;
    const sc = fixtureWitness.lock_merkle_proof.spend_condition;
    const lock = wasm.lockFromList([sc]);
    const tsWitness = RoseTs.witnessFromLock(lock as never, 0);
    expectParity(
      'witnessFromLock lock_merkle_proof',
      fixtureWitness.lock_merkle_proof,
      tsWitness.lock_merkle_proof,
    );
  });
});
