import { must, mustAt } from "../core/must.js";
import { UBig } from "../core/ubig.js";
import { atom, cons, type NounTree } from "./types.js";

class BitReader {
  constructor(private readonly bytes: Uint8Array) {}

  cursor = 0;

  len(): number {
    return this.bytes.length * 8;
  }

  nextBit(): boolean {
    if (this.cursor >= this.len()) return false;
    const byteIdx = Math.floor(this.cursor / 8);
    const bitIdx = this.cursor % 8;
    this.cursor++;
    return ((mustAt(this.bytes, byteIdx) >> bitIdx) & 1) === 1;
  }

  nextUpToNBits(n: number): boolean[] {
    const bits: boolean[] = [];
    for (let i = 0; i < n && this.cursor < this.len(); i++) {
      bits.push(this.nextBit());
    }
    return bits;
  }

  getSize(): number | null {
    const start = this.cursor;
    let bitsize = -1;
    for (let i = start; i < this.len(); i++) {
      this.cursor = i;
      if (this.nextBit()) {
        bitsize = i - start;
        break;
      }
    }
    if (bitsize < 0) {
      this.cursor = start;
      return null;
    }

    if (bitsize === 0) return 0;

    const sizeBits = this.nextUpToNBits(bitsize - 1);
    let size = 0n;
    for (let i = 0; i < sizeBits.length; i++) {
      if (sizeBits[i]) size |= 1n << BigInt(i);
    }
    return Number(size) + (1 << (bitsize - 1));
  }

  rubBackref(): bigint | null {
    const size = this.getSize();
    if (size === null) return null;
    if (size === 0) return 0n;
    if (size > 64) return null;
    const bits = this.nextUpToNBits(size);
    let backref = 0n;
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) backref |= 1n << BigInt(i);
    }
    return backref;
  }

  rubAtom(): UBig | null {
    const size = this.getSize();
    if (size === null) return null;
    if (size === 0) return UBig.zero();
    if (size < 64) {
      const bits = this.nextUpToNBits(size);
      let direct = 0n;
      for (let i = 0; i < bits.length; i++) {
        if (bits[i]) direct |= 1n << BigInt(i);
      }
      return UBig.from(direct);
    }
    const wordsize = (size + 63) >> 6;
    const bytes = new Uint8Array(wordsize * 8);
    const bits = this.nextUpToNBits(size);
    for (let i = 0; i < bits.length; i++) {
      if (bits[i]) {
        const byteIdx = Math.floor(i / 8);
        const bitIdx = i % 8;
        bytes[byteIdx] = mustAt(bytes, byteIdx) | (1 << bitIdx);
      }
    }
    return UBig.fromLeBytes(bytes);
  }
}

type MutableTree =
  | { tag: "atom"; value: UBig }
  | { tag: "cell"; head: Slot; tail: Slot };

interface Slot { tree: MutableTree }

type CueStackEntry =
  | { kind: "dest"; slot: Slot }
  | { kind: "backref"; backref: bigint; slot: Slot };

function makeAtomSlot(): Slot {
  return { tree: { tag: "atom", value: UBig.zero() } };
}

function setAtom(slot: Slot, value: UBig): void {
  slot.tree = { tag: "atom", value };
}

function freeze(m: MutableTree): NounTree {
  if (m.tag === "atom") return atom(m.value);
  return cons(freeze(m.head.tree), freeze(m.tail.tree));
}

export function cue(bytes: Uint8Array): NounTree | null {
  const reader = new BitReader(bytes);
  const backrefMap = new Map<bigint, MutableTree>();
  const rootSlot = makeAtomSlot();
  const stack: CueStackEntry[] = [{ kind: "dest", slot: rootSlot }];

  while (stack.length > 0) {
    const entry = must(stack.pop(), "cue stack empty");

    if (entry.kind === "backref") {
      backrefMap.set(entry.backref, entry.slot.tree);
      continue;
    }

    const slot = entry.slot;
    const startCursor = reader.cursor;

    if (reader.nextBit()) {
      if (reader.nextBit()) {
        const backref = reader.rubBackref();
        if (backref === null) return null;
        const resolved = backrefMap.get(backref);
        if (!resolved) return null;
        slot.tree = resolved;
      } else {
        const headSlot = makeAtomSlot();
        const tailSlot = makeAtomSlot();
        const cell: MutableTree = { tag: "cell", head: headSlot, tail: tailSlot };
        slot.tree = cell;
        const backref = BigInt(startCursor);
        backrefMap.set(backref, cell);
        stack.push({ kind: "backref", backref, slot });
        stack.push({ kind: "dest", slot: tailSlot });
        stack.push({ kind: "dest", slot: headSlot });
      }
    } else {
      const a = reader.rubAtom();
      if (!a) return null;
      setAtom(slot, a);
      backrefMap.set(BigInt(startCursor), slot.tree);
    }
  }

  return freeze(rootSlot.tree);
}