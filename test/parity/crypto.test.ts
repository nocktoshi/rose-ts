import { describe, it } from "vitest";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";

describe("parity: crypto", () => {
  it("verifySignature matches wasm for signMessage round-trip", async () => {
    const wasm = await getWasm();
    const seed = new Uint8Array(32);
    seed[31] = 7;
    const key = wasm.deriveMasterKey(seed);
    const priv = key.privateKey;
    if (!priv) throw new Error("deriveMasterKey returned no private key");
    const message = "atomic-nock-solver auth challenge";
    const sig = wasm.signMessage(priv, message);
    const pub = key.publicKey;
    const wasmOk = wasm.verifySignature(pub, sig, message);
    const tsOk = RoseTs.verifySignature(pub, sig, message);
    if (wasmOk !== tsOk) {
      throw new Error(`verifySignature parity: wasm=${wasmOk} ts=${tsOk}`);
    }
  });
});