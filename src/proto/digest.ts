import type { Digest } from "../types.js";
import { digestFromBase58, digestToBase58 } from "../core/digest.js";

export interface PbCom1Hash {
  belt_1?: { value: string };
  belt_2?: { value: string };
  belt_3?: { value: string };
  belt_4?: { value: string };
  belt_5?: { value: string };
}

function requiredBelt(h: PbCom1Hash, field: keyof PbCom1Hash): bigint {
  const belt = h[field];
  if (!belt?.value) {
    throw new Error(`Hash missing required field ${field}`);
  }
  return BigInt(belt.value);
}

/** Decode gRPC v1 `Hash` protobuf to base58 `Digest`. */
export function digestFromProtobuf(h: PbCom1Hash): Digest {
  const belts = [
    requiredBelt(h, "belt_1"),
    requiredBelt(h, "belt_2"),
    requiredBelt(h, "belt_3"),
    requiredBelt(h, "belt_4"),
    requiredBelt(h, "belt_5"),
  ] as [bigint, bigint, bigint, bigint, bigint];
  return digestToBase58(belts) as Digest;
}

/** Encode base58 `Digest` to gRPC v1 `Hash` protobuf. */
export function digestToProtobuf(d: Digest): PbCom1Hash {
  const belts = digestFromBase58(d);
  return {
    belt_1: { value: String(belts[0]) },
    belt_2: { value: String(belts[1]) },
    belt_3: { value: String(belts[2]) },
    belt_4: { value: String(belts[3]) },
    belt_5: { value: String(belts[4]) },
  };
}