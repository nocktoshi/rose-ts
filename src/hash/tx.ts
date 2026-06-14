import {mustAt} from '../core/must.js';
import {digestFromBase58} from '../core/digest.js';
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
} from '../core/hashable.js';
import {buildZTree, hashZNode, type ZNode} from '../core/zbase.js';
import {encodeNoteData} from '../noun/codec.js';
import {cheetahPointFromBase58, cheetahPointHash} from '../crypto/cheetah.js';
import {U256} from '../core/u256.js';
import {
  encodeAtomU64,
  encodeBeltSeq,
  encodeDigest,
  encodeName,
  encodeTuple,
} from '../noun/encode.js';
import {hashNounStructural, hashNounWhole} from './structural.js';
import {fromWire} from '../noun/types.js';
import {hashNoteData as hashNoteDataEntries} from './note.js';
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
} from '../types.js';
import type {DigestBelts} from '../core/digest.js';

const AXIS_MOLD_HASH =
  '6mhCSwJQDvbkbiPAUNjetJtVoo1VLtEhmEYoU4hmdGd6ep1F6ayaV4A' as Digest;

const hashDigest = (d: Digest): DigestBelts => digestFromBase58(d);

const hashNested = (...parts: DigestBelts[]): DigestBelts => {
  if (parts.length === 0) return hashU64(0n);
  if (parts.length === 1) return mustAt(parts, 0);
  let acc = mustAt(parts, parts.length - 1);
  for (let i = parts.length - 2; i >= 0; i--) {
    acc = hashPair(mustAt(parts, i), acc);
  }
  return acc;
};

const hashVec = <T>(
  items: readonly T[],
  hashItem: (v: T) => DigestBelts,
): DigestBelts => {
  if (items.length === 0) return hashU64(0n);
  return hashPair(
    hashItem(mustAt(items, 0)),
    hashVec(items.slice(1), hashItem),
  );
};

const beltsFromLeBytes = (bytes: Uint8Array): bigint[] => {
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
};

const hashSignature = (sig: Signature): DigestBelts => {
  const c = beltsFromLeBytes(U256.fromLeHex(sig.c).toLeBytes());
  const s = beltsFromLeBytes(U256.fromLeHex(sig.s).toLeBytes());
  const noun = encodeTuple([encodeBeltSeq(c), encodeBeltSeq(s)]);
  return digestFromBase58(hashNounWhole(noun));
};

const hashPublicKeyDigest = (pk: string): DigestBelts =>
  digestFromBase58(cheetahPointHash(cheetahPointFromBase58(pk)));

export const hashNameBelts = (name: Name): DigestBelts =>
  hashNested(
    hashDigest(name.first),
    hashDigest(name.last),
    hashU64(BigInt(name._sig ?? 0)),
  );

export const hashName = (name: Name): Digest =>
  hashToDigest(hashNameBelts(name));

const hashSpendConditionVec = (sc: readonly LockPrimitive[]): DigestBelts =>
  hashVec(sc, hashLockPrimitive);

const hashMerkleProof = (proof: MerkleProof): DigestBelts =>
  hashNested(hashDigest(proof.root), hashVec(proof.path, hashDigest));

export const hashLockMerkleProofDigest = (lmp: LockMerkleProof): Digest =>
  hashToDigest(hashLockMerkleProof(lmp));

const hashLockMerkleProof = (lmp: LockMerkleProof): DigestBelts => {
  if ('version' in lmp && lmp.version === 'full') {
    return hashNested(
      hashString('full'),
      hashSpendConditionVec(lmp.spend_condition),
      hashU64(BigInt(lmp.axis)),
      hashMerkleProof(lmp.proof),
    );
  }
  return hashNested(
    hashSpendConditionVec(lmp.spend_condition),
    hashDigest(AXIS_MOLD_HASH),
    hashMerkleProof(lmp.proof),
  );
};

