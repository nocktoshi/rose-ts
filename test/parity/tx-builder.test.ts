import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it, expect} from 'vitest';
import * as RoseTs from '../../src/index.js';
import {DEFAULT_FEE_PER_WORD} from '../../src/constants.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../rose-wasm/scripts',
);

describe('parity: tx-builder', () => {
  it('txEngineSettingsV1BythosDefault matches wasm', async () => {
    const wasm = await getWasm();
    const wasmSettings = wasm.txEngineSettingsV1BythosDefault();
    const tsSettings = RoseTs.txEngineSettingsV1BythosDefault();
    expectParity('txEngineSettingsV1BythosDefault', wasmSettings, tsSettings);
    expect(BigInt(wasmSettings.cost_per_word)).toBe(DEFAULT_FEE_PER_WORD);
  });

  it('TxBuilder.fromRawTx().build() matches wasm', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const raw = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const wasmTx = wasm.TxBuilder.fromRawTx(raw, settings).build();
    const tsTx = RoseTs.TxBuilder.fromRawTx(raw as never, settings).build();
    expectParity('TxBuilder.build', wasmTx, tsTx);
  });

  it('seedV1NewSinglePkh matches wasm', async () => {
    const wasm = await getWasm();
    const pkh = '9zpwNfGdcPT1QUKw2Fnw2zvftzpAYEjzZfTqGW8KLnf3NmEJ7yR5t2Y';
    const parent = '66oU5Tv4ukTdcNTWHwWJeNP873vJW1MLCWooj4udDn1cq3Yw8mTS2wH';
    const gift = '65536' as const;
    expectParity(
      'seedV1NewSinglePkh',
      wasm.seedV1NewSinglePkh(pkh, gift, parent, false),
      RoseTs.seedV1NewSinglePkh(pkh, gift, parent, false),
    );
  });
});
