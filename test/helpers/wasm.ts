/** Lazily loaded wasm oracle (initialized in test/setup.ts). */
export async function getWasm() {
  return import("@nockchain/rose-wasm");
}