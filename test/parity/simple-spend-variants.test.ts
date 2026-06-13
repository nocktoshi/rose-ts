import { describe, expect, it } from "vitest";
import { must, mustAt } from "../../src/core/must.js";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectParity } from "../helpers/parity.js";
import { HAX_PREIMAGE_DIGEST, HAX_PREIMAGE_JAM } from "../fixtures/hax.js";

const BUYER_PKH = "ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ";
const SELLER_PKH = "gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp";
const RECIPIENT = "2nEFkqYm51yfqsYgfRx72w8FF9bmWqnkJu8XqY8T7psXufjYNRxf5ME";

function htlcNotePb(assets: string) {
  return {
    note_version: {
      V1: {
        version: { value: "1" },
        origin_page: { value: "13" },
        name: {
          first: "4aAqswWFkNi6bey6Ac58QxsmMLV3VAC1LKnXwAaQvhYSZb6epr7aXap",
          last: "pnCZnNbZ1NGqeP2vSBBzQM3ecpjCoAnmFJH6Z6gGwpfjjBhNtddZqj",
        },
        note_data: { entries: [] },
        assets: { value: assets },
      },
    },
  };
}

describe("parity: simpleSpend HTLC / multisig variants", () => {
  it("simpleSpendHtlc refund (index 1) builds balanced tx", async () => {
    const wasm = await getWasm();
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const lock = RoseTs.htlcOrLock(hNock, BUYER_PKH, SELLER_PKH, 1000n);
    const note = wasm.noteFromProtobuf(htlcNotePb("4294967296"));
    const gift = "1234567" as RoseTs.Nicks;
    const fee = "2850816" as RoseTs.Nicks;

    const tsBuilder = new RoseTs.TxBuilder(settings);
    tsBuilder.simpleSpendHtlc(
      [note as never],
      [lock as never],
      1,
      RECIPIENT,
      gift,
      fee,
      SELLER_PKH,
      true
    );
    const sb = mustAt(tsBuilder.allSpends(), 0);
    expect(sb.isBalanced()).toBe(true);
    expect(sb.spend.tag).toBe(1);
    if (sb.spend.tag === 1) {
      expect(sb.spend.witness.lock_merkle_proof.spend_condition.some((p) => p.tag === "tim")).toBe(
        true
      );
    }
  });

  it("low-level HTLC claim spend recalcAndSetFee after addPreimage", async () => {
    const settings = RoseTs.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const lock = RoseTs.htlcOrLock(hNock, BUYER_PKH, SELLER_PKH, 1000n);
    const note = RoseTs.noteFromProtobuf(htlcNotePb("17009691"));
    const buyerLock = RoseTs.lockFromList([
      RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(BUYER_PKH)),
    ]);

    const spend = RoseTs.SpendBuilder.new(note, lock, 0, buyerLock);
    spend.seed(
      RoseTs.seedV1NewSinglePkh(
        BUYER_PKH,
        "17009691" as RoseTs.Nicks,
        RoseTs.noteHash(note),
        false
      )
    );
    expect(spend.addPreimage(HAX_PREIMAGE_JAM)).toBe(HAX_PREIMAGE_DIGEST);
    spend.computeRefund(false);

    const builder = new RoseTs.TxBuilder(settings);
    builder.spend(spend);
    builder.recalcAndSetFee(false);
    expect(spend.isBalanced()).toBe(true);
    const tx = builder.build();
    const witness = mustAt(tx.witness_data.data, 0)[1];
    expect(mustAt(witness.hax_map, 0)[0]).toBe(HAX_PREIMAGE_DIGEST);
  });

  it("simpleSpendHtlc claim attaches structural hax preimage", async () => {
    const wasm = await getWasm();
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const lock = RoseTs.htlcOrLock(hNock, BUYER_PKH, SELLER_PKH, 1000n);
    const note = wasm.noteFromProtobuf(htlcNotePb("4294967296"));
    const gift = "1234567" as RoseTs.Nicks;
    const fee = "2850816" as RoseTs.Nicks;

    const tsBuilder = new RoseTs.TxBuilder(settings);
    tsBuilder.simpleSpendHtlc(
      [note as never],
      [lock as never],
      0,
      RECIPIENT,
      gift,
      fee,
      BUYER_PKH,
      true,
      { preimageJam: HAX_PREIMAGE_JAM }
    );
    const tx = tsBuilder.build();
    const witness = mustAt(tx.witness_data.data, 0)[1];
    expect(witness.hax_map).toHaveLength(1);
    expect(mustAt(witness.hax_map, 0)[0]).toBe(HAX_PREIMAGE_DIGEST);

    const withLocks = new RoseTs.TxBuilder(settings);
    withLocks.simpleSpendWithLocks(
      [note as never],
      [lock as never],
      [0],
      RECIPIENT,
      gift,
      fee,
      BUYER_PKH,
      true,
      { preimageJam: HAX_PREIMAGE_JAM }
    );
    expectParity("simpleSpendHtlc vs withLocks claim", tx.id, withLocks.build().id);
    void wasm;
  });

  it("simpleSpendHtlc attaches memo/blob on output seed", async () => {
    const wasm = await getWasm();
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const lock = RoseTs.htlcOrLock(hNock, BUYER_PKH, SELLER_PKH, 1000n);
    const note = wasm.noteFromProtobuf(htlcNotePb("4294967296"));
    const gift = "1234567" as RoseTs.Nicks;
    const fee = "2850816" as RoseTs.Nicks;

    const tsBuilder = new RoseTs.TxBuilder(settings);
    tsBuilder.simpleSpendHtlc(
      [note as never],
      [lock as never],
      0,
      RECIPIENT,
      gift,
      fee,
      BUYER_PKH,
      true,
      {
        preimageJam: HAX_PREIMAGE_JAM,
        outputExtras: { memo: "htlc-claim", blob: "payload" },
      }
    );
    const tx = tsBuilder.build();
    const spend = mustAt(tx.spends, 0)[1];
    if (spend.tag !== 1) throw new Error("expected witness spend");
    const recipientSeed = must(spend.seeds.find((s) => s.gift === gift), "recipient seed");
    expect(recipientSeed.note_data.map(([k]) => k)).toEqual(["lock", "blob", "memo"]);
    expect(RoseTs.decodeNoteDataPackedUtf8(mustAt(recipientSeed.note_data, 1)[1] as never)).toBe("payload");
    expect(RoseTs.decodeNoteDataPackedUtf8(mustAt(recipientSeed.note_data, 2)[1] as never)).toBe("htlc-claim");
    void wasm;
  });

  it("multisigLock matches wasm m-of-n shape", async () => {
    const wasm = await getWasm();
    const hashes = [BUYER_PKH, SELLER_PKH, RECIPIENT];
    const wasmLock = wasm.lockFromList([
      wasm.spendConditionNewPkh(wasm.pkhNew(2n, hashes)),
    ]);
    const tsLock = RoseTs.multisigLock(2, hashes);
    const wasmPkh = (wasmLock as { tag: string; m: number; hashes: unknown[] }[]).find(
      (p) => p.tag === "pkh"
    );
    const tsPkh = (tsLock as { tag: string; m: number; hashes: unknown[] }[]).find(
      (p) => p.tag === "pkh"
    );
    expect(wasmPkh?.m).toBe(2);
    expect(tsPkh?.m).toBe(2);
    expect(tsPkh?.hashes).toHaveLength(3);
    expectParity("multisigLock wasm root", wasm.lockRootHash(wasmLock), wasm.lockRootHash(tsLock));
  });

  it("simpleSpendMultisig delegates to simpleSpendWithLocks", async () => {
    const wasm = await getWasm();
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const lock = RoseTs.htlcOrLock(hNock, BUYER_PKH, SELLER_PKH, 1000n);
    const note = wasm.noteFromProtobuf(htlcNotePb("1000000"));
    const gift = "500000" as RoseTs.Nicks;

    const a = new RoseTs.TxBuilder(settings);
    a.simpleSpendMultisig(
      [note as never],
      [lock as never],
      0,
      RECIPIENT,
      gift,
      null,
      BUYER_PKH,
      false,
      { memo: "msig", blob: "data" }
    );

    const b = new RoseTs.TxBuilder(settings);
    b.simpleSpendWithLocks(
      [note as never],
      [lock as never],
      [0],
      RECIPIENT,
      gift,
      null,
      BUYER_PKH,
      false,
      { outputExtras: { memo: "msig", blob: "data" } }
    );

    expectParity("simpleSpendMultisig vs withLocks", a.build(), b.build());
  });
});