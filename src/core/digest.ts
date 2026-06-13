import { base58 } from "@scure/base";
import { PRIME } from "./belt.js";
import { mustAt } from "./must.js";
import { UBig } from "./ubig.js";

export type DigestBelts = [bigint, bigint, bigint, bigint, bigint];

const DIGEST_BYTE_LEN = 40;

export function beltsToUint(belts: DigestBelts): bigint {
  let result = 0n;
  let power = 1n;
  for (const belt of belts) {
    result += belt * power;
    power *= PRIME;
  }
  return result;
}

export function digestToBase58(belts: DigestBelts): string {
  let hex = beltsToUint(belts).toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  let start = 0;
  while (start < bytes.length && bytes[start] === 0) start++;
  return base58.encode(bytes.subarray(start));
}

export function digestFromBelts(belts: bigint[]): DigestBelts {
  return [
    mustAt(belts, 0),
    mustAt(belts, 1),
    mustAt(belts, 2),
    mustAt(belts, 3),
    mustAt(belts, 4),
  ] as DigestBelts;
}

/** Decode base58 Tip5 digest to five Goldilocks belts (rose-ztd Base58Belts<5>). */
export function digestFromBase58(s: string): DigestBelts {
  const decoded = base58.decode(s);
  const padded = new Uint8Array(DIGEST_BYTE_LEN);
  padded.set(decoded, DIGEST_BYTE_LEN - decoded.length);
  let num = UBig.zero();
  for (const byte of padded) {
    num = UBig.from((num.value << 8n) | BigInt(byte));
  }
  const belts: bigint[] = new Array(5).fill(0n);
  let remainder = num;
  const zero = UBig.zero();
  for (let i = 0; i < 5; i++) {
    const { quotient, remainder: rem } = remainder.divRem(PRIME);
    belts[i] = rem.value;
    remainder = quotient;
  }
  if (!remainder.eq(zero)) {
    throw new Error("invalid digest: too many belts");
  }
  return digestFromBelts(belts);
}

export function digestBeltsToBase58(belts: DigestBelts): string {
  return digestToBase58(belts);
}

/** 40-byte big-endian representation (rose-ztd `Digest::to_bytes`). */
export function digestBeltsToBytes(belts: DigestBelts): Uint8Array {
  let hex = beltsToUint(belts).toString(16);
  if (hex.length % 2 !== 0) hex = "0" + hex;
  const raw = new Uint8Array(hex.length / 2);
  for (let i = 0; i < raw.length; i++) {
    raw[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  const out = new Uint8Array(DIGEST_BYTE_LEN);
  out.set(raw, DIGEST_BYTE_LEN - raw.length);
  return out;
}

export function digestBytesFromBase58(s: string): Uint8Array {
  return digestBeltsToBytes(digestFromBase58(s));
}