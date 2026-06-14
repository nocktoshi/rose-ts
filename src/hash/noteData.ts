import {mustAt} from '../core/must.js';
import {vecToNoun} from '../noun/belts.js';
import {cue} from '../noun/cue.js';
import {jam} from '../noun/jam.js';
import {fromWire, toWire, type NounTree} from '../noun/types.js';
import type {NoteData, Noun} from '../types.js';

export const MAX_MEMO_UTF8_BYTES = 2048;
export const MAX_BLOB_UTF8_BYTES = 256 * 1024;
export const NOTE_DATA_KEY_MEMO = 'memo';
export const NOTE_DATA_KEY_BLOB = 'blob';

/** Length-prefixed little-endian u32 belt packing (wallet-tx-builder / PR #116). */
export const encodeBlobBelts = (bytes: Uint8Array): bigint[] => {
  const belts: bigint[] = [BigInt(bytes.length)];
  for (let i = 0; i < bytes.length; i += 4) {
    let v = 0n;
    const end = Math.min(i + 4, bytes.length);
    for (let j = i; j < end; j++) {
      v |= BigInt(mustAt(bytes, j)) << BigInt((j - i) * 8);
    }
    belts.push(v);
  }
  return belts;
};

const beltSeqFromPackedNoun = (noun: NounTree): bigint[] => {
  const belts: bigint[] = [];
  let current: NounTree = noun;
  while (current.tag === 'cell') {
    const head = current.head;
    if (head.tag !== 'atom') throw new Error('expected atom belt');
    const v = head.value.tryIntoU64();
    if (v === null) throw new Error('belt atom too large');
    belts.push(v);
    current = current.tail;
  }
  if (current.tag !== 'atom') throw new Error('expected atom terminator');
  const last = current.value.tryIntoU64();
  if (last === null) throw new Error('belt atom too large');
  belts.push(last);
  return belts;
};

const normalizePackedBlobBelts = (
  belts: readonly bigint[],
): bigint[] | null => {
  if (belts.length === 0) return null;
  const byteLen = Number(belts[0]);
  if (!Number.isFinite(byteLen) || byteLen < 0 || byteLen > MAX_BLOB_UTF8_BYTES)
    return null;
  const expectedBelts = 1 + Math.ceil(byteLen / 4);
  if (belts.length === expectedBelts) return [...belts];
  // Wallet / explorer encodes packed blobs as a proper list with trailing 0.
  if (belts.length === expectedBelts + 1 && belts[belts.length - 1] === 0n) {
    return belts.slice(0, -1);
  }
  return null;
};

/** Decode `[byte-len=@ …u32-le limbs…]` packed blob belts. */
export const decodeLenPrefixedBlob = (
  belts: readonly bigint[],
): Uint8Array | null => {
  const normalized = normalizePackedBlobBelts(belts);
  if (!normalized) return null;
  const byteLen = Number(normalized[0]);
  const body: number[] = [];
  for (let i = 1; i < normalized.length; i++) {
    const w = mustAt(normalized, i);
    for (let j = 0; j < 4; j++) {
      body.push(Number((w >> BigInt(j * 8)) & 0xffn));
    }
  }
  return new Uint8Array(body.slice(0, byteLen));
};

const packedBlobNoun = (bytes: Uint8Array): Noun =>
  toWire(vecToNoun(encodeBlobBelts(bytes)));

const pushEntry = (data: NoteData, key: string, noun: Noun): NoteData => {
  const filtered = data.filter(([k]) => k !== key);
  return [...filtered, [key, noun]];
};

export const noteDataPushMemo = (
  data: NoteData,
  memoUtf8: string,
): NoteData => {
  const bytes = new TextEncoder().encode(memoUtf8);
  if (bytes.length === 0) {
    throw new Error('Memo cannot be empty. Omit the memo field instead.');
  }
  if (bytes.length > MAX_MEMO_UTF8_BYTES) {
    throw new Error(
      `Memo too large: ${bytes.length} UTF-8 bytes (max ${MAX_MEMO_UTF8_BYTES})`,
    );
  }
  return pushEntry(data, NOTE_DATA_KEY_MEMO, packedBlobNoun(bytes));
};

export const noteDataPushBlob = (
  data: NoteData,
  blobUtf8: string,
): NoteData => {
  const trimmed = blobUtf8.trim();
  if (!trimmed) return data;
  const bytes = new TextEncoder().encode(trimmed);
  if (bytes.length > MAX_BLOB_UTF8_BYTES) {
    throw new Error(
      `blob exceeds max size (${MAX_BLOB_UTF8_BYTES} UTF-8 bytes)`,
    );
  }
  return pushEntry(data, NOTE_DATA_KEY_BLOB, packedBlobNoun(bytes));
};

/** Decode packed `%memo` / `%blob` jam bytes to UTF-8 when possible. */
export const decodePackedBlobUtf8 = (jamBytes: Uint8Array): string | null => {
  const tree = cue(jamBytes);
  if (!tree) return null;
  const decoded = decodeLenPrefixedBlob(beltSeqFromPackedNoun(tree));
  if (!decoded) return null;
  try {
    return new TextDecoder().decode(decoded);
  } catch {
    return null;
  }
};

/** Decode a note-data entry value (wire noun) to UTF-8 packed blob/memo bytes. */
export const decodeNoteDataPackedUtf8 = (noun: Noun): string | null =>
  decodePackedBlobUtf8(jam(fromWire(noun)));
