import {digestFromBase58} from './digest.js';
import {
  hashPair,
  hashSpendCondition,
  hashToDigest,
  hashU64,
} from './hashable.js';
import type {DigestBelts} from './digest.js';
import type {Lock, MerkleProof, SpendCondition} from '../types.js';

export interface MerkleProvenAxis {
  proof: MerkleProof;
  axis: bigint;
}

const leadingZeros64 = (v: bigint): number => {
  if (v === 0n) return 64;
  let n = 0;
  let x = v;
  while ((x & (1n << 63n)) === 0n) {
    n++;
    x <<= 1n;
  }
  return n;
};

/**
 * A node in a lock's `Hashable` binary tree (rose-ztd `Hashable`).
 *
 * Mirrors the Rust encoding of `Lock`: the `V2`..`V16` variants encode as
 * `(tag, inner)` with the version tag occupying the left leaf, so the merkle
 * proof for spend-condition `index` proves DFS leaf `index + 1`.
 */
type HashTree =
  | {kind: 'leaf'; hash: DigestBelts}
  | {kind: 'pair'; left: HashTree; right: HashTree};

const leaf = (hash: DigestBelts): HashTree => ({kind: 'leaf', hash});
const pair = (left: HashTree, right: HashTree): HashTree => ({
  kind: 'pair',
  left,
  right,
});

/** Build the inner spend-condition subtree of a balanced `LockVN` node. */
const innerTree = (node: unknown, depth: number): HashTree => {
  if (depth === 0) return leaf(hashSpendCondition(node as SpendCondition));
  const n = node as {p: unknown; q: unknown};
  return pair(innerTree(n.p, depth - 1), innerTree(n.q, depth - 1));
};

/** Build the full `Hashable` tree for a lock, including the version-tag leaf. */
const lockTree = (lock: Lock): HashTree => {
  if (Array.isArray(lock)) return leaf(hashSpendCondition(lock));
  switch (lock.tag) {
    case 2:
      return pair(leaf(hashU64(2n)), innerTree(lock, 1));
    case 4:
      return pair(leaf(hashU64(4n)), innerTree(lock, 2));
    case 8:
      return pair(leaf(hashU64(8n)), innerTree(lock, 3));
    case 16:
      return pair(leaf(hashU64(16n)), innerTree(lock, 4));
    default:
      throw new Error(`unsupported lock tag ${(lock as {tag: number}).tag}`);
  }
};

const treeHash = (t: HashTree): DigestBelts => {
  if (t.kind === 'leaf') return t.hash;
  return hashPair(treeHash(t.left), treeHash(t.right));
};

const treeLeafCount = (t: HashTree): number => {
  if (t.kind === 'leaf') return 1;
  return treeLeafCount(t.left) + treeLeafCount(t.right);
};

/** Prove a 0-indexed leaf of a hashable binary tree (rose-ztd `MerkleProof::prove_hashable`). */
const proveTree = (t: HashTree, index: number): MerkleProvenAxis => {
  if (t.kind === 'leaf') {
    return {proof: {root: hashToDigest(t.hash), path: []}, axis: 1n};
  }
  const lc = treeLeafCount(t.left);
  if (index < lc) {
    const rec = proveTree(t.left, index);
    const sib = hashToDigest(treeHash(t.right));
    const root = hashToDigest(
      hashPair(digestFromBase58(rec.proof.root), digestFromBase58(sib)),
    );
    const alz = leadingZeros64(rec.axis);
    const axis = rec.axis ^ (0b11n << BigInt(63 - alz));
    return {proof: {root, path: [...rec.proof.path, sib]}, axis};
  }
  const rec = proveTree(t.right, index - lc);
  const sib = hashToDigest(treeHash(t.left));
  const root = hashToDigest(
    hashPair(digestFromBase58(sib), digestFromBase58(rec.proof.root)),
  );
  const alz = leadingZeros64(rec.axis);
  const axis = rec.axis ^ (0b10n << BigInt(63 - alz));
  return {proof: {root, path: [...rec.proof.path, sib]}, axis};
};

/** Prove a 0-indexed leaf of a lock tree (rose-ztd `MerkleProof::prove_hashable`). */
export const proveHashableLock = (
  lock: Lock,
  index: number,
): MerkleProvenAxis => proveTree(lockTree(lock), index);
