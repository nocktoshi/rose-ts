/** Minimal 256-bit modular arithmetic for Cheetah signature verification. */

import { mustAt } from "./must.js";

const U256_MASK = (1n << 256n) - 1n;

function mod256(x: bigint): bigint {
  return x & U256_MASK;
}

export class U256 {
  readonly value: bigint;

  constructor(value: bigint) {
    this.value = mod256(value);
  }

  static readonly ZERO = new U256(0n);

  static fromU64(n: bigint): U256 {
    return new U256(n);
  }

  static fromBeBytes(bytes: Uint8Array): U256 {
    let v = 0n;
    for (const b of bytes) {
      v = (v << 8n) | BigInt(b);
    }
    return new U256(v);
  }

  static fromLeBytes(bytes: Uint8Array): U256 {
    let v = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
      v = (v << 8n) | BigInt(mustAt(bytes, i));
    }
    return new U256(v);
  }

  static fromLeHex(hex: string): U256 {
    const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
    if (clean.length === 0) return U256.ZERO;
    const padded =
      clean.length % 2 === 0 ? clean : "0" + clean;
    const bytes = new Uint8Array(padded.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(padded.slice(i * 2, i * 2 + 2), 16);
    }
    return U256.fromLeBytes(bytes);
  }

  toBeBytes(): Uint8Array {
    const out = new Uint8Array(32);
    let v = this.value;
    for (let i = 31; i >= 0; i--) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  toLeBytes(): Uint8Array {
    const out = new Uint8Array(32);
    let v = this.value;
    for (let i = 0; i < 32; i++) {
      out[i] = Number(v & 0xffn);
      v >>= 8n;
    }
    return out;
  }

  lt(other: U256): boolean {
    return this.value < other.value;
  }

  eq(other: U256): boolean {
    return this.value === other.value;
  }

  addMod(other: U256, modulus: U256): U256 {
    return new U256((this.value + other.value) % modulus.value);
  }

  mulMod(other: U256, modulus: U256): U256 {
    return new U256((this.value * other.value) % modulus.value);
  }
}

/** Group order for Cheetah curve. */
export const G_ORDER = U256.fromBeBytes(
  new Uint8Array([
    0x7a, 0xf2, 0x59, 0x9b, 0x3b, 0x3f, 0x22, 0xd0, 0x56, 0x3f, 0xbf, 0x0f, 0x99, 0x0a, 0x37, 0xb5,
    0x32, 0x7a, 0xa7, 0x23, 0x30, 0x15, 0x77, 0x22, 0xd4, 0x43, 0x62, 0x3e, 0xae, 0xd4, 0xac, 0xcf,
  ])
);

export const P_BIG = U256.fromBeBytes(
  new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xff, 0x00, 0x00, 0x00, 0x01,
  ])
);

export const P_BIG_2 = U256.fromBeBytes(
  new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    0xff, 0xff, 0xff, 0xfe, 0x00, 0x00, 0x00, 0x02, 0xff, 0xff, 0xff, 0xfe, 0x00, 0x00, 0x00, 0x01,
  ])
);

export const P_BIG_3 = U256.fromBeBytes(
  new Uint8Array([
    0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xff, 0xff, 0xff, 0xfd, 0x00, 0x00, 0x00, 0x05,
    0xff, 0xff, 0xff, 0xf9, 0x00, 0x00, 0x00, 0x05, 0xff, 0xff, 0xff, 0xfd, 0x00, 0x00, 0x00, 0x01,
  ])
);

export function truncGOrder(digest: bigint[]): U256 {
  let result = U256.fromU64(mustAt(digest, 0));
  const term1 = P_BIG.mulMod(U256.fromU64(mustAt(digest, 1)), G_ORDER);
  result = result.addMod(term1, G_ORDER);
  const term2 = P_BIG_2.mulMod(U256.fromU64(mustAt(digest, 2)), G_ORDER);
  result = result.addMod(term2, G_ORDER);
  const term3 = P_BIG_3.mulMod(U256.fromU64(mustAt(digest, 3)), G_ORDER);
  return result.addMod(term3, G_ORDER);
}