import { cue as cueInternal } from "./cue.js";
import { jam as jamInternal } from "./jam.js";
import {
  atomToBelts as atomToBeltsInternal,
  beltsToAtom as beltsToAtomInternal,
  tas as tasInternal,
  tasBelts as tasBeltsInternal,
  untas as untasInternal,
} from "./belts.js";
import { fromWire, toWire } from "./types.js";
import type { NounWire } from "./types.js";

export type Noun = NounWire;

export function jam(noun: Noun): Uint8Array {
  return jamInternal(fromWire(noun));
}

export function cue(jamBytes: Uint8Array): Noun {
  const tree = cueInternal(jamBytes);
  if (!tree) throw new Error("unable to parse jam");
  return toWire(tree);
}

export function tas(s: string): Noun {
  return toWire(tasInternal(s));
}

export function untas(noun: Noun): string {
  return untasInternal(fromWire(noun));
}

export function atomToBelts(noun: Noun): Noun {
  return toWire(atomToBeltsInternal(fromWire(noun)));
}

export function beltsToAtom(noun: Noun): Noun {
  return toWire(beltsToAtomInternal(fromWire(noun)));
}

export function tasBelts(s: string): Noun {
  return toWire(tasBeltsInternal(s));
}