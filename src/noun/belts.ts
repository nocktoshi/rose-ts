import { PRIME } from "../core/belt.js";
import { mustAt } from "../core/must.js";
import { beltsFromUbig, UBig } from "../core/ubig.js";
import { atom, cons, type NounTree } from "./types.js";

export function tas(s: string): NounTree {
  const bytes = new TextEncoder().encode(s);
  return atom(UBig.fromLeBytes(bytes));
}

/** Belt sequence as improper list (no trailing 0). */
export function beltSeqToNoun(belts: bigint[]): NounTree {
  if (belts.length === 0) return atom(UBig.zero());
  let acc: NounTree = atom(UBig.from(mustAt(belts, belts.length - 1)));
  for (let i = belts.length - 2; i >= 0; i--) {
    acc = cons(atom(UBig.from(mustAt(belts, i))), acc);
  }
  return acc;
}

/** Vec encoding with trailing 0 terminator (proper list). */
export function vecToNoun(belts: bigint[]): NounTree {
  let acc: NounTree = atom(UBig.zero());
  for (let i = belts.length - 1; i >= 0; i--) {
    acc = cons(atom(UBig.from(mustAt(belts, i))), acc);
  }
  return acc;
}

export function atomToBelts(noun: NounTree): NounTree {
  if (noun.tag !== "atom") {
    throw new Error("not an atom");
  }
  return beltSeqToNoun(beltsFromUbig(noun.value));
}

export function tasBelts(s: string): NounTree {
  return atomToBelts(tas(s));
}

function beltSeqFromNoun(noun: NounTree): bigint[] {
  const belts: bigint[] = [];
  let current: NounTree = noun;
  while (current.tag === "cell") {
    const head = current.head;
    if (head.tag !== "atom") throw new Error("expected atom belt");
    const v = head.value.tryIntoU64();
    if (v === null) throw new Error("belt atom too large");
    belts.push(v);
    current = current.tail;
  }
  if (current.tag !== "atom") throw new Error("expected atom terminator");
  const last = current.value.tryIntoU64();
  if (last === null) throw new Error("belt atom too large");
  belts.push(last);
  return belts;
}

function beltsToUbig(belts: bigint[]): UBig {
  let num = 0n;
  let power = 1n;
  for (const belt of belts) {
    num += belt * power;
    power *= PRIME;
  }
  return UBig.from(num);
}

export function beltsToAtom(noun: NounTree): NounTree {
  return atom(beltsToUbig(beltSeqFromNoun(noun)));
}

export function untas(noun: NounTree): string {
  if (noun.tag !== "atom") throw new Error("not an atom");
  const bytes = noun.value.toLeBytes();
  return new TextDecoder().decode(bytes);
}