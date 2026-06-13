import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it, expect } from "vitest";
import { mustAt } from "../../src/core/must.js";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectParity } from "../helpers/parity.js";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../rose-wasm/scripts"
);

async function fixtureRaw(wasm: Awaited<ReturnType<typeof getWasm>>) {
  const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
  return wasm.rawTxFromProtobuf(pb);
}

describe("parity: tx round-trip", () => {
  it("rawTxV1ToNockchainTx matches wasm", async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    expectParity(
      "rawTxV1ToNockchainTx",
      wasm.rawTxV1ToNockchainTx(raw),
      RoseTs.rawTxV1ToNockchainTx(raw as never)
    );
  });

  it("nockchainTxToRawTx ∘ rawTxV1ToNockchainTx round-trips raw tx", async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const wasmBack = wasm.nockchainTxToRawTx(wasm.rawTxV1ToNockchainTx(raw));
    const tsBack = RoseTs.nockchainTxToRawTx(RoseTs.rawTxV1ToNockchainTx(raw as never));
    expectParity("raw round-trip", wasmBack, tsBack);
  });

  it("TxBuilder.fromNockchainTx matches wasm rebuild", async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const nockTx = wasm.TxBuilder.fromRawTx(raw, settings).build();
    const wasmRebuilt = wasm.TxBuilder.fromNockchainTx(nockTx, settings).build();
    const tsRebuilt = RoseTs.TxBuilder.fromNockchainTx(nockTx as never, settings).build();
    expectParity("fromNockchainTx rebuild", wasmRebuilt, tsRebuilt);
  });

  it("TxBuilder.validate passes on signed fixture", async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const wasmBuilder = wasm.TxBuilder.fromRawTx(raw, settings);
    wasmBuilder.validate();
    const tsBuilder = RoseTs.TxBuilder.fromRawTx(raw as never, settings);
    expect(() => tsBuilder.validate()).not.toThrow();
  });

  it("TxBuilder.validate fails when signatures are stripped", async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const wasmBuilder = wasm.TxBuilder.fromRawTx(raw, settings);
    expect(() => wasmBuilder.validate()).not.toThrow();

    const tsBuilder = RoseTs.TxBuilder.fromRawTx(raw as never, settings);
    for (const sb of tsBuilder.allSpends()) {
      sb.invalidateSigs();
    }
    expect(() => tsBuilder.validate()).toThrow();
  });

  it("SpendBuilder.missingUnlocks matches wasm on unsigned spend", async () => {
    const wasm = await getWasm();
    const raw = await fixtureRaw(wasm);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const wasmSpend = mustAt(wasm.TxBuilder.fromRawTx(raw, settings).allSpends(), 0);
    const tsSb = mustAt(RoseTs.TxBuilder.fromRawTx(raw as never, settings).allSpends(), 0);
    wasmSpend.invalidateSigs();
    tsSb.invalidateSigs();
    expectParity("missingUnlocks", wasmSpend.missingUnlocks(), tsSb.missingUnlocks());
  });

  it("spendConditionFromProtobuf matches wasm on fixture witness spend condition", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const scPb = pb.spends[0].spend.spend_kind.Witness.witness.lock_merkle_proof.spend_condition;
    const wasmSc = wasm.spendConditionFromProtobuf(scPb);
    const tsSc = RoseTs.spendConditionFromProtobuf(scPb);
    expectParity("spendConditionFromProtobuf", wasmSc, tsSc);
  });

  it("spendCondition round-trip through protobuf encode", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const scPb = pb.spends[0].spend.spend_kind.Witness.witness.lock_merkle_proof.spend_condition;
    const tsSc = RoseTs.spendConditionFromProtobuf(scPb);
    const wasmEnc = wasm.spendConditionToProtobuf(tsSc);
    const tsEnc = RoseTs.spendConditionFromProtobuf(RoseTs.spendConditionToProtobuf(tsSc));
    expectParity("spendCondition protobuf round-trip", tsSc, tsEnc);
    expectParity("spendConditionToProtobuf", wasmEnc, RoseTs.spendConditionToProtobuf(tsSc));
  });
});