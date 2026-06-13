import { mustAt } from "../core/must.js";
import { digestFromBase58 } from "../core/digest.js";
import {
  hashBool,
  hashLockPrimitive,
  hashLockRoot,
  hashNicks,
  hashPair,
  hashString,
  hashToDigest,
  hashTuple,
  hashU64,
} from "../core/hashable.js";
import { buildZTree, hashZNode } from "../core/zbase.js";
import { encodeNoteData } from "../noun/codec.js";
import { cheetahPointFromBase58, cheetahPointHash } from "../crypto/cheetah.js";
import { U256 } from "../core/u256.js";
import {
  encodeAtomU64,
  encodeBeltSeq,
  encodeDigest,
  encodeName,
  encodeTuple,
} from "../noun/encode.js";
import { hashNounStructural, hashNounWhole } from "./structural.js";
import { fromWire } from "../noun/types.js";
import { hashNoteData as hashNoteDataEntries } from "./note.js";
import type {
  Digest,
  LockMerkleProof,
  LockPrimitive,
  MerkleProof,
  Name,
  NoteData,
  PkhSignature,
  RawTxV1,
  SeedV1,
  Signature,
  Spend1V1,
  Source,
  SpendV1,
  SpendsV1,
  Noun,
  Witness,
} from "../types.js";
import type { DigestBelts } from "../core/digest.js";

const AXIS_MOLD_HASH =
  "6mhCSwJQDvbkbiPAUNjetJtVoo1VLtEhmEYoU4hmdGd6ep1F6ayaV4A" as Digest;

function hashDigest(d: Digest): DigestBelts {
  return digestFromBase58(d);
}

function hashNested(...parts: DigestBelts[]): DigestBelts {
  if (parts.length === 0) return hashU64(0n);
  if (parts.length === 1) return mustAt(parts, 0);
  let acc = mustAt(parts, parts.length - 1);
  for (let i = parts.length - 2; i >= 0; i--) {
    acc = hashPair(mustAt(parts, i), acc);
  }
  return acc;
}

function hashVec<T>(items: readonly T[], hashItem: (v: T) => DigestBelts): DigestBelts {
  if (items.length === 0) return hashU64(0n);
  return hashPair(hashItem(mustAt(items, 0)), hashVec(items.slice(1), hashItem));
}

function beltsFromLeBytes(bytes: Uint8Array): bigint[] {
  const belts: bigint[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, Math.min(i + 4, bytes.length));
    let v = 0n;
    for (let j = 0; j < chunk.length; j++) {
      v |= BigInt(mustAt(chunk, j)) << BigInt(j * 8);
    }
    belts.push(v);
  }
  return belts;
}

function hashSignature(sig: Signature): DigestBelts {
  const c = beltsFromLeBytes(U256.fromLeHex(sig.c).toLeBytes());
  const s = beltsFromLeBytes(U256.fromLeHex(sig.s).toLeBytes());
  const noun = encodeTuple([encodeBeltSeq(c), encodeBeltSeq(s)]);
  return digestFromBase58(hashNounWhole(noun));
}

function hashPublicKeyDigest(pk: string): DigestBelts {
  return digestFromBase58(cheetahPointHash(cheetahPointFromBase58(pk)));
}

export function hashNameBelts(name: Name): DigestBelts {
  return hashNested(
    hashDigest(name.first),
    hashDigest(name.last),
    hashU64(BigInt(name._sig ?? 0))
  );
}

export function hashName(name: Name): Digest {
  return hashToDigest(hashNameBelts(name));
}

function hashSpendConditionVec(sc: readonly LockPrimitive[]): DigestBelts {
  return hashVec(sc, hashLockPrimitive);
}

function hashMerkleProof(proof: MerkleProof): DigestBelts {
  return hashNested(hashDigest(proof.root), hashVec(proof.path, hashDigest));
}

export function hashLockMerkleProofDigest(lmp: LockMerkleProof): Digest {
  return hashToDigest(hashLockMerkleProof(lmp));
}

function hashLockMerkleProof(lmp: LockMerkleProof): DigestBelts {
  if ("version" in lmp && lmp.version === "full") {
    return hashNested(
      hashString("full"),
      hashSpendConditionVec(lmp.spend_condition),
      hashU64(BigInt(lmp.axis)),
      hashMerkleProof(lmp.proof)
    );
  }
  return hashNested(
    hashSpendConditionVec(lmp.spend_condition),
    hashDigest(AXIS_MOLD_HASH),
    hashMerkleProof(lmp.proof)
  );
}

function hashNoteData(data: NoteData): DigestBelts {
  return hashNoteDataEntries(data);
}

/** Noun used for ZSet ordering — must equal Rust `SeedV1::to_noun()`. */
function encodeSeedNoun(seed: SeedV1) {
  // LockRoot::Lock encodes as `lock.hash().to_noun()`, i.e. the lock-root hash
  // digest, not the lock structure; LockRoot::Hash encodes the digest directly.
  const lockRoot = encodeDigest(hashToDigest(hashLockRoot(seed.lock_root)));
  // output_source may be null OR absent on manually-constructed seeds (callers
  // routinely omit it); both mean `None`.
  const src = seed.output_source;
  let outputSource = encodeAtomU64(0n);
  if (src != null && typeof src === "object" && "hash" in src) {
    outputSource = encodeTuple([
      encodeAtomU64(0n),
      encodeTuple([encodeDigest(src.hash), encodeAtomU64(src.is_coinbase ? 0n : 1n)]),
    ]);
  }
  return encodeTuple([
    outputSource,
    lockRoot,
    encodeNoteData(seed.note_data ?? []),
    encodeAtomU64(BigInt(seed.gift)),
    encodeDigest(seed.parent_hash),
  ]);
}