const hashNoteData = (data: NoteData): DigestBelts => hashNoteDataEntries(data);

/** Noun used for ZSet ordering — must equal Rust `SeedV1::to_noun()`. */
const encodeSeedNoun = (seed: SeedV1) => {
  // LockRoot::Lock encodes as `lock.hash().to_noun()`, i.e. the lock-root hash
  // digest, not the lock structure; LockRoot::Hash encodes the digest directly.
  const lockRoot = encodeDigest(hashToDigest(hashLockRoot(seed.lock_root)));
  // output_source may be null OR absent on manually-constructed seeds (callers
  // routinely omit it); both mean `None`.
  const src = seed.output_source;
  let outputSource = encodeAtomU64(0n);
  if (src != null && typeof src === 'object' && 'hash' in src) {
    outputSource = encodeTuple([
      encodeAtomU64(0n),
      encodeTuple([
        encodeDigest(src.hash),
        encodeAtomU64(src.is_coinbase ? 0n : 1n),
      ]),
    ]);
  }
  return encodeTuple([
    outputSource,
    lockRoot,
    encodeNoteData(seed.note_data ?? []),
    encodeAtomU64(BigInt(seed.gift)),
    encodeDigest(seed.parent_hash),
  ]);
};

export const hashSeedV1Digest = (seed: SeedV1): Digest =>
  hashToDigest(hashSeedV1(seed));

export const hashSeedV1 = (seed: SeedV1): DigestBelts =>
  hashNested(
    hashLockRoot(seed.lock_root),
    hashNoteData(seed.note_data ?? []),
    hashNicks(seed.gift),
    hashDigest(seed.parent_hash),
  );

const hashSeedsV1 = (seeds: SeedV1[]): DigestBelts => {
  const tree = buildZTree(seeds, s => s, encodeSeedNoun);
  return hashZNode(tree, hashSeedV1);
};

/** Canonical wire shape for a seed — Rust `SeedV1` always carries every field,
 *  so externally-built seeds (which may omit `output_source`/`note_data`) must be
 *  filled in or the wasm/node serde rejects the tx. */
const normalizeSeedV1 = (seed: SeedV1): SeedV1 => ({
  output_source: seed.output_source ?? null,
  lock_root: seed.lock_root,
  note_data: seed.note_data ?? [],
  gift: seed.gift,
  parent_hash: seed.parent_hash,
});

/** ZBase iterates reverse-in-order (descending BST key), so the on-the-wire
 *  seed array is right→node→left of the treap. */
const reverseInOrderSeeds = (
  node: ZNode<SeedV1> | null,
  out: SeedV1[],
): void => {
  if (!node) return;
  reverseInOrderSeeds(node.right, out);
  out.push(node.entry);
  reverseInOrderSeeds(node.left, out);
};

/**
 * Seeds in canonical `SeedsV1` (ZSet) form for the wire: every field present
 * (output_source/note_data defaulted) and ordered exactly as Rust's ZSet
 * iterates — so a NockchainTx built here deserializes in wasm / the wallet / the
 * node identically. `SpendBuilder.seed()` accepts loose `{lock_root, gift, …}`
 * objects, so without this the built tx can omit `output_source` and be rejected.
 */
export const canonicalSeedsV1 = (seeds: SeedV1[]): SeedV1[] => {
  const tree = buildZTree(seeds.map(normalizeSeedV1), s => s, encodeSeedNoun);
  const out: SeedV1[] = [];
  reverseInOrderSeeds(tree, out);
  return out;
};

const hashOutputSource = (source: Source | null | undefined): DigestBelts => {
  if (source == null) return hashU64(0n);
  if (!('hash' in source)) {
    throw new Error('Parent source variant is not hashable as legacy Source');
  }
  return hashTuple(
    hashU64(0n),
    hashTuple(hashDigest(source.hash), hashBool(source.is_coinbase)),
  );
};

