import { must } from "../core/must.js";
import type { UBig } from "../core/ubig.js";
import { BitWriter } from "./bitwriter.js";
import { mugNoun, weightNoun, type NounTree } from "./types.js";

function met0U64(value: number): number {
  if (value === 0) return 0;
  return value.toString(2).length;
}

function met0Atom(atom: UBig): number {
  return atom.bitLen();
}

function matBackref(writer: BitWriter, backref: number): void {
  if (backref === 0) {
    writer.writeBitsFromValue(0b111, 3);
    return;
  }
  const backrefSz = met0U64(backref);
  const backrefSzSz = met0U64(backrefSz);
  writer.writeBit(true);
  writer.writeBit(true);
  writer.writeZeros(backrefSzSz);
  writer.writeBit(true);
  writer.writeBitsFromValue(backrefSz, backrefSzSz - 1);
  writer.writeBitsFromValue(backref, backrefSz);
}

function matAtom(writer: BitWriter, atom: UBig): void {
  if (atom.isZero()) {
    writer.writeBitsFromValue(0b10, 2);
    return;
  }
  const atomSz = met0Atom(atom);
  const atomSzSz = met0U64(atomSz);
  writer.writeBit(false);
  writer.writeZeros(atomSzSz);
  writer.writeBit(true);
  writer.writeBitsFromValue(atomSz, atomSzSz - 1);
  writer.writeBitsFromLeBytes(atom.toLeBytes(), atomSz);
}

function nounEquals(a: NounTree, b: NounTree): boolean {
  if (a.tag !== b.tag) return false;
  if (a.tag === "atom" && b.tag === "atom") return a.value.eq(b.value);
  if (a.tag === "cell" && b.tag === "cell") {
    return nounEquals(a.head, b.head) && nounEquals(a.tail, b.tail);
  }
  return false;
}

export function jam(noun: NounTree): Uint8Array {
  interface BackrefEntry { noun: NounTree; offset: number }
  const backrefs = new Map<string, BackrefEntry[]>();

  function key(weight: number, mug: number): string {
    return `${weight}:${mug}`;
  }

  function findBackref(weight: number, mug: number, target: NounTree): number | null {
    const entries = backrefs.get(key(weight, mug));
    if (!entries) return null;
    const hit = entries.find((e) => nounEquals(e.noun, target));
    return hit ? hit.offset : null;
  }

  const stack: { weight: number; mug: number; noun: NounTree }[] = [];
  stack.push({ weight: weightNoun(noun), mug: mugNoun(noun), noun });

  const buffer = new BitWriter();

  while (stack.length > 0) {
    const { weight, mug, noun: current } = must(stack.pop(), "jam stack empty");
    const backref = findBackref(weight, mug, current);

    if (backref !== null) {
      if (current.tag === "atom") {
        if (met0U64(backref) < met0Atom(current.value)) {
          matBackref(buffer, backref);
        } else {
          matAtom(buffer, current.value);
        }
      } else {
        matBackref(buffer, backref);
      }
    } else {
      const offset = buffer.bitLen();
      const k = key(weight, mug);
      if (!backrefs.has(k)) backrefs.set(k, []);
      must(backrefs.get(k), "jam backref bucket missing").push({ noun: current, offset });

      if (current.tag === "atom") {
        matAtom(buffer, current.value);
      } else {
        buffer.writeBit(true);
        buffer.writeBit(false);
        stack.push({
          weight: weightNoun(current.tail),
          mug: mugNoun(current.tail),
          noun: current.tail,
        });
        stack.push({
          weight: weightNoun(current.head),
          mug: mugNoun(current.head),
          noun: current.head,
        });
      }
    }
  }

  return buffer.intoVec();
}