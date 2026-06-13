import { badd, bmul, bneg, bsub, binv, type Belt } from "../core/belt.js";
import { mustAt } from "../core/must.js";
import { base58 } from "@scure/base";
import { digestFromBelts, digestToBase58 } from "../core/digest.js";
import { hashVarlen } from "../core/tip5/index.js";
import { G_ORDER, truncGOrder, U256 } from "../core/u256.js";
import { bpegcd } from "./bpoly.js";

export type F6lt = Belt[];

export interface CheetahPoint {
  x: F6lt;
  y: F6lt;
  inf: boolean;
}

export const F6_ZERO: F6lt = [0n, 0n, 0n, 0n, 0n, 0n];
export const F6_ONE: F6lt = [1n, 0n, 0n, 0n, 0n, 0n];

export const A_ID: CheetahPoint = { x: [...F6_ZERO], y: [...F6_ONE], inf: true };

export const A_GEN: CheetahPoint = {
  x: [
    2754611494552410273n,
    8599518745794843693n,
    10526511002404673680n,
    4830863958577994148n,
    375185138577093320n,
    12938930721685970739n,
  ],
  y: [
    15384029202802550068n,
    2774812795997841935n,
    14375303400746062753n,
    10708493419890101954n,
    13187678623570541764n,
    9990732138772505951n,
  ],
  inf: false,
};

function f6Eq(a: F6lt, b: F6lt): boolean {
  return a.every((v, i) => v === b[i]);
}

function karat3(a: Belt[], b: Belt[]): Belt[] {
  const m = [
    bmul(mustAt(a, 0), mustAt(b, 0)),
    bmul(mustAt(a, 1), mustAt(b, 1)),
    bmul(mustAt(a, 2), mustAt(b, 2)),
  ];
  return [
    mustAt(m, 0),
    bsub(
      bmul(badd(mustAt(a, 0), mustAt(a, 1)), badd(mustAt(b, 0), mustAt(b, 1))),
      badd(mustAt(m, 0), mustAt(m, 1))
    ),
    badd(
      bsub(
        bmul(badd(mustAt(a, 0), mustAt(a, 2)), badd(mustAt(b, 0), mustAt(b, 2))),
        badd(mustAt(m, 0), mustAt(m, 2))
      ),
      mustAt(m, 1)
    ),
    bsub(
      bmul(badd(mustAt(a, 1), mustAt(a, 2)), badd(mustAt(b, 1), mustAt(b, 2))),
      badd(mustAt(m, 1), mustAt(m, 2))
    ),
    mustAt(m, 2),
  ];
}

export function f6Mul(f: F6lt, g: F6lt): F6lt {
  const f0g0 = karat3(
    [mustAt(f, 0), mustAt(f, 1), mustAt(f, 2)],
    [mustAt(g, 0), mustAt(g, 1), mustAt(g, 2)]
  );
  const f1g1 = karat3(
    [mustAt(f, 3), mustAt(f, 4), mustAt(f, 5)],
    [mustAt(g, 3), mustAt(g, 4), mustAt(g, 5)]
  );
  const foil = karat3(
    [badd(mustAt(f, 0), mustAt(f, 3)), badd(mustAt(f, 1), mustAt(f, 4)), badd(mustAt(f, 2), mustAt(f, 5))],
    [badd(mustAt(g, 0), mustAt(g, 3)), badd(mustAt(g, 1), mustAt(g, 4)), badd(mustAt(g, 2), mustAt(g, 5))]
  );
  const cross = [
    bsub(mustAt(foil, 0), badd(mustAt(f0g0, 0), mustAt(f1g1, 0))),
    bsub(mustAt(foil, 1), badd(mustAt(f0g0, 1), mustAt(f1g1, 1))),
    bsub(mustAt(foil, 2), badd(mustAt(f0g0, 2), mustAt(f1g1, 2))),
    bsub(mustAt(foil, 3), badd(mustAt(f0g0, 3), mustAt(f1g1, 3))),
    bsub(mustAt(foil, 4), badd(mustAt(f0g0, 4), mustAt(f1g1, 4))),
  ];
  const seven = 7n;
  return [
    badd(mustAt(f0g0, 0), bmul(seven, badd(mustAt(cross, 3), mustAt(f1g1, 0)))),
    badd(mustAt(f0g0, 1), bmul(seven, badd(mustAt(cross, 4), mustAt(f1g1, 1)))),
    badd(mustAt(f0g0, 2), bmul(seven, mustAt(f1g1, 2))),
    badd(badd(mustAt(f0g0, 3), mustAt(cross, 0)), bmul(seven, mustAt(f1g1, 3))),
    badd(badd(mustAt(f0g0, 4), mustAt(cross, 1)), bmul(seven, mustAt(f1g1, 4))),
    mustAt(cross, 2),
  ];
}

