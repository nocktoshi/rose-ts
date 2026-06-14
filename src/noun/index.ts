import {cue as cueInternal} from './cue.js';
import {jam as jamInternal} from './jam.js';
import {
  atomToBelts as atomToBeltsInternal,
  beltsToAtom as beltsToAtomInternal,
  tas as tasInternal,
  tasBelts as tasBeltsInternal,
  untas as untasInternal,
} from './belts.js';
import {fromWire, toWire} from './types.js';
import type {NounWire} from './types.js';

export type Noun = NounWire;

export const jam = (noun: Noun): Uint8Array => jamInternal(fromWire(noun));

export const cue = (jamBytes: Uint8Array): Noun => {
  const tree = cueInternal(jamBytes);
  if (!tree) throw new Error('unable to parse jam');
  return toWire(tree);
};

export const tas = (s: string): Noun => toWire(tasInternal(s));

export const untas = (noun: Noun): string => untasInternal(fromWire(noun));

export const atomToBelts = (noun: Noun): Noun =>
  toWire(atomToBeltsInternal(fromWire(noun)));

export const beltsToAtom = (noun: Noun): Noun =>
  toWire(beltsToAtomInternal(fromWire(noun)));

export const tasBelts = (s: string): Noun => toWire(tasBeltsInternal(s));
