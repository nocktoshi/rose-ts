import { mustAt } from "../core/must.js";
import { buildZTree, type ZNode } from "../core/zbase.js";
import { tasBelts } from "./belts.js";
import { U256 } from "../core/u256.js";
import { cheetahPointFromBase58 } from "../crypto/cheetah.js";
import {
  encodeAtomU64,
  encodeBeltSeq,
  encodeDigest,
  encodeTuple,
} from "./encode.js";
import { cons, fromWire, type NounTree } from "./types.js";
import type {
  Digest,
  Lock,
  LockMerkleProof,
  LockPrimitive,
  LockV2,
  LockV4,
  LockV8,
  LockV16,
  NoteData,
  Pkh,
  PkhSignature,
  SpendCondition,
  Signature,
  Witness,
} from "../types.js";
import type { NounWire } from "./types.js";

function encodeTas(s: string): NounTree {
  return tasBelts(s);
}

function encodeVec<T>(items: readonly T[], encodeItem: (v: T) => NounTree): NounTree {
  let acc = encodeAtomU64(0n);
  for (let i = items.length - 1; i >= 0; i--) {
    acc = cons(encodeItem(mustAt(items, i)), acc);
  }
  return acc;
}

function encodeZTree<E>(node: ZNode<E> | null, encodeEntry: (e: E) => NounTree): NounTree {
  if (!node) return encodeAtomU64(0n);
  return encodeTuple([
    encodeEntry(node.entry),
    encodeTuple([encodeZTree(node.left, encodeEntry), encodeZTree(node.right, encodeEntry)]),
  ]);
}

function encodeZSetDigests(hashes: readonly Digest[]): NounTree {
  const tree = buildZTree([...hashes], (d) => d, encodeDigest);
  return encodeZTree(tree, encodeDigest);
}

function encodeTimelockRange(range: { min: number | null; max: number | null }): NounTree {
  const encOpt = (v: number | null): NounTree =>
    v === null ? encodeAtomU64(0n) : encodeTuple([encodeAtomU64(0n), encodeAtomU64(BigInt(v))]);
  return encodeTuple([encOpt(range.min), encOpt(range.max)]);
}

export function encodePkh(pkh: Pkh): NounTree {
  const hashes = Array.isArray(pkh.hashes) ? (pkh.hashes as Digest[]) : [];
  return encodeTuple([encodeAtomU64(BigInt(pkh.m)), encodeZSetDigests(hashes)]);
}

function encodeLockPrimitive(prim: LockPrimitive): NounTree {
  switch (prim.tag) {
    case "pkh":
      return cons(encodeTas("pkh"), encodePkh(prim));
    case "tim":
      return cons(
        encodeTas("tim"),
        encodeTuple([encodeTimelockRange(prim.rel), encodeTimelockRange(prim.abs)])
      );
    case "hax": {
      const pre = Array.isArray(prim.preimages) ? (prim.preimages as Digest[]) : [];
      return cons(encodeTas("hax"), encodeZSetDigests(pre));
    }
    case "brn":
      return encodeTas("brn");
  }
}

export function encodeSpendCondition(sc: SpendCondition): NounTree {
  return encodeVec(sc, encodeLockPrimitive);
}

// Inner balanced subtrees encode without a version tag (they are struct fields,
// not `Lock` enum variants); only the top-level `Lock::Vn` adds the tag leaf.
function encodeLockV2Inner(v: LockV2): NounTree {
  return encodeTuple([encodeSpendCondition(v.p), encodeSpendCondition(v.q)]);
}
function encodeLockV4Inner(v: LockV4): NounTree {
  return encodeTuple([encodeLockV2Inner(v.p), encodeLockV2Inner(v.q)]);
}
function encodeLockV8Inner(v: LockV8): NounTree {
  return encodeTuple([encodeLockV4Inner(v.p), encodeLockV4Inner(v.q)]);
}
function encodeLockV16Inner(v: LockV16): NounTree {
  return encodeTuple([encodeLockV8Inner(v.p), encodeLockV8Inner(v.q)]);
}

