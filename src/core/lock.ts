import type { Lock, SpendCondition } from "../types.js";
import { hashLock, hashSpendCondition, hashToDigest } from "./hashable.js";
import type { Digest } from "../types.js";

export function lockHeight(lock: Lock): number {
  if (Array.isArray(lock)) return 1;
  switch (lock.tag) {
    case 2:
      return 2;
    case 4:
      return 3;
    case 8:
      return 4;
    case 16:
      return 5;
    default:
      throw new Error(`unsupported lock tag ${(lock as { tag: number }).tag}`);
  }
}

function lockV2Index(v: { p: SpendCondition; q: SpendCondition }, idx: number): SpendCondition {
  return idx < 1 ? v.p : v.q;
}

function lockV4Index(v: { p: { p: SpendCondition; q: SpendCondition }; q: { p: SpendCondition; q: SpendCondition } }, idx: number): SpendCondition {
  return idx < 2 ? lockV2Index(v.p, idx % 2) : lockV2Index(v.q, idx % 2);
}

function lockV8Index(
  v: {
    p: { p: { p: SpendCondition; q: SpendCondition }; q: { p: SpendCondition; q: SpendCondition } };
    q: { p: { p: SpendCondition; q: SpendCondition }; q: { p: SpendCondition; q: SpendCondition } };
  },
  idx: number
): SpendCondition {
  return idx < 4 ? lockV4Index(v.p, idx % 4) : lockV4Index(v.q, idx % 4);
}

function lockV16Index(
  v: {
    p: {
      p: {
        p: { p: SpendCondition; q: SpendCondition };
        q: { p: SpendCondition; q: SpendCondition };
      };
      q: {
        p: { p: SpendCondition; q: SpendCondition };
        q: { p: SpendCondition; q: SpendCondition };
      };
    };
    q: {
      p: {
        p: { p: SpendCondition; q: SpendCondition };
        q: { p: SpendCondition; q: SpendCondition };
      };
      q: {
        p: { p: SpendCondition; q: SpendCondition };
        q: { p: SpendCondition; q: SpendCondition };
      };
    };
  },
  idx: number
): SpendCondition {
  return idx < 8 ? lockV8Index(v.p, idx % 8) : lockV8Index(v.q, idx % 8);
}

export function lockSpendCondition(lock: Lock, index: number): SpendCondition {
  if (Array.isArray(lock)) {
    if (index >= 1) throw new Error(`Index ${index} out of range for lock of height 1`);
    return lock;
  }
  switch (lock.tag) {
    case 2:
      if (index >= 2) throw new Error(`Index ${index} out of range for lock of height 2`);
      return lockV2Index(lock, index);
    case 4:
      if (index >= 4) throw new Error(`Index ${index} out of range for lock of height 4`);
      return lockV4Index(lock, index);
    case 8:
      if (index >= 8) throw new Error(`Index ${index} out of range for lock of height 8`);
      return lockV8Index(lock, index);
    case 16:
      if (index >= 16) throw new Error(`Index ${index} out of range for lock of height 16`);
      return lockV16Index(lock, index);
    default:
      throw new Error(`unsupported lock tag ${(lock as { tag: number }).tag}`);
  }
}

export function lockLeafCount(lock: Lock): number {
  if (Array.isArray(lock)) return 1;
  switch (lock.tag) {
    case 2:
      return 1;
    case 4:
      return 2;
    case 8:
      return 4;
    case 16:
      return 8;
    default:
      throw new Error(`unsupported lock tag ${(lock as { tag: number }).tag}`);
  }
}

export function lockHashablePair(lock: Lock): [Lock, Lock] | null {
  if (Array.isArray(lock)) return null;
  switch (lock.tag) {
    case 2:
      return [lock.p as Lock, lock.q as Lock];
    case 4:
      return [lock.p as Lock, lock.q as Lock];
    case 8:
      return [lock.p as Lock, lock.q as Lock];
    case 16:
      return [lock.p as Lock, lock.q as Lock];
    default:
      throw new Error(`unsupported lock tag ${(lock as { tag: number }).tag}`);
  }
}

export function lockRootDigest(lock: Lock): Digest {
  if (Array.isArray(lock)) {
    return hashToDigest(hashSpendCondition(lock));
  }
  return hashToDigest(hashLock(lock));
}