function bpscal(scalar: Belt, b: Belt[], res: Belt[]): void {
  for (let i = 0; i < b.length; i++) res[i] = bmul(scalar, mustAt(b, i));
}

export function f6Inv(f: F6lt): F6lt | null {
  if (f6Eq(f, F6_ZERO)) return null;
  const res = new Array<Belt>(6).fill(0n);
  const d = new Array<Belt>(7).fill(0n);
  const u = new Array<Belt>(7).fill(0n);
  const v = new Array<Belt>(6).fill(0n);
  bpegcd(f, [bneg(7n), 0n, 0n, 0n, 0n, 0n, 1n], d, u, v);
  const inv = binv(mustAt(d, 0));
  bpscal(inv, u, res);
  return res;
}

function f6Div(f: F6lt, g: F6lt): F6lt | null {
  const gInv = f6Inv(g);
  if (!gInv) return null;
  return f6Mul(f, gInv);
}

function f6Add(f1: F6lt, f2: F6lt): F6lt {
  return f1.map((v, i) => badd(v, mustAt(f2, i))) as F6lt;
}

function f6Neg(f: F6lt): F6lt {
  return f.map((v) => bneg(v)) as F6lt;
}

function f6Sub(f1: F6lt, f2: F6lt): F6lt {
  return f1.map((v, i) => bsub(v, mustAt(f2, i))) as F6lt;
}

function f6Scal(s: Belt, f: F6lt): F6lt {
  return f.map((v) => bmul(s, v)) as F6lt;
}

function f6Square(f: F6lt): F6lt {
  return f6Mul(f, f);
}

function pointsEqual(a: CheetahPoint, b: CheetahPoint): boolean {
  return a.inf === b.inf && f6Eq(a.x, b.x) && f6Eq(a.y, b.y);
}

function chDoubleUnsafe(x: F6lt, y: F6lt): CheetahPoint | null {
  const slope = f6Div(f6Add(f6Scal(3n, f6Square(x)), F6_ONE), f6Scal(2n, y));
  if (!slope) return null;
  const xOut = f6Sub(f6Square(slope), f6Scal(2n, x));
  const yOut = f6Sub(f6Mul(slope, f6Sub(x, xOut)), y);
  return { x: xOut, y: yOut, inf: false };
}

function chDouble(p: CheetahPoint): CheetahPoint | null {
  if (p.inf || f6Eq(p.y, F6_ZERO)) return { ...A_ID, x: [...A_ID.x], y: [...A_ID.y] };
  return chDoubleUnsafe(p.x, p.y);
}

function chAddUnsafe(p: CheetahPoint, q: CheetahPoint): CheetahPoint | null {
  const slope = f6Div(f6Sub(p.y, q.y), f6Sub(p.x, q.x));
  if (!slope) return null;
  const xOut = f6Sub(f6Square(slope), f6Add(p.x, q.x));
  const yOut = f6Sub(f6Mul(slope, f6Sub(p.x, xOut)), p.y);
  return { x: xOut, y: yOut, inf: false };
}

export function chNeg(p: CheetahPoint): CheetahPoint {
  return { x: [...p.x], y: f6Neg(p.y), inf: p.inf };
}

export function chAdd(p: CheetahPoint, q: CheetahPoint): CheetahPoint | null {
  if (p.inf) return { ...q, x: [...q.x], y: [...q.y] };
  if (q.inf) return { ...p, x: [...p.x], y: [...p.y] };
  if (pointsEqual(p, chNeg(q))) return { ...A_ID, x: [...A_ID.x], y: [...A_ID.y] };
  if (pointsEqual(p, q)) return chDouble(p);
  return chAddUnsafe(p, q);
}

