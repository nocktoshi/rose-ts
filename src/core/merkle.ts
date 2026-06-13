import { digestFromBase58 } from "./digest.js";
import { hashLock, hashPair, hashSpendCondition, hashToDigest } from "./hashable.js";
import { lockHashablePair, lockLeafCount } from "./lock.js";
import type { DigestBelts } from "./digest.js";
import type { Lock, MerkleProof } from "../types.js";

export interface MerkleProvenAxis {
  proof: MerkleProof;
  axis: bigint;
}

function leadingZeros64(v: bigint): number {
  if (v === 0n) return 64;
  let n = 0;
  let x = v;
  while ((x & (1n << 63n)) === 0n) {
    n++;
    x <<= 1n;
  }
  return n;
}

function hashLockSubtree(lock: Lock): DigestBelts {
  const pair = lockHashablePair(lock);
  if (!pair) {
    if (Array.isArray(lock)) return hashSpendCondition(lock);
    return hashLock(lock);
  }
  const [left, right] = pair;
  return hashPair(hashLockSubtree(left), hashLockSubtree(right));
}

/** Prove a 0-indexed leaf (rose-ztd `MerkleProof::prove_hashable`). */
export function proveHashableLock(lock: Lock, index: number): MerkleProvenAxis {
  const pair = lockHashablePair(lock);
  if (!pair) {
    const leaf = hashToDigest(hashLockSubtree(lock));
    return {
      proof: { root: leaf, path: [] },
      axis: 1n,
    };
  }

  const [left, right] = pair;
  const lc = lockLeafCount(left);
  if (index < lc) {
    const rec = proveHashableLock(left, index);
    const sib = hashToDigest(hashLockSubtree(right));
    const root = hashToDigest(hashPair(digestFromBase58(rec.proof.root), digestFromBase58(sib)));
    const alz = leadingZeros64(rec.axis);
    const axis = rec.axis ^ (0b11n << BigInt(63 - alz));
    return {
      proof: { root, path: [...rec.proof.path, sib] },
      axis,
    };
  }

  const rec = proveHashableLock(right, index - lc);
  const sib = hashToDigest(hashLockSubtree(left));
  const root = hashToDigest(hashPair(digestFromBase58(sib), digestFromBase58(rec.proof.root)));
  const alz = leadingZeros64(rec.axis);
  const axis = rec.axis ^ (0b10n << BigInt(63 - alz));
  return {
    proof: { root, path: [...rec.proof.path, sib] },
    axis,
  };
}