import {describe, it, expect} from 'vitest';
import * as RoseTs from '../src/index.js';
import {getWasm} from './helpers/wasm.js';

// Reproduces atomic-nock/src/nock/lock.ts lockNock(): a manually-constructed
// HTLC seed object that OMITS output_source (and uses a hash-string lock_root).
const SELLER = 'ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ';
const BUYER = 'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp';

const inputNotePb = (assets: string) => ({
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

const GOLDEN_JAM = Uint8Array.from([
  1, 4, 94, 58, 17, 242, 138, 59, 221, 17, 3, 236, 145, 212, 172, 51, 41, 91,
  17, 50, 64, 143, 128, 4, 27, 38, 225, 48, 160, 7, 16, 192, 24, 8, 250, 63, 48,
  130, 139, 12, 240, 187, 33, 147, 240, 145, 120, 104, 131, 3, 244, 36, 50, 199,
  221, 55, 56, 152, 120, 0, 129, 72, 209, 194, 114, 52, 110, 8, 86, 192, 239,
  178, 176, 65, 126, 22, 54, 38, 6,
]);

describe('COMPAT: pinned golden vectors (atomic-nock rose.test.ts.snap)', () => {
  it('hashPreimage / hashPublicKey / htlcLockRootDigest match pinned values', () => {
    const hNock = RoseTs.hashPreimage(GOLDEN_JAM);
    const buyerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(0));
    const sellerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(1));
    expect(hNock).toBe(
      '8XiEzPMGNQp29EwSdtGhHsyEmXsDR2AkZfuTWCfydWVA8XbKsLk7BGo',
    );
    expect(buyerPkh).toBe(
      'ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ',
    );
    expect(sellerPkh).toBe(
      'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp',
    );
    expect(RoseTs.htlcLockRootDigest(hNock, buyerPkh, sellerPkh, 1000n)).toBe(
      '9unhsEogr7AtzuTg8smkbpdkJjwgu6ZzSe5n57LYCRww6qtSHhwFzYM',
    );
  });

  it('spendConditionFirstName (wallet note lookup) matches wasm', async () => {
    const wasm = await getWasm();
    const pkh = 'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp';
    const sc = RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(pkh));
    expect(RoseTs.spendConditionFirstName(sc)).toBe(
      wasm.spendConditionFirstName(sc),
    );
  });
});

describe('COMPAT: HTLC secret roundtrip jam(tasBelts(hex)) -> hashPreimage (swap.ts)', () => {
  const HEXES = [
    '00'.repeat(32),
    'ff'.repeat(32),
    '0123456789abcdef'.repeat(4),
    'deadbeefcafef00d'.repeat(4),
  ];
  for (const hex of HEXES) {
    it(`jam bytes + hNock match wasm for hex ${hex.slice(0, 8)}…`, async () => {
      const wasm = await getWasm();
      const tsJam = RoseTs.jam(RoseTs.tasBelts(hex));
      const wasmJam = wasm.jam(wasm.tasBelts(hex));
      // The seller shares these jam bytes; they MUST be identical across impls.
      expect(Array.from(tsJam)).toEqual(Array.from(wasmJam));
      // hNock = hashPreimage(jam); seller, buyer, and node must agree.
      const tsH = RoseTs.hashPreimage(tsJam);
      expect(tsH).toBe(wasm.hashPreimage(wasmJam));
      // cross: TS hashing wasm's jam and vice-versa (seller≠buyer impl).
      expect(RoseTs.hashPreimage(wasmJam)).toBe(tsH);
      expect(wasm.hashPreimage(tsJam)).toBe(tsH);
    });
  }
});

describe('COMPAT: note protobuf roundtrip + field shapes (claim/refund/balance)', () => {
  it('noteFromProtobuf(noteToProtobuf(note)) is stable and matches wasm; .assets/.name usable', async () => {
    const wasm = await getWasm();
    const pb = inputNotePb('4294967296');
    const note = RoseTs.noteFromProtobuf(pb as never) as RoseTs.Note & {
      assets: unknown;
      name: {first: string; last: string};
    };
    // shapes the projects rely on
    expect(typeof note.name.first).toBe('string');
    expect(typeof note.name.last).toBe('string');
    expect(BigInt(String(note.assets))).toBe(4294967296n);
    // roundtrip stability + hash parity with wasm
    const rt = RoseTs.noteFromProtobuf(
      RoseTs.noteToProtobuf(note as never) as never,
    );
    expect(RoseTs.noteHash(rt)).toBe(RoseTs.noteHash(note as never));
    expect(RoseTs.noteHash(note as never)).toBe(
      wasm.noteHash(wasm.noteFromProtobuf(pb as never)),
    );
  });
});

describe('COMPAT: lock.ts manual seed without output_source', () => {
  it('build() + rawTxV1CalcId does not throw and matches wasm', async () => {
    const wasm = await getWasm();
    const settings = RoseTs.txEngineSettingsV1BythosDefault();
    const giftNicks = 1_000_000n;

    const inputNote = RoseTs.noteFromProtobuf(inputNotePb('5000000'));
    const hNock = '2nEFkqYm51yfqsYgfRx72w8FF9bmWqnkJu8XqY8T7psXufjYNRxf5ME';
    const lockRoot = RoseTs.htlcLockRootDigest(hNock, BUYER, SELLER, 83000n);
    const parentHash = RoseTs.noteHash(inputNote);
    const inputLock = RoseTs.lockFromList([
      RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(SELLER)),
    ]);

    // ---- exactly the shape lock.ts builds (note: no output_source) ----
    const htlcSeed = {
      lock_root: lockRoot,
      note_data: RoseTs.noteDataEmpty(),
      gift: String(giftNicks),
      parent_hash: parentHash,
    } as never;

    const tsSpend = RoseTs.SpendBuilder.new(inputNote, inputLock, 0, inputLock);
    tsSpend.seed(htlcSeed);
    tsSpend.computeRefund(false);
    const tsB = new RoseTs.TxBuilder(settings);
    tsB.spend(tsSpend);
    tsB.recalcAndSetFee(false);
    const tsTx = tsB.build(); // must NOT throw
    const tsId = RoseTs.rawTxV1CalcId(RoseTs.nockchainTxToRawTx(tsTx));

    // wasm equivalent: same seed but with explicit output_source: null
    const wasmSeed = {
      output_source: null,
      lock_root: lockRoot,
      note_data: [],
      gift: String(giftNicks),
      parent_hash: parentHash,
    };
    const wasmSpend = new wasm.SpendBuilder(inputNote, inputLock, 0, inputLock);
    wasmSpend.seed(wasmSeed as never);
    wasmSpend.computeRefund(false);
    const wasmB = new wasm.TxBuilder(settings);
    wasmB.spend(wasmSpend);
    wasmB.recalcAndSetFee(false);
    const wasmId = wasm.rawTxV1CalcId(wasm.nockchainTxToRawTx(wasmB.build()));

    expect(tsId).toBe(wasmId);
  });
});