export function chScalBig(n: U256, p: CheetahPoint): CheetahPoint | null {
  if (n.eq(U256.ZERO)) return { ...A_ID, x: [...A_ID.x], y: [...A_ID.y] };
  let acc: CheetahPoint = { ...A_ID, x: [...A_ID.x], y: [...A_ID.y] };
  const pCopy: CheetahPoint = { ...p, x: [...p.x], y: [...p.y] };
  for (const byte of n.toBeBytes()) {
    for (let bit = 7; bit >= 0; bit--) {
      const doubled = chDouble(acc);
      if (!doubled) return null;
      acc = doubled;
      if ((byte >> bit) & 1) {
        const added = chAdd(acc, pCopy);
        if (!added) return null;
        acc = added;
      }
    }
  }
  return acc;
}

const CHEETAH_POINT_BYTES = 97;

export function cheetahPointToBase58(point: CheetahPoint): string {
  return base58.encode(publicKeyToBeBytes(point));
}

export function cheetahPointFromBase58(b58: string): CheetahPoint {
  const decoded = base58.decode(b58);
  const bytes = new Uint8Array(CHEETAH_POINT_BYTES);
  bytes.set(decoded, CHEETAH_POINT_BYTES - decoded.length);
  return publicKeyFromBeBytes(bytes);
}

export function publicKeyToBeBytes(point: CheetahPoint): Uint8Array {
  const out = new Uint8Array(97);
  out[0] = 0x01;
  for (let i = 0; i < 6; i++) {
    const yVal = mustAt(point.y, 5 - i);
    const xVal = mustAt(point.x, 5 - i);
    const yOff = 1 + i * 8;
    const xOff = 49 + i * 8;
    for (let j = 0; j < 8; j++) {
      out[yOff + j] = Number((yVal >> BigInt((7 - j) * 8)) & 0xffn);
      out[xOff + j] = Number((xVal >> BigInt((7 - j) * 8)) & 0xffn);
    }
  }
  return out;
}

/** SLIP-10 serialization: 96 bytes (y belts || x belts), big-endian per belt. */
export function publicKeyToSlip10Bytes(point: CheetahPoint): Uint8Array {
  const out = new Uint8Array(96);
  let offset = 0;
  for (const belt of [...point.y.slice().reverse(), ...point.x.slice().reverse()]) {
    for (let j = 0; j < 8; j++) {
      out[offset + j] = Number((belt >> BigInt((7 - j) * 8)) & 0xffn);
    }
    offset += 8;
  }
  return out;
}

export function publicKeyFromBeBytes(bytes: Uint8Array): CheetahPoint {
  const x: F6lt = [0n, 0n, 0n, 0n, 0n, 0n];
  const y: F6lt = [0n, 0n, 0n, 0n, 0n, 0n];

  for (let i = 0; i < 6; i++) {
    const offset = 1 + i * 8;
    const buf = bytes.subarray(offset, offset + 8);
    let val = 0n;
    for (const b of buf) val = (val << 8n) | BigInt(b);
    y[5 - i] = val;
  }

  for (let i = 0; i < 6; i++) {
    const offset = 49 + i * 8;
    const buf = bytes.subarray(offset, offset + 8);
    let val = 0n;
    for (const b of buf) val = (val << 8n) | BigInt(b);
    x[5 - i] = val;
  }

  return { x, y, inf: false };
}

export function cheetahPointHash(point: CheetahPoint): string {
  const dyck = [
    0n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 1n, 0n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 0n, 1n, 1n,
  ];
  const leaves: bigint[] = [...point.x, ...point.y, point.inf ? 0n : 1n];
  const hashInput = [BigInt(leaves.length), ...leaves, ...dyck];
  return digestToBase58(digestFromBelts(hashVarlen(hashInput)));
}

export function verifySignature(
  publicKeyBytes: Uint8Array,
  cHex: string,
  sHex: string,
  messageDigest: bigint[]
): boolean {
  const c = U256.fromLeHex(cHex);
  const s = U256.fromLeHex(sHex);

  if (c.eq(U256.ZERO) || !c.lt(G_ORDER) || s.eq(U256.ZERO) || !s.lt(G_ORDER)) {
    return false;
  }

  const pubkey = publicKeyFromBeBytes(publicKeyBytes);
  const sg = chScalBig(s, A_GEN);
  if (!sg) return false;
  const cPk = chScalBig(c, pubkey);
  if (!cPk) return false;
  const negCPk = chNeg(cPk);
  const scalar = chAdd(sg, negCPk);
  if (!scalar) return false;

  const transcript = [...scalar.x, ...scalar.y, ...pubkey.x, ...pubkey.y, ...messageDigest];
  const chal = truncGOrder(hashVarlen(transcript));
  return chal.eq(c);
}