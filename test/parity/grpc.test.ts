import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'vitest';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../rose-wasm/scripts',
);

describe('parity: protobuf notes', () => {
  it('noteFromProtobuf → noteToProtobuf round-trip matches wasm', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const spend = pb.spends[0];
    const notePb = {
      note_version: {
        V1: {
          version: {value: '1'},
          origin_page: {value: '100'},
          name: spend.name,
          note_data: {entries: []},
          assets: {value: '131072'},
        },
      },
    };
    const wasmNote = wasm.noteFromProtobuf(notePb);
    const tsNote = RoseTs.noteFromProtobuf(notePb);
    expectParity('noteFromProtobuf', wasmNote, tsNote);

    const wasmBack = wasm.noteToProtobuf(wasmNote);
    const tsBack = RoseTs.noteToProtobuf(tsNote);
    expectParity('noteToProtobuf', wasmBack, tsBack);
  });
});
