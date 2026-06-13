import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectParity } from "../helpers/parity.js";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../rose-wasm/scripts"
);

describe("parity: raw-tx", () => {
  it("rawTxFromProtobuf matches wasm on fixture", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const wasmRaw = wasm.rawTxFromProtobuf(pb);
    const tsRaw = RoseTs.rawTxFromProtobuf(pb);
    expectParity("rawTxFromProtobuf", wasmRaw, tsRaw);
  });

  it("nockchainTxToRawTx matches wasm on fromNockchainTx fixture", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const rawFromPb = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const builder = wasm.TxBuilder.fromRawTx(rawFromPb, settings);
    const nockTx = builder.build();
    const wasmRaw = wasm.nockchainTxToRawTx(nockTx);
    const tsRaw = RoseTs.nockchainTxToRawTx(nockTx as never);
    expectParity("nockchainTxToRawTx", wasmRaw, tsRaw);
  });

  it("rawTxV1CalcId matches wasm on built tx", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const rawFromPb = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const builder = wasm.TxBuilder.fromRawTx(rawFromPb, settings);
    const nockTx = builder.build();
    const wasmRaw = wasm.nockchainTxToRawTx(nockTx);
    expectParity(
      "rawTxV1CalcId",
      wasm.rawTxV1CalcId(wasmRaw),
      RoseTs.rawTxV1CalcId(wasmRaw as never)
    );
  });

  it("rawTxTotalFees matches wasm", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const raw = wasm.rawTxFromProtobuf(pb);
    expectParity("rawTxTotalFees", wasm.rawTxTotalFees(raw), RoseTs.rawTxTotalFees(raw as never));
  });

  it("rawTxToProtobuf matches wasm", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const raw = wasm.rawTxFromProtobuf(pb);
    expectParity("rawTxToProtobuf", wasm.rawTxToProtobuf(raw), RoseTs.rawTxToProtobuf(raw as never));
  });
});