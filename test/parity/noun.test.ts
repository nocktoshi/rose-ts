import { describe, it } from "vitest";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectBytesEqual, expectParity } from "../helpers/parity.js";

describe("parity: noun", () => {
  it("tasBelts matches wasm for a 32-byte hex secret", async () => {
    const wasm = await getWasm();
    const hex =
      "a1b2c3d4e5f60718293a4b5c6d7e8f9012345678901234567890abcdef12345678";
    const wasmNoun = wasm.tasBelts(hex);
    const tsNoun = RoseTs.tasBelts(hex);
    expectParity("tasBelts", wasmNoun, tsNoun);
  });

  it("jam(tasBelts(hex)) matches wasm bytes", async () => {
    const wasm = await getWasm();
    const hex =
      "deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
    const wasmJam = wasm.jam(wasm.tasBelts(hex));
    const tsJam = RoseTs.jam(RoseTs.tasBelts(hex));
    expectBytesEqual(tsJam, wasmJam);
  });

  it("cue(jam(tasBelts)) round-trips through tasBelts hex", async () => {
    const wasm = await getWasm();
    const hex = "cafebabe".repeat(8);
    const jammed = wasm.jam(wasm.tasBelts(hex));
    const wasmRound = wasm.cue(jammed);
    const tsRound = RoseTs.cue(jammed);
    expectParity("cue round-trip", wasmRound, tsRound);
  });
});