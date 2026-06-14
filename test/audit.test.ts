import {describe, it, expect} from 'vitest';
import * as RoseTs from '../src/index.js';
import {encodeLock} from '../src/noun/codec.js';
import {toWire} from '../src/noun/types.js';
import {getWasm} from './helpers/wasm.js';

const KEYS = [
  'ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ',
  'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp',
  '2nEFkqYm51yfqsYgfRx72w8FF9bmWqnkJu8XqY8T7psXufjYNRxf5ME',
  '3mCt7nT11XNGQmEvpaSSaU7QnkPpi3dy8Nf6cyabb4UxCU2bKjWoxN2',
  '6xefAkmuxMmKxPCxvAc6rkWqD1uZ9buXk8tzthuzjvArhLGX7mBRA84',
];

const notePb = (assets: string) => ({
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

describe('AUDIT: multi-element ZSet (pkh m-of-n)', () => {
  for (const n of [1, 2, 3, 4, 5]) {
    it(`lockRootHash matches wasm for ${n}-of-${n} multisig`, async () => {
      const wasm = await getWasm();
      const keys = KEYS.slice(0, n);
      const lock = RoseTs.multisigLock(n, keys);
      expect(RoseTs.lockRootHash(lock)).toBe(wasm.lockRootHash(lock));
    });
  }
});

describe('AUDIT: encodeLock includes version tag', () => {
  // Build locks of each height from distinct single-pkh spend conditions.
  const scList = (n: number) =>
    KEYS.slice(0, n).map(k => RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(k)));
  for (const n of [1, 2, 4]) {
    it(`lockToNoun matches wasm for height with ${n} conditions`, async () => {
      const wasm = await getWasm();
      const lock = RoseTs.lockFromList(scList(n));
      const tsNoun = JSON.stringify(toWire(encodeLock(lock as never)));
      const wasmNoun = JSON.stringify(wasm.lockToNoun(lock));
      expect(tsNoun).toBe(wasmNoun);
    });
  }
});

describe('AUDIT: spends ZMap ordering (multi-input tx id)', () => {
  const namedNotePb = (first: string, last: string, assets: string) => ({
    note_version: {
      V1: {
        version: {value: '1'},
        origin_page: {value: '13'},
        name: {first, last},
        note_data: {entries: []},
        assets: {value: assets},
      },
    },
  });

  it('two-input simpleSpend tx id matches wasm', async () => {
    const wasm = await getWasm();
    const settings = RoseTs.txEngineSettingsV1BythosDefault();
    const notesPb = [
      namedNotePb(KEYS[0], KEYS[1], '1000000'),
      namedNotePb(KEYS[2], KEYS[3], '2000000'),
    ];
    const recipient = KEYS[4];
    const refund = KEYS[0];
    const spender = KEYS[1];

    const build = (engine: typeof RoseTs | typeof wasm) => {
      const notes = notesPb.map(pb => engine.noteFromProtobuf(pb as never));
      const locks = notes.map(() => ({
        lock: engine.lockFromList([
          engine.spendConditionNewPkh(engine.pkhSingle(spender)),
        ]),
        lock_sp_index: 0,
      }));
      const b = new engine.TxBuilder(settings as never);
      b.simpleSpend(
        notes as never,
        locks as never,
        recipient,
        '2500000' as never,
        null,
        refund,
        false,
      );
      return b.build();
    };

    expect(build(RoseTs).id).toBe(build(wasm).id);
  });
});

describe('AUDIT: multisig-input tx end-to-end', () => {
  it('spending a 2-of-3 multisig note yields wasm-identical tx id', async () => {
    const wasm = await getWasm();
    const settings = RoseTs.txEngineSettingsV1BythosDefault();
    const notePb = {
      note_version: {
        V1: {
          version: {value: '1'},
          origin_page: {value: '13'},
          name: {first: KEYS[0], last: KEYS[1]},
          note_data: {entries: []},
          assets: {value: '5000000'},
        },
      },
    };
    const refund = KEYS[3];

    const note = RoseTs.noteFromProtobuf(notePb as never);
    const lock = RoseTs.multisigLock(2, [KEYS[0], KEYS[1], KEYS[2]]);
    const refundLock = RoseTs.lockFromList([
      RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(refund)),
    ]);

    const tsSpend = RoseTs.SpendBuilder.new(note, lock, 0, refundLock);
    tsSpend.computeRefund(false);
    const tsB = new RoseTs.TxBuilder(settings);
    tsB.spend(tsSpend);
    tsB.recalcAndSetFee(false);

    const wasmSpend = new wasm.SpendBuilder(note, lock, 0, refundLock);
    wasmSpend.computeRefund(false);
    const wasmB = new wasm.TxBuilder(settings);
    wasmB.spend(wasmSpend);
    wasmB.recalcAndSetFee(false);

    expect(tsB.build().id).toBe(wasmB.build().id);
  });
});

describe('AUDIT: seed ZSet ordering / dedup', () => {
  for (const includeLockData of [false, true]) {
    it(`three equal-gift seeds (includeLockData=${includeLockData}) hash like wasm`, async () => {
      const wasm = await getWasm();
      const note = RoseTs.noteFromProtobuf(notePb('3000'));
      const parent = RoseTs.noteHash(note);
      const seedsArgs: [string, string][] = [
        [KEYS[0], '1000'],
        [KEYS[1], '1000'],
        [KEYS[2], '1000'],
      ];
      const tsSeeds = seedsArgs.map(([pkh, gift]) =>
        RoseTs.seedV1NewSinglePkh(
          pkh,
          gift as RoseTs.Nicks,
          parent,
          includeLockData,
        ),
      );
      const wasmSeeds = seedsArgs.map(([pkh, gift]) =>
        wasm.seedV1NewSinglePkh(pkh, gift, parent, includeLockData),
      );
      // Content hash (ZSet ordering by full SeedV1::to_noun()).
      expect(RoseTs.hashSeedsV1Digest(tsSeeds)).toBe(
        wasm.seedsV1Hash(wasmSeeds),
      );
    });
  }
});
