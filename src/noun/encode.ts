import {mustAt} from '../core/must.js';
import {digestFromBase58} from '../core/digest.js';
import {UBig} from '../core/ubig.js';
import {hashNounWhole} from '../hash/structural.js';
import {atom, cons, type NounTree} from './types.js';

export const encodeAtomU64 = (v: bigint): NounTree => atom(UBig.from(v));

export const encodeTuple = (items: NounTree[]): NounTree => {
  if (items.length === 0) return encodeAtomU64(0n);
  let acc = mustAt(items, items.length - 1);
  for (let i = items.length - 2; i >= 0; i--) {
    acc = cons(mustAt(items, i), acc);
  }
  return acc;
};

export const encodeDigest = (d: string): NounTree => {
  const belts = digestFromBase58(d);
  return encodeTuple(belts.map(b => encodeAtomU64(b)));
};

export const encodeBeltSeq = (belts: bigint[]): NounTree => {
  if (belts.length === 0) return encodeAtomU64(0n);
  return encodeTuple(belts.map(b => encodeAtomU64(b)));
};

export const encodeName = (name: {
  first: string;
  last: string;
  _sig?: number;
}): NounTree =>
  encodeTuple([
    encodeDigest(name.first),
    encodeDigest(name.last),
    encodeAtomU64(BigInt(name._sig ?? 0)),
  ]);

/** Noun ordering digest (`to_noun().hash()` / `Hashable for Noun`). */
export const nounOrderDigest = (noun: NounTree): string => hashNounWhole(noun);
