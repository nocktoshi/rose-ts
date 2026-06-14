/** Minimal arbitrary-precision natural numbers (UBig) for jam/cue and belt decomposition. */

import {PRIME} from './belt.js';
import {mustAt} from './must.js';

export class UBig {
  private constructor(readonly value: bigint) {}

  static zero(): UBig {
    return new UBig(0n);
  }

  static from(value: bigint | number | string): UBig {
    if (typeof value === 'string') {
      if (value === '' || value === '0') return UBig.zero();
      return new UBig(BigInt('0x' + value));
    }
    return new UBig(BigInt(value));
  }

  static fromLeBytes(bytes: Uint8Array): UBig {
    let v = 0n;
    for (let i = bytes.length - 1; i >= 0; i--) {
      v = (v << 8n) | BigInt(mustAt(bytes, i));
    }
    return new UBig(v);
  }

  isZero(): boolean {
    return this.value === 0n;
  }

  eq(other: UBig): boolean {
    return this.value === other.value;
  }

  bitLen(): number {
    if (this.isZero()) return 0;
    return this.value.toString(2).length;
  }

  toLeBytes(): Uint8Array {
    if (this.isZero()) return new Uint8Array([0]);
    let hex = this.value.toString(16);
    if (hex.length % 2 !== 0) hex = '0' + hex;
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      const byteHex = hex.slice(hex.length - 2 * (i + 1), hex.length - 2 * i);
      bytes[i] = parseInt(byteHex, 16);
    }
    return bytes;
  }

  toHex(): string {
    if (this.isZero()) return '0';
    return this.value.toString(16);
  }

  tryIntoU64(): bigint | null {
    if (this.value < 0n || this.value > 0xffffffffffffffffn) return null;
    return this.value;
  }

  divRem(divisor: bigint): {quotient: UBig; remainder: UBig} {
    const q = this.value / divisor;
    const r = this.value % divisor;
    return {quotient: new UBig(q), remainder: new UBig(r)};
  }

  clone(): UBig {
    return new UBig(this.value);
  }
}

export const beltsFromUbig = (num: UBig): bigint[] => {
  const belts: bigint[] = [];
  let remainder = num;
  const zero = UBig.zero();
  const p = PRIME;

  while (!remainder.eq(zero)) {
    const {quotient, remainder: rem} = remainder.divRem(p);
    belts.push(rem.value);
    remainder = quotient;
  }
  return belts;
};
