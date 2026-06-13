import { describe, it, expect } from "vitest";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectParity } from "../helpers/parity.js";
import { HAX_PREIMAGE_DIGEST, HAX_PREIMAGE_JAM } from "../fixtures/hax.js";

describe("parity: hash", () => {
  it("hashPreimage matches wasm on hax fixture jam", async () => {
    const wasm = await getWasm();
    const wasmDigest = wasm.hashPreimage(HAX_PREIMAGE_JAM);
    const tsDigest = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    expectParity("hashPreimage", wasmDigest, tsDigest);
    expect(wasmDigest).toBe(HAX_PREIMAGE_DIGEST);
  });

  it("hashPublicKey matches wasm for wasm-derived master key", async () => {
    const wasm = await getWasm();
    const seed = new Uint8Array(32).fill(0x42);
    const key = wasm.deriveMasterKey(seed);
    const pub = key.publicKey;
    const wasmPkh = wasm.hashPublicKey(pub);
    const tsPkh = RoseTs.hashPublicKey(pub);
    expectParity("hashPublicKey", wasmPkh, tsPkh);
  });
});