export function encodeLock(lock: Lock): NounTree {
  if (Array.isArray(lock)) {
    return encodeSpendCondition(lock);
  }
  switch (lock.tag) {
    case 2:
      return cons(encodeAtomU64(2n), encodeLockV2Inner(lock));
    case 4:
      return cons(encodeAtomU64(4n), encodeLockV4Inner(lock));
    case 8:
      return cons(encodeAtomU64(8n), encodeLockV8Inner(lock));
    case 16:
      return cons(encodeAtomU64(16n), encodeLockV16Inner(lock));
  }
}

function encodeMerkleProof(proof: { root: Digest; path: Digest[] }): NounTree {
  return encodeTuple([encodeDigest(proof.root), encodeVec(proof.path, encodeDigest)]);
}

export function encodeLockMerkleProof(lmp: LockMerkleProof): NounTree {
  if ("version" in lmp && lmp.version === "full") {
    return cons(
      encodeTas("full"),
      encodeTuple([
        encodeSpendCondition(lmp.spend_condition),
        encodeAtomU64(BigInt(lmp.axis)),
        encodeMerkleProof(lmp.proof),
      ])
    );
  }
  return encodeTuple([
    encodeSpendCondition(lmp.spend_condition),
    encodeAtomU64(1n),
    encodeMerkleProof(lmp.proof),
  ]);
}

function beltsFromLe(bytes: Uint8Array): bigint[] {
  const belts: bigint[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, Math.min(i + 4, bytes.length));
    let v = 0n;
    for (let j = 0; j < chunk.length; j++) v |= BigInt(mustAt(chunk, j)) << BigInt(j * 8);
    belts.push(v);
  }
  while (belts.length < 8) belts.push(0n);
  return belts;
}

function encodePubkeyNoun(pk: string): NounTree {
  const point = cheetahPointFromBase58(pk);
  return encodeTuple([
    encodeBeltSeq(point.x),
    encodeBeltSeq(point.y),
    encodeAtomU64(point.inf ? 1n : 0n),
  ]);
}

function encodeSignatureNoun(sig: Signature): NounTree {
  const c = beltsFromLe(U256.fromLeHex(sig.c).toLeBytes());
  const s = beltsFromLe(U256.fromLeHex(sig.s).toLeBytes());
  return encodeTuple([encodeBeltSeq(c), encodeBeltSeq(s)]);
}

function encodePkhSignature(sig: PkhSignature): NounTree {
  const pairs = Array.isArray(sig) ? sig : [];
  if (pairs.length === 0) return encodeAtomU64(0n);
  const tree = buildZTree(
    pairs.map(([key, value]) => ({ key, value })),
    (e) => e.key,
    encodeDigest
  );
  return encodeZTree(tree, (e) =>
    encodeTuple([encodeDigest(e.key), encodeTuple([encodePubkeyNoun(e.value[0]), encodeSignatureNoun(e.value[1])])])
  );
}

function encodeHaxMap(map: Witness["hax_map"]): NounTree {
  const pairs = Array.isArray(map) ? map : [];
  if (pairs.length === 0) return encodeAtomU64(0n);
  const tree = buildZTree(
    pairs.map(([key, value]) => ({ key, value })),
    (e) => e.key,
    encodeDigest
  );
  return encodeZTree(tree, (e) => encodeTuple([encodeDigest(e.key), fromWire(e.value)]));
}

export function encodeWitness(w: Witness): NounTree {
  return encodeTuple([
    encodeLockMerkleProof(w.lock_merkle_proof),
    encodePkhSignature(w.pkh_signature),
    encodeHaxMap(w.hax_map),
    encodeAtomU64(0n),
  ]);
}

export function encodeNoteData(data: NoteData): NounTree {
  if (data.length === 0) return encodeAtomU64(0n);
  const tree = buildZTree(
    data.map(([key, noun]) => ({ key, noun })),
    (e) => e.key,
    encodeTas
  );
  return encodeZTree(tree, (e) => encodeTuple([encodeTas(e.key), fromWire(e.noun as NounWire)]));
}