/** Sig-hash seed encoding includes `output_source` (rose-nockchain-types `SigHashSeedV1`). */
const hashSigHashSeedV1 = (seed: SeedV1): DigestBelts =>
  hashNested(
    hashOutputSource(seed.output_source),
    hashLockRoot(seed.lock_root),
    hashNoteData(seed.note_data ?? []),
    hashNicks(seed.gift),
    hashDigest(seed.parent_hash),
  );

const hashSeedsV1Sig = (seeds: SeedV1[]): DigestBelts => {
  const tree = buildZTree(seeds, s => s, encodeSeedNoun);
  return hashZNode(tree, hashSigHashSeedV1);
};

export const seedsV1SigHash = (seeds: SeedV1[]): Digest =>
  hashToDigest(hashSeedsV1Sig(seeds));

export const hashSeedsV1Digest = (seeds: SeedV1[]): Digest =>
  hashToDigest(hashSeedsV1(seeds));

const hashPkhSignature = (
  sig: [Digest, [string, Signature]][] | unknown,
): DigestBelts => {
  const pairs = Array.isArray(sig)
    ? (sig as [Digest, [string, Signature]][])
    : [];
  const tree = buildZTree(
    pairs.map(([key, value]) => ({key, value})),
    e => e.key,
    encodeDigest,
  );
  return hashZNode(tree, e =>
    hashNested(
      hashDigest(e.key),
      hashPublicKeyDigest(e.value[0]),
      hashSignature(e.value[1]),
    ),
  );
};

// Witness hax_map values use structural hash-noun (node hashable-noun), not whole-noun varlen.
const hashNounValue = (noun: Noun): DigestBelts =>
  digestFromBase58(hashNounStructural(fromWire(noun)));

const hashHaxMap = (map: Witness['hax_map']): DigestBelts => {
  const pairs = Array.isArray(map) ? map : [];
  if (pairs.length === 0) return hashU64(0n);
  const tree = buildZTree(
    pairs.map(([key, value]) => ({key, value})),
    e => e.key,
    encodeDigest,
  );
  return hashZNode(tree, e =>
    hashNested(hashDigest(e.key), hashNounValue(e.value)),
  );
};

const hashWitnessBelts = (w: Witness): DigestBelts =>
  hashNested(
    hashLockMerkleProof(w.lock_merkle_proof),
    hashPkhSignature(w.pkh_signature),
    hashHaxMap(w.hax_map),
    hashU64(0n),
  );

export const hashWitnessDigest = (w: Witness): Digest =>
  hashToDigest(hashWitnessBelts(w));

export const hashPkhSignatureDigest = (sig: PkhSignature): Digest =>
  hashToDigest(hashPkhSignature(sig));

const hashSpend1 = (spend: Spend1V1): DigestBelts => {
  const seeds = Array.isArray(spend.seeds) ? spend.seeds : [];
  return hashNested(
    hashU64(1n),
    hashWitnessBelts(spend.witness),
    hashSeedsV1(seeds),
    hashNicks(spend.fee),
  );
};

export const hashSpendV1SigHash = (spend: Spend1V1): Digest => {
  const seeds = Array.isArray(spend.seeds) ? spend.seeds : [];
  return hashToDigest(hashTuple(hashSeedsV1Sig(seeds), hashNicks(spend.fee)));
};

export const hashSpendsV1 = (spends: SpendsV1): Digest => {
  const pairs = spends as [Name, SpendV1][];
  const tree = buildZTree(
    pairs.map(([name, spend]) => ({name, spend})),
    e => e.name,
    encodeName,
  );
  return hashToDigest(
    hashZNode(tree, e =>
      hashNested(hashNameBelts(e.name), hashSpend1(e.spend as Spend1V1)),
    ),
  );
};

export const rawTxV1CalcId = (tx: RawTxV1): Digest =>
  hashToDigest(
    hashPair(hashU64(1n), digestFromBase58(hashSpendsV1(tx.spends))),
  );
