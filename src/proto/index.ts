import { mustAt } from "../core/must.js";
import type {
  Digest,
  LockPrimitive,
  LockMerkleProof,
  MerkleProof,
  Name,
  NoteData,
  PbCom2RawTransaction,
  PbCom2SpendEntry,
  PkhSignature,
  RawTxV1,
  SeedV1,
  Signature,
  Spend1V1,
  SpendV1,
  SpendCondition,
} from "../types.js";
import { cheetahPointFromBase58 } from "../crypto/cheetah.js";
import { U256 } from "../core/u256.js";
import { jam } from "../noun/index.js";

export { noteFromProtobuf, noteToProtobuf } from "./note.js";
export { spendConditionFromProtobuf } from "./decode.js";
export { digestFromProtobuf, digestToProtobuf } from "./digest.js";
export type { PbCom1Hash } from "./digest.js";
export { rawTxFromProtobuf } from "./rawTx.js";

function sixBelt(f6: bigint[]): Record<string, { value: string }> {
  return {
    belt_1: { value: String(mustAt(f6, 0)) },
    belt_2: { value: String(mustAt(f6, 1)) },
    belt_3: { value: String(mustAt(f6, 2)) },
    belt_4: { value: String(mustAt(f6, 3)) },
    belt_5: { value: String(mustAt(f6, 4)) },
    belt_6: { value: String(mustAt(f6, 5)) },
  };
}

function schnorrFromSignature(sig: Signature): Record<string, unknown> {
  const c = beltsFromLeBytes(U256.fromLeHex(sig.c).toLeBytes());
  const s = beltsFromLeBytes(U256.fromLeHex(sig.s).toLeBytes());
  const chal: Record<string, { value: string }> = {};
  const sigVal: Record<string, { value: string }> = {};
  for (let i = 0; i < 8; i++) {
    chal[`belt_${i + 1}`] = { value: String(c[i] ?? 0n) };
    sigVal[`belt_${i + 1}`] = { value: String(s[i] ?? 0n) };
  }
  return { chal, sig: sigVal };
}

function beltsFromLeBytes(bytes: Uint8Array): bigint[] {
  const belts: bigint[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, Math.min(i + 4, bytes.length));
    let v = 0n;
    for (let j = 0; j < chunk.length; j++) {
      v |= BigInt(mustAt(chunk, j)) << BigInt(j * 8);
    }
    belts.push(v);
  }
  while (belts.length < 8) belts.push(0n);
  return belts;
}

function pubkeyToPb(pk: string): Record<string, unknown> {
  const point = cheetahPointFromBase58(pk);
  return {
    value: {
      x: sixBelt(point.x),
      y: sixBelt(point.y),
      inf: point.inf,
    },
  };
}

function pkhSignatureToPb(sig: PkhSignature): Record<string, unknown> {
  return {
    entries: sig.map(([hash, [pubkey, signature]]) => ({
      hash,
      pubkey: pubkeyToPb(pubkey),
      signature: schnorrFromSignature(signature),
    })),
  };
}

function lockPrimitiveToPb(prim: LockPrimitive): Record<string, unknown> {
  switch (prim.tag) {
    case "pkh": {
      const hashes = Array.isArray(prim.hashes) ? (prim.hashes as Digest[]) : [];
      return { primitive: { Pkh: { m: prim.m, hashes } } };
    }
    case "tim":
      return { primitive: { Tim: prim } };
    case "hax": {
      const hashes = Array.isArray(prim.preimages) ? (prim.preimages as Digest[]) : [];
      return { primitive: { Hax: { hashes } } };
    }
    case "brn":
      return { primitive: { Burn: {} } };
  }
}

export function spendConditionToProtobuf(sc: SpendCondition): Record<string, unknown> {
  return { primitives: sc.map((p) => lockPrimitiveToPb(p)) };
}

function merkleProofToPb(proof: MerkleProof): Record<string, unknown> {
  return { root: proof.root, path: proof.path };
}

function lockMerkleProofToPb(lmp: LockMerkleProof): Record<string, unknown> {
  const base = {
    spend_condition: spendConditionToProtobuf(lmp.spend_condition),
    axis: lmp.axis,
    proof: merkleProofToPb(lmp.proof),
  };
  if ("version" in lmp && lmp.version === "full") {
    return { ...base, lmp_version: "full" };
  }
  return base;
}

function noteDataToPb(data: NoteData): Record<string, unknown> {
  return { entries: data.map(([key, noun]) => ({ key, blob: [...jam(noun)] })) };
}

function seedToPb(seed: SeedV1): Record<string, unknown> {
  const lockRoot = typeof seed.lock_root === "string" ? seed.lock_root : "";
  return {
    output_source: seed.output_source,
    lock_root: lockRoot,
    note_data: noteDataToPb(seed.note_data),
    gift: { value: seed.gift },
    parent_hash: seed.parent_hash,
  };
}

function spendToPb(spend: SpendV1): Record<string, unknown> | null {
  if (spend.tag === 0) return null;
  const s = spend as Spend1V1;
  return {
    spend_kind: {
      Witness: {
        witness: {
          lock_merkle_proof: lockMerkleProofToPb(s.witness.lock_merkle_proof),
          pkh_signature: pkhSignatureToPb(s.witness.pkh_signature),
          hax: [],
        },
        seeds: (Array.isArray(s.seeds) ? s.seeds : []).map(seedToPb),
        fee: { value: s.fee },
      },
    },
  };
}

function nameToPb(name: Name): Record<string, unknown> {
  return { first: name.first, last: name.last };
}

export function rawTxToProtobuf(tx: RawTxV1): PbCom2RawTransaction {
  return {
    version: { value: "1" },
    id: tx.id,
    spends: tx.spends.map(([name, spend]): PbCom2SpendEntry => ({
      name: nameToPb(name) as NonNullable<PbCom2SpendEntry["name"]>,
      spend: spendToPb(spend) as NonNullable<PbCom2SpendEntry["spend"]>,
    })),
  };
}