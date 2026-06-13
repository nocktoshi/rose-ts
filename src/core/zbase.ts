import {
  digestBeltsToBase58,
  digestBytesFromBase58,
  digestFromBase58,
  type DigestBelts,
} from "./digest.js";
import { hashPair, hashU64 } from "./hashable.js";
import { encodeDigest, nounOrderDigest } from "../noun/encode.js";
import type { NounTree } from "../noun/types.js";

export interface ZNode<E> {
  entry: E;
  left: ZNode<E> | null;
  right: ZNode<E> | null;
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av !== bv) return av < bv ? -1 : 1;
  }
  return 0;
}

function tipEq<K>(a: K, b: K, keyNoun: (k: K) => NounTree): boolean {
  return nounOrderDigest(keyNoun(a)) === nounOrderDigest(keyNoun(b));
}

function gorTip<K>(a: K, b: K, keyNoun: (k: K) => NounTree): boolean {
  const aBytes = digestBytesFromBase58(nounOrderDigest(keyNoun(a)));
  const bBytes = digestBytesFromBase58(nounOrderDigest(keyNoun(b)));
  return compareBytes(aBytes, bBytes) < 0;
}

function doubleTip<K>(key: K, keyNoun: (k: K) => NounTree): Uint8Array {
  const h = digestFromBase58(nounOrderDigest(keyNoun(key)));
  const d = hashPair(h, h);
  return digestBytesFromBase58(digestBeltsToBase58(d));
}

function morTip<K>(a: K, b: K, keyNoun: (k: K) => NounTree): boolean {
  return compareBytes(doubleTip(a, keyNoun), doubleTip(b, keyNoun)) < 0;
}

function put<K, E>(
  node: ZNode<E> | null,
  entry: E,
  getKey: (e: E) => K,
  keyNoun: (k: K) => NounTree
): [ZNode<E>, boolean] {
  if (!node) {
    return [{ entry, left: null, right: null }, true];
  }
  const key = getKey(entry);
  const nodeKey = getKey(node.entry);
  if (tipEq(key, nodeKey, keyNoun)) {
    return [node, false];
  }
  if (gorTip(key, nodeKey, keyNoun)) {
    const [newLeft, inserted] = put(node.left, entry, getKey, keyNoun);
    let n: ZNode<E> = { ...node, left: newLeft };
    if (n.left && !morTip(nodeKey, getKey(n.left.entry), keyNoun)) {
      const pivot = n.left;
      n = {
        entry: pivot.entry,
        left: pivot.left,
        right: { ...n, left: pivot.right },
      };
    }
    return [n, inserted];
  }
  const [newRight, inserted] = put(node.right, entry, getKey, keyNoun);
  let n: ZNode<E> = { ...node, right: newRight };
  if (n.right && !morTip(nodeKey, getKey(n.right.entry), keyNoun)) {
    const pivot = n.right;
    n = {
      entry: pivot.entry,
      left: { ...n, right: pivot.left },
      right: pivot.right,
    };
  }
  return [n, inserted];
}

export function buildZTree<K, E>(
  entries: E[],
  getKey: (e: E) => K,
  keyNoun: (k: K) => NounTree
): ZNode<E> | null {
  let root: ZNode<E> | null = null;
  for (const entry of entries) {
    [root] = put(root, entry, getKey, keyNoun);
  }
  return root;
}

/** ZSet / ZMap empty-tree hash for a single entry (no left/right children). */
export function hashZSetSingleton<E>(entry: E, entryHash: (e: E) => DigestBelts): DigestBelts {
  const empty = hashU64(0n);
  return hashPair(entryHash(entry), hashPair(empty, empty));
}

export function hashZNode<E>(
  node: ZNode<E> | null,
  entryHash: (e: E) => DigestBelts
): DigestBelts {
  if (!node) return hashU64(0n);
  const left = hashZNode(node.left, entryHash);
  const right = hashZNode(node.right, entryHash);
  const entry = entryHash(node.entry);
  return hashPair(entry, hashPair(left, right));
}

/**
 * Hash a `ZSet<Digest>` (e.g. pkh `hashes`, hax `preimages`) as a treap.
 *
 * The set is built deterministically from the digest keys (treap ordering by
 * `key.to_noun().hash()`), so insertion order is irrelevant. The entry hash is
 * the digest identity, matching `ZSetEntry::hashable_pair == &key`.
 */
export function hashZSetDigests(digests: readonly string[]): DigestBelts {
  const tree = buildZTree(
    digests.map((key) => ({ key })),
    (e) => e.key,
    encodeDigest
  );
  return hashZNode(tree, (e) => digestFromBase58(e.key));
}