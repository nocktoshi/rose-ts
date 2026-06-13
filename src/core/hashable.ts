/**
 * Port of rose-ztd `Hashable` — tuple/Z-tree/enum-tag hashing used by nockchain locks.
 *
 * Spend conditions use a zero-terminated list hash (wasm/oracle parity), not plain Vec hash.
 */
import { mustAt } from "./must.js";
import {
  digestBeltsToBase58,
  digestFromBase58,
  digestFromBelts,
  type DigestBelts,
} from "./digest.js";
import { hashFixed, hashVarlen } from "./tip5/index.js";
import { hashZSetDigests } from "./zbase.js";
import type { Digest, Hax, Lock, LockPrimitive, LockRoot, LockTim, Nicks, Pkh } from "../types.js";

function beltsToDigest(belts: DigestBelts): Digest {
  return digestBeltsToBase58(belts) as Digest;
}

export function hashU64(v: bigint): DigestBelts {
  return digestFromBelts(hashVarlen([1n, v]));
}

export function hashPair(a: DigestBelts, b: DigestBelts): DigestBelts {
  return digestFromBelts(hashFixed([...a, ...b]));
}

export function hashBool(v: boolean): DigestBelts {
  return hashU64(v ? 0n : 1n);
}

function hashDigestIdentity(d: Digest): DigestBelts {
  return digestFromBase58(d);
}

export function hashTuple(a: DigestBelts, b: DigestBelts): DigestBelts {
  return digestFromBelts(hashFixed([...a, ...b]));
}

export function hashString(s: string): DigestBelts {
  let folded = 0n;
  for (let i = 0; i < s.length; i++) {
    folded |= BigInt(s.charCodeAt(i)) << BigInt(i * 8);
  }
  return hashU64(folded);
}

function hashOption<T>(value: T | null | undefined, hashSome: (v: T) => DigestBelts): DigestBelts {
  if (value === null || value === undefined) {
    return hashU64(0n);
  }
  return hashTuple(hashU64(0n), hashSome(value));
}

function digestListFromWire(hashes: Pkh["hashes"] | readonly Digest[]): Digest[] {
  if (Array.isArray(hashes)) {
    return hashes as Digest[];
  }
  return [];
}

export function hashPkh(pkh: Pkh | { m: number; hashes: Pkh["hashes"] | readonly Digest[] }): DigestBelts {
  const hashes = digestListFromWire(pkh.hashes);
  return hashTuple(hashU64(BigInt(pkh.m)), hashZSetDigests(hashes));
}

export function hashHax(hax: Hax | { preimages: Hax["preimages"] | readonly Digest[] }): DigestBelts {
  const preimages = digestListFromWire(hax.preimages as Pkh["hashes"] | readonly Digest[]);
  return hashZSetDigests(preimages);
}

function hashTimelockRange(range: { min: number | null; max: number | null }): DigestBelts {
  return hashTuple(
    hashOption(range.min, (v) => hashU64(BigInt(v))),
    hashOption(range.max, (v) => hashU64(BigInt(v)))
  );
}

function hashLockTim(tim: LockTim): DigestBelts {
  return hashTuple(hashTimelockRange(tim.rel), hashTimelockRange(tim.abs));
}

export function hashLockPrimitive(prim: LockPrimitive): DigestBelts {
  switch (prim.tag) {
    case "pkh":
      return hashTuple(hashString("pkh"), hashPkh(prim));
    case "tim":
      return hashTuple(hashString("tim"), hashLockTim(prim));
    case "hax":
      return hashTuple(hashString("hax"), hashHax(prim));
    case "brn":
      return hashString("brn");
  }
}

/** Zero-terminated spend-condition list hash (wasm `lockHash` / `spendConditionHash`). */
export function hashSpendCondition(sc: readonly LockPrimitive[]): DigestBelts {
  let acc = hashU64(0n);
  for (let i = sc.length - 1; i >= 0; i--) {
    acc = hashTuple(hashLockPrimitive(mustAt(sc, i)), acc);
  }
  return acc;
}

interface LockV2Wire { p: readonly LockPrimitive[]; q: readonly LockPrimitive[] }
interface LockV4Wire { p: LockV2Wire; q: LockV2Wire }
interface LockV8Wire { p: LockV4Wire; q: LockV4Wire }
interface LockV16Wire { p: LockV8Wire; q: LockV8Wire }

function hashLockV2(v: LockV2Wire): DigestBelts {
  return hashTuple(hashSpendCondition(v.p), hashSpendCondition(v.q));
}

function hashLockV4(v: LockV4Wire): DigestBelts {
  return hashTuple(hashLockV2(v.p), hashLockV2(v.q));
}

function hashLockV8(v: LockV8Wire): DigestBelts {
  return hashTuple(hashLockV4(v.p), hashLockV4(v.q));
}

function hashLockV16(v: LockV16Wire): DigestBelts {
  return hashTuple(hashLockV8(v.p), hashLockV8(v.q));
}

export function hashLock(lock: Lock): DigestBelts {
  if (Array.isArray(lock)) {
    return hashSpendCondition(lock);
  }
  switch (lock.tag) {
    case 2:
      return hashTuple(hashU64(2n), hashLockV2(lock));
    case 4:
      return hashTuple(hashU64(4n), hashLockV4(lock));
    case 8:
      return hashTuple(hashU64(8n), hashLockV8(lock));
    case 16:
      return hashTuple(hashU64(16n), hashLockV16(lock));
    default:
      throw new Error(`unsupported lock tag ${(lock as { tag: number }).tag}`);
  }
}

export function hashLockRoot(root: LockRoot): DigestBelts {
  if (typeof root === "string") {
    return hashDigestIdentity(root);
  }
  return hashLock(root);
}

export function hashNicks(nicks: Nicks): DigestBelts {
  return hashU64(BigInt(nicks));
}

export function hashToDigest(belts: DigestBelts): Digest {
  return beltsToDigest(belts);
}