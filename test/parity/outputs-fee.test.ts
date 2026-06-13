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

describe("parity: outputs and fee", () => {
  it("rawTxV1Outputs matches wasm on built tx", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const raw = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const nockTx = wasm.TxBuilder.fromRawTx(raw, settings).build();
    const wasmRaw = wasm.nockchainTxToRawTx(nockTx);
    const originPage = 42;
    expectParity(
      "rawTxV1Outputs",
      wasm.rawTxV1Outputs(wasmRaw, originPage, settings),
      RoseTs.rawTxV1Outputs(wasmRaw as never, originPage, settings)
    );
  });

  it("TxBuilder.calcFee matches wasm on fixture builder", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const raw = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const wasmFee = wasm.TxBuilder.fromRawTx(raw, settings).calcFee();
    const tsFee = RoseTs.TxBuilder.fromRawTx(raw as never, settings).calcFee();
    expectParity("calcFee", wasmFee, tsFee);
  });
});