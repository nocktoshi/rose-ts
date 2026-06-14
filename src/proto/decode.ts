import type {
  Digest,
  LockPrimitive,
  LockTim,
  Pkh,
  SpendCondition,
  TimelockRange,
} from '../types.js';
import {digestFromProtobuf} from './digest.js';

const required = <T>(value: T | null | undefined, field: string): T => {
  if (value === null || value === undefined) {
    throw new Error(`missing required field: ${field}`);
  }
  return value;
};

const timelockRangeFromPb = (pb: {
  min?: {value?: string} | null;
  max?: {value?: string} | null;
}): TimelockRange => ({
  min: pb.min?.value != null ? Number(pb.min.value) : null,
  max: pb.max?.value != null ? Number(pb.max.value) : null,
});

const lockTimFromPb = (pb: {
  rel?: {min?: {value?: string} | null; max?: {value?: string} | null};
  abs?: {min?: {value?: string} | null; max?: {value?: string} | null};
}): LockTim => ({
  rel: timelockRangeFromPb(pb.rel ?? {}),
  abs: timelockRangeFromPb(pb.abs ?? {}),
});

const digestFromPbField = (value: unknown): Digest => {
  if (typeof value === 'string') return value as Digest;
  if (value && typeof value === 'object' && 'belt_1' in value) {
    return digestFromProtobuf(
      value as Parameters<typeof digestFromProtobuf>[0],
    );
  }
  throw new Error('invalid digest in lock primitive');
};

const pkhFromPb = (pb: {m: number; hashes: unknown[]}): Pkh => ({
  m: pb.m,
  hashes: pb.hashes.map(digestFromPbField) as Pkh['hashes'],
});

export const lockPrimitiveFromProtobuf = (pb: {
  primitive?: Record<string, unknown>;
}): LockPrimitive => {
  const prim = required(pb.primitive, 'LockPrimitive.primitive');
  if ('Pkh' in prim) {
    const pkh = prim['Pkh'] as {m: number; hashes: string[]};
    return {tag: 'pkh', ...pkhFromPb(pkh)};
  }
  if ('Tim' in prim) {
    return {
      tag: 'tim',
      ...lockTimFromPb(prim['Tim'] as Parameters<typeof lockTimFromPb>[0]),
    };
  }
  if ('Hax' in prim) {
    const hax = prim['Hax'] as {hashes: unknown[]};
    return {tag: 'hax', preimages: hax.hashes.map(digestFromPbField)};
  }
  if ('Burn' in prim) {
    return {tag: 'brn'};
  }
  throw new Error('unsupported lock primitive');
};

export const spendConditionFromProtobuf = (pb: {
  primitives?: {primitive?: Record<string, unknown>}[];
}): SpendCondition => {
  const primitives = pb.primitives ?? [];
  return primitives.map(p => lockPrimitiveFromProtobuf(p));
};
