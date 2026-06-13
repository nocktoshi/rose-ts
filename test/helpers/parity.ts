import { expect } from "vitest";

/** Compare Uint8Arrays byte-for-byte. */
export function expectBytesEqual(a: Uint8Array, b: Uint8Array): void {
  expect(a.length).toBe(b.length);
  for (let i = 0; i < a.length; i++) {
    expect(a[i]).toBe(b[i]);
  }
}

/** Deep JSON equality (handles plain objects from wasm). */
export function expectDeepEqual<T>(actual: T, expected: T): void {
  expect(JSON.parse(JSON.stringify(actual))).toEqual(JSON.parse(JSON.stringify(expected)));
}

/**
 * Run wasm oracle + rose-ts with the same inputs; assert identical outputs.
 * Fails RED until rose-ts implementation matches.
 */
export function expectParity<T>(label: string, wasmOut: T, tsOut: T): void {
  try {
    expectDeepEqual(tsOut, wasmOut);
  } catch (err) {
    throw new Error(`parity mismatch (${label}): ${(err as Error).message}`, { cause: err });
  }
}