import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";
import { getWasm } from "./helpers/wasm.js";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../rose-wasm/scripts"
);

describe("debug raw-tx", () => {
  it("probe wasm shapes", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const raw = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const builder = wasm.TxBuilder.fromRawTx(raw, settings);
    const nockTx = builder.build();

    console.log("raw spends type", Array.isArray(raw.spends), JSON.stringify(raw.spends).slice(0, 200));
    console.log("nockTx spends", JSON.stringify(nockTx.spends).slice(0, 300));
    console.log("witness_data", JSON.stringify(nockTx.witness_data).slice(0, 300));

    const wasmRaw = wasm.nockchainTxToRawTx(nockTx);
    console.log("wasmRaw id", wasmRaw.id);
    console.log("calcId", wasm.rawTxV1CalcId(wasmRaw));
    console.log("spendsV1Hash", wasm.spendsV1Hash(wasmRaw.spends));
    console.log("totalFees", wasm.rawTxTotalFees(raw));
    console.log("pb", JSON.stringify(wasm.rawTxToProtobuf(raw)).slice(0, 500));
    const name = wasmRaw.spends[0][0];
    const spend = wasmRaw.spends[0][1];
    console.log("nameHash", wasm.nameHash(name));
    console.log("witnessHash", wasm.witnessHash(spend.witness));
    console.log("spendV1SigHash", wasm.spendV1SigHash(spend));
    console.log("seedsV1Hash", wasm.seedsV1Hash(spend.seeds));
    console.log("lockMerkleProof", wasm.lockMerkleProofHash(spend.witness.lock_merkle_proof));
    console.log("pkhSig", wasm.pkhSignatureHash(spend.witness.pkh_signature));
    console.log("pkhSig wire", JSON.stringify(spend.witness.pkh_signature).slice(0, 400));
    console.log("pubkey wire", JSON.stringify(spend.witness.pkh_signature[0]).slice(0, 400));
    console.log("seeds wire", JSON.stringify(spend.seeds).slice(0, 300));
    console.log("seed0", JSON.stringify(spend.seeds[0]).slice(0, 200));
    if (wasm.seedV1Hash) console.log("seedV1Hash", wasm.seedV1Hash(spend.seeds[0]));
    console.log("fee", spend.fee);
    console.log("single entry pair", wasm.spendsV1Hash([[name, spend]]));
    console.log("nockTx witness", JSON.stringify(nockTx.witness_data.data[0][1]).slice(0, 200));

    const spendEntries = Object.entries(wasmRaw.spends as object);
    console.log("spend entries", spendEntries.length);
    if (Array.isArray(wasmRaw.spends)) {
      console.log("spends is array len", wasmRaw.spends.length, wasmRaw.spends[0]);
    }
  });
});