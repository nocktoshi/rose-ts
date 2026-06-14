import {mustAt} from '../core/must.js';
import {UBig} from '../core/ubig.js';

/** Wire format: atom = lowercase hex string, cell = right-associated array. */
export type NounWire = string | NounWire[];

export interface NounAtom {
  tag: 'atom';
  value: UBig;
}
export interface NounCell {
  tag: 'cell';
  head: NounTree;
  tail: NounTree;
  mug: number;
  weight: number;
}
export type NounTree = NounAtom | NounCell;

export const atom = (value: UBig): NounAtom => ({tag: 'atom', value});

const mug = (mutX: bigint): bigint => {
  let x = mutX;
  x = (x ^ (x >> 30n)) * 0xbf58476d1ce4e5b9n;
  x = (x ^ (x >> 27n)) * 0x94d049bb133111ebn;
  x = x ^ (x >> 31n);
  return x & 0xffffffffffffffffn;
};

const mugBytes = (b: Uint8Array): bigint => {
  let ret = 0n;
  for (const byte of b) {
    ret = mug(ret + BigInt(byte));
  }
  return mug(ret);
};

export const mugNoun = (noun: NounTree): number => {
  if (noun.tag === 'atom') {
    return Number(mug(mugBytes(noun.value.toLeBytes())) & 0xffffffffn);
  }
  return Number(
    mug(
      BigInt(noun.head.tag === 'cell' ? noun.head.mug : mugNoun(noun.head)) |
        (BigInt(
          noun.tail.tag === 'cell' ? noun.tail.mug : mugNoun(noun.tail),
        ) <<
          32n),
    ) & 0xffffffffn,
  );
};

export const weightNoun = (noun: NounTree): number => {
  if (noun.tag === 'atom') return 1;
  return (
    1 +
    (noun.head.tag === 'cell' ? noun.head.weight : weightNoun(noun.head)) +
    (noun.tail.tag === 'cell' ? noun.tail.weight : weightNoun(noun.tail))
  );
};

export const cons = (head: NounTree, tail: NounTree): NounCell => {
  const cell: NounCell = {tag: 'cell', head, tail, mug: 0, weight: 0};
  cell.weight = weightNoun(cell);
  cell.mug = mugNoun(cell);
  return cell;
};

export const toWire = (noun: NounTree): NounWire => {
  if (noun.tag === 'atom') {
    return noun.value.toHex();
  }
  const items: NounWire[] = [];
  let current: NounTree = noun;
  while (current.tag === 'cell') {
    items.push(toWire(current.head));
    current = current.tail;
  }
  items.push(toWire(current));
  return items;
};

export const fromWire = (wire: NounWire): NounTree => {
  if (typeof wire === 'string') {
    return atom(UBig.from(wire));
  }
  if (wire.length < 2) {
    throw new Error('expected at least 2 elements in cell');
  }
  let top = fromWire(mustAt(wire, wire.length - 1));
  for (let i = wire.length - 2; i >= 0; i--) {
    top = cons(fromWire(mustAt(wire, i)), top);
  }
  return top;
};