export function hashSeedV1Digest(seed: SeedV1): Digest {
  return hashToDigest(hashSeedV1(seed));
}

export function hashSeedV1(seed: SeedV1): DigestBelts {
  return hashNested(
    hashLockRoot(seed.lock_root),
    hashNoteData(seed.note_data ?? []),
    hashNicks(seed.gift),
    hashDigest(seed.parent_hash)
  );
}

function hashSeedsV1(seeds: SeedV1[]): DigestBelts {
  const tree = buildZTree(seeds, (s) => s, encodeSeedNoun);
  return hashZNode(tree, hashSeedV1);
}

function hashOutputSource(source: Source | null | undefined): DigestBelts {
  if (source == null) return hashU64(0n);
  if (!("hash" in source)) {
    throw new Error("Parent source variant is not hashable as legacy Source");
  }
  return hashTuple(hashU64(0n), hashTuple(hashDigest(source.hash), hashBool(source.is_coinbase)));
}

/** Sig-hash seed encoding includes `output_source` (rose-nockchain-types `SigHashSeedV1`). */
function hashSigHashSeedV1(seed: SeedV1): DigestBelts {
  return hashNested(
    hashOutputSource(seed.output_source),
    hashLockRoot(seed.lock_root),
    hashNoteData(seed.note_data ?? []),
    hashNicks(seed.gift),
    hashDigest(seed.parent_hash)
  );
}

function hashSeedsV1Sig(seeds: SeedV1[]): DigestBelts {
  const tree = buildZTree(seeds, (s) => s, encodeSeedNoun);
  return hashZNode(tree, hashSigHashSeedV1);
}

export function seedsV1SigHash(seeds: SeedV1[]): Digest {
  return hashToDigest(hashSeedsV1Sig(seeds));
}

export function hashSeedsV1Digest(seeds: SeedV1[]): Digest {
  return hashToDigest(hashSeedsV1(seeds));
}

function hashPkhSignature(
  sig: [Digest, [string, Signature]][] | unknown
): DigestBelts {
  const pairs = Array.isArray(sig) ? (sig as [Digest, [string, Signature]][]) : [];
  const tree = buildZTree(
    pairs.map(([key, value]) => ({ key, value })),
    (e) => e.key,
    encodeDigest
  );
  return hashZNode(tree, (e) =>
    hashNested(hashDigest(e.key), hashPublicKeyDigest(e.value[0]), hashSignature(e.value[1]))
  );
}

// Witness hax_map values use structural hash-noun (node hashable-noun), not whole-noun varlen.
function hashNounValue(noun: Noun): DigestBelts {
  return digestFromBase58(hashNounStructural(fromWire(noun)));
}

function hashHaxMap(map: Witness["hax_map"]): DigestBelts {
  const pairs = Array.isArray(map) ? map : [];
  if (pairs.length === 0) return hashU64(0n);
  const tree = buildZTree(
    pairs.map(([key, value]) => ({ key, value })),
    (e) => e.key,
    encodeDigest
  );
  return hashZNode(tree, (e) => hashNested(hashDigest(e.key), hashNounValue(e.value)));
}

function hashWitnessBelts(w: Witness): DigestBelts {
  return hashNested(
    hashLockMerkleProof(w.lock_merkle_proof),
    hashPkhSignature(w.pkh_signature),
    hashHaxMap(w.hax_map),
    hashU64(0n)
  );
}

export function hashWitnessDigest(w: Witness): Digest {
  return hashToDigest(hashWitnessBelts(w));
}

export function hashPkhSignatureDigest(sig: PkhSignature): Digest {
  return hashToDigest(hashPkhSignature(sig));
}

function hashSpend1(spend: Spend1V1): DigestBelts {
  const seeds = Array.isArray(spend.seeds) ? spend.seeds : [];
  return hashNested(hashU64(1n), hashWitnessBelts(spend.witness), hashSeedsV1(seeds), hashNicks(spend.fee));
}

export function hashSpendV1SigHash(spend: Spend1V1): Digest {
  const seeds = Array.isArray(spend.seeds) ? spend.seeds : [];
  return hashToDigest(hashTuple(hashSeedsV1Sig(seeds), hashNicks(spend.fee)));
}

export function hashSpendsV1(spends: SpendsV1): Digest {
  const pairs = spends as [Name, SpendV1][];
  const tree = buildZTree(
    pairs.map(([name, spend]) => ({ name, spend })),
    (e) => e.name,
    encodeName
  );
  return hashToDigest(
    hashZNode(tree, (e) => hashNested(hashNameBelts(e.name), hashSpend1(e.spend as Spend1V1)))
  );
}

export function rawTxV1CalcId(tx: RawTxV1): Digest {
  return hashToDigest(hashPair(hashU64(1n), digestFromBase58(hashSpendsV1(tx.spends))));
}