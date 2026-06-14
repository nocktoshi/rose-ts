/** Lazily loaded wasm oracle (initialized in test/setup.ts). */
export const getWasm = async () => import('@nockchain/rose-wasm');
