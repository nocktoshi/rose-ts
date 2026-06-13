/** Goldilocks prime field arithmetic (port of rose-ztd belt/mod.rs). */

import { mustAt } from "./must.js";

export const PRIME = 18446744069414584321n;
export const PRIME_128 = 18446744069414584321n;
const R2 = 18446744065119617025n;
const U64_MASK = 0xffffffffffffffffn;

export type Belt = bigint;

export function basedCheck(a: Belt): boolean {
  return a >= 0n && a < PRIME;
}

function u64(x: Belt): Belt {
  return x & U64_MASK;
}

export function montReduction(a: bigint): Belt {
  const x1 = (a >> 32n) & 0xffffffffn;
  const x2 = a >> 64n;
  const x0 = a & 0xffffffffn;
  const c = (x0 + x1) << 32n;
  const f = c >> 64n;
  const d = c - (x1 + f * PRIME_128);
  if (x2 >= d) {
    return u64(x2 - d);
  }
  return u64(x2 + PRIME_128 - d);
}

export function montiply(a: Belt, b: Belt): Belt {
  return montReduction(a * b);
}

export function montify(a: Belt): Belt {
  return montReduction(a * R2);
}

export function badd(a: Belt, b: Belt): Belt {
  const bb = u64(PRIME - b);
  let r = a - bb;
  const c = r < 0n;
  if (c) r += 1n << 64n;
  const adj = c ? (1n << 32n) - 1n : 0n;
  r = u64(r - adj);
  return r;
}

export function bneg(a: Belt): Belt {
  return a !== 0n ? u64(PRIME - a) : 0n;
}

export function bsub(a: Belt, b: Belt): Belt {
  let r = a - b;
  const c = r < 0n;
  if (c) r += 1n << 64n;
  const adj = c ? (1n << 32n) - 1n : 0n;
  return u64(r - adj);
}

export function reduce(n: bigint): Belt {
  return reduce159(u64(n), Number((n >> 64n) & 0xffffffffn), u64(n >> 96n));
}

function reduce159(low: Belt, mid: number, high: Belt): Belt {
  let low2 = low - high;
  if (low2 < 0n) low2 = u64(low2 + PRIME);

  let product = BigInt(mid) << 32n;
  product -= product >> 32n;

  let result = u64(product + low2);
  if (result < product) result = u64(result + (1n << 64n) - PRIME);
  if (result >= PRIME) result -= PRIME;
  return result;
}

export function bmul(a: Belt, b: Belt): Belt {
  return reduce(a * b);
}

function montwopow(a: Belt, b: number): Belt {
  let res = a;
  for (let i = 0; i < b; i++) {
    res = montiply(res, res);
  }
  return res;
}

export function binv(a: Belt): Belt {
  const y = montify(a);
  const y2 = montiply(y, montiply(y, y));
  const y3 = montiply(y, montiply(y2, y2));
  const y5 = montiply(y2, montwopow(y3, 2));
  const y10 = montiply(y5, montwopow(y5, 5));
  const y20 = montiply(y10, montwopow(y10, 10));
  const y30 = montiply(y10, montwopow(y20, 10));
  const y31 = montiply(y, montiply(y30, y30));
  const dup = montiply(montwopow(y31, 32), y31);
  return montReduction(montiply(y, montiply(dup, dup)));
}

export function bpow(mutA: Belt, mutB: Belt): Belt {
  let a = mutA;
  let b = mutB;
  let c = 1n;
  if (b === 0n) return c;

  while (b > 1n) {
    if ((b & 1n) === 0n) {
      a = reduce(a * a);
      b /= 2n;
    } else {
      c = reduce(c * a);
      a = reduce(a * a);
      b = (b - 1n) / 2n;
    }
  }
  return reduce(c * a);
}

export function beltsFromBytes(bytes: Uint8Array): Belt[] {
  const belts: Belt[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, i + 4);
    let val = 0n;
    for (let j = 0; j < chunk.length; j++) {
      val |= BigInt(mustAt(chunk, j)) << BigInt(j * 8);
    }
    belts.push(val);
  }
  return belts;
}