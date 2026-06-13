import type { Digest, LockPrimitive, LockTim, Pkh, SpendCondition, TimelockRange } from "../types.js";

function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`missing required field: ${field}`);
  }
  return value;
}

function timelockRangeFromPb(pb: {
  min?: { value?: string } | null;
  max?: { value?: string } | null;
}): TimelockRange {
  return {
    min: pb.min?.value != null ? Number(pb.min.value) : null,
    max: pb.max?.value != null ? Number(pb.max.value) : null,
  };
}

function lockTimFromPb(pb: {
  rel?: { min?: { value?: string } | null; max?: { value?: string } | null };
  abs?: { min?: { value?: string } | null; max?: { value?: string } | null };
}): LockTim {
  return {
    rel: timelockRangeFromPb(pb.rel ?? {}),
    abs: timelockRangeFromPb(pb.abs ?? {}),
  };
}

function pkhFromPb(pb: { m: number; hashes: string[] }): Pkh {
  return { m: pb.m, hashes: pb.hashes as Pkh["hashes"] };
}

export function lockPrimitiveFromProtobuf(pb: {
  primitive?: Record<string, unknown>;
}): LockPrimitive {
  const prim = required(pb.primitive, "LockPrimitive.primitive");
  if ("Pkh" in prim) {
    const pkh = prim["Pkh"] as { m: number; hashes: string[] };
    return { tag: "pkh", ...pkhFromPb(pkh) };
  }
  if ("Tim" in prim) {
    return { tag: "tim", ...lockTimFromPb(prim["Tim"] as Parameters<typeof lockTimFromPb>[0]) };
  }
  if ("Hax" in prim) {
    const hax = prim["Hax"] as { hashes: string[] };
    return { tag: "hax", preimages: hax.hashes as Digest[] };
  }
  if ("Burn" in prim) {
    return { tag: "brn" };
  }
  throw new Error("unsupported lock primitive");
}

export function spendConditionFromProtobuf(pb: {
  primitives?: { primitive?: Record<string, unknown> }[];
}): SpendCondition {
  const primitives = pb.primitives ?? [];
  return primitives.map((p) => lockPrimitiveFromProtobuf(p));
}