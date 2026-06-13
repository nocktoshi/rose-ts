import { buildZTree, hashZNode } from "../core/zbase.js";
import {
  hashBool,
  hashNicks,
  hashPair,
  hashString,
  hashToDigest,
  hashTuple,
  hashU64,
} from "../core/hashable.js";
import { hashNameBelts } from "./tx.js";
import { digestFromBase58 } from "../core/digest.js";
import { hashNounStructural } from "./structural.js";
import { encodePkh } from "../noun/codec.js";
import { encodeAtomU64, encodeTuple } from "../noun/encode.js";
import { cons, fromWire, toWire } from "../noun/types.js";
import { tasBelts } from "../noun/belts.js";
import { nounWords } from "../noun/words.js";
import type {
  Digest,
  Name,
  Note,
  NoteData,
  NoteV0,
  NoteV1,
  Pkh,
  Source,
} from "../types.js";
import type { DigestBelts } from "../core/digest.js";
import type { NounWire } from "../noun/types.js";

function hashNounWire(noun: NounWire): DigestBelts {
  return digestFromBase58(hashNounStructural(fromWire(noun)));
}

export function hashNoteData(data: NoteData): DigestBelts {
  if (data.length === 0) return hashU64(0n);
  const tree = buildZTree(
    data.map(([key, noun]) => ({ key, noun })),
    (e) => e.key,
    (k) => tasBelts(k)
  );
  return hashZNode(tree, (e) =>
    hashPair(hashString(e.key), hashNounWire(e.noun as NounWire))
  );
}

export function noteDataFeeWords(data: NoteData): bigint {
  let w = 1n;
  for (const [, noun] of data) {
    w += 1n + nounWords(fromWire(noun as NounWire));
  }
  return w;
}

export function noteDataPushPkh(data: NoteData, pkh: Pkh): NoteData {
  const filtered = data.filter(([k]) => k !== "lock");
  const noun = toWire(
    encodeTuple([encodeAtomU64(0n), cons(tasBelts("pkh"), encodePkh(pkh)), encodeAtomU64(0n)])
  );
  return [...filtered, ["lock", noun]];
}

export function noteDataPushLock(data: NoteData, lockNoun: NounWire): NoteData {
  const filtered = data.filter(([k]) => k !== "lock");
  return [...filtered, ["lock", toWire(encodeTuple([encodeAtomU64(0n), fromWire(lockNoun)]))]];
}

export {
  noteDataPushMemo,
  noteDataPushBlob,
  decodeNoteDataPackedUtf8,
  decodePackedBlobUtf8,
  encodeBlobBelts,
  MAX_MEMO_UTF8_BYTES,
  MAX_BLOB_UTF8_BYTES,
  NOTE_DATA_KEY_MEMO,
  NOTE_DATA_KEY_BLOB,
} from "./noteData.js";

function hashDigestField(d: Digest): DigestBelts {
  return digestFromBase58(d);
}

function isHashSource(source: Source): source is { hash: Digest; is_coinbase: boolean } {
  return "hash" in source;
}

export function hashSourceFields(source: Source): Digest {
  if (!isHashSource(source)) {
    throw new Error("Parent source variant is not hashable as legacy Source");
  }
  return hashToDigest(hashTuple(hashDigestField(source.hash), hashBool(source.is_coinbase)));
}

export function nameHash(name: Name): Digest {
  return hashToDigest(hashNameBelts(name));
}

export function nameV1(lock: Digest, source: Source): Name {
  const first = hashToDigest(hashTuple(hashBool(true), hashDigestField(lock)));
  // Rust `source.hash()` is `Hashable::hash(&source)`, not the `hash` field.
  const sourceHashed = hashSourceFields(source);
  const last = hashToDigest(
    hashTuple(hashBool(true), hashTuple(hashDigestField(sourceHashed), hashU64(0n)))
  );
  return { first, last, _sig: 0 };
}

function hashNoteV1(note: NoteV1): Digest {
  return hashToDigest(
    hashTuple(
      hashU64(BigInt(note.version)),
      hashTuple(
        hashU64(BigInt(note.origin_page)),
        hashTuple(
          hashNameBelts(note.name),
          hashTuple(hashNoteData(note.note_data), hashNicks(note.assets))
        )
      )
    )
  );
}

function hashNoteV0(note: NoteV0): Digest {
  const inner = note.inner;
  const tim = inner.timelock?.tim ?? null;
  const timHash = tim === null ? hashU64(0n) : hashU64(1n);
  const innerHash = hashTuple(
    hashU64(BigInt(inner.version)),
    hashTuple(hashU64(BigInt(inner.origin_page)), timHash)
  );
  const sig = note.sig as { m: number; pubkeys: unknown };
  const sigHash = hashU64(0n);
  void sig;
  const sourceHash = hashTuple(hashDigestField(note.source.hash), hashBool(note.source.is_coinbase));
  return hashToDigest(
    hashTuple(
      innerHash,
      hashTuple(
        hashNameBelts(note.name),
        hashTuple(sigHash, hashTuple(sourceHash, hashNicks(note.assets)))
      )
    )
  );
}

export function noteHash(note: Note): Digest {
  if ("version" in note && "note_data" in note) {
    return hashNoteV1(note);
  }
  return hashNoteV0(note as NoteV0);
}