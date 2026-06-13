import { mustAt } from "../core/must.js";
import { U256 } from "../core/u256.js";
import { cheetahPointFromBase58 } from "../crypto/cheetah.js";
import { jam } from "../noun/index.js";
import type {
  Digest,
  LockMerkleProof,
  LockPrimitive,
  Name,
  NoteData,
  Noun,
  PkhSignature,
  RawTxV1,
  SeedV1,
  Signature,
  Spend1V1,
  SpendV1,
  SpendCondition,
  TimelockRange,
} from "../types.js";
import {
  RawTransaction as GrpcRawTransaction,
  type HaxPreimage,
  type LockMerkleProof as GrpcLockMerkleProof,
  type LockPrimitive as GrpcLockPrimitive,
  type LockTim,
  type MerkleProof as GrpcMerkleProof,
  type NoteData as GrpcNoteData,
  type PkhSignature as GrpcPkhSignature,
  type RawTransaction,
  type Seed,
  type Spend,
  type SpendEntry,
  type Witness,
  type WitnessSpend,
} from "./gen/nockchain/common/v2/blockchain.js";
import type {
  EightBelt,
  SchnorrPubkey,
  SixBelt,
} from "./gen/nockchain/common/v1/primitives.js";
import type {
  SchnorrSignature,
  Source,
  TimeLockRangeAbsolute,
  TimeLockRangeRelative,
} from "./gen/nockchain/common/v1/blockchain.js";
import { digestToGrpcHash, nameToGrpcName } from "./convert.js";

function belt(value: bigint | number | string): { value: string } {
  return { value: String(value) };
}

function sixBelt(f6: readonly bigint[]): SixBelt {
  return {
    belt_1: belt(mustAt(f6, 0)),
    belt_2: belt(mustAt(f6, 1)),
    belt_3: belt(mustAt(f6, 2)),
    belt_4: belt(mustAt(f6, 3)),
    belt_5: belt(mustAt(f6, 4)),
    belt_6: belt(mustAt(f6, 5)),
  };
}

function eightBelt(belts: readonly bigint[]): EightBelt {
  return {
    belt_1: belt(mustAt(belts, 0)),
    belt_2: belt(mustAt(belts, 1)),
    belt_3: belt(mustAt(belts, 2)),
    belt_4: belt(mustAt(belts, 3)),
    belt_5: belt(mustAt(belts, 4)),
    belt_6: belt(mustAt(belts, 5)),
    belt_7: belt(mustAt(belts, 6)),
    belt_8: belt(mustAt(belts, 7)),
  };
}

function beltsFromLeBytes(bytes: Uint8Array): bigint[] {
  const belts: bigint[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, Math.min(i + 4, bytes.length));
    let v = 0n;
    for (let j = 0; j < chunk.length; j++) v |= BigInt(mustAt(chunk, j)) << BigInt(j * 8);
    belts.push(v);
  }
  while (belts.length < 8) belts.push(0n);
  return belts;
}

function schnorrSignatureToGrpc(sig: Signature): SchnorrSignature {
  const c = beltsFromLeBytes(U256.fromLeHex(sig.c).toLeBytes());
  const s = beltsFromLeBytes(U256.fromLeHex(sig.s).toLeBytes());
  return { chal: eightBelt(c), sig: eightBelt(s) };
}

function schnorrPubkeyToGrpc(pk: string): SchnorrPubkey {
  const point = cheetahPointFromBase58(pk);
  return {
    value: {
      x: sixBelt(point.x),
      y: sixBelt(point.y),
      inf: point.inf,
    },
  };
}

function timelockRangeAbsolute(range: TimelockRange): TimeLockRangeAbsolute {
  const out: TimeLockRangeAbsolute = {};
  if (range.min != null) out.min = { value: String(range.min) };
  if (range.max != null) out.max = { value: String(range.max) };
  return out;
}

function timelockRangeRelative(range: TimelockRange): TimeLockRangeRelative {
  const out: TimeLockRangeRelative = {};
  if (range.min != null) out.min = { value: String(range.min) };
  if (range.max != null) out.max = { value: String(range.max) };
  return out;
}

function lockPrimitiveToGrpc(prim: LockPrimitive): GrpcLockPrimitive {
  switch (prim.tag) {
    case "pkh": {
      const hashes = Array.isArray(prim.hashes) ? (prim.hashes as Digest[]) : [];
      return {
        primitive: {
          $case: "pkh",
          pkh: { m: String(prim.m), hashes: hashes.map(digestToGrpcHash) },
        },
      };
    }
    case "tim":
      return {
        primitive: {
          $case: "tim",
          tim: {
            rel: timelockRangeRelative(prim.rel),
            abs: timelockRangeAbsolute(prim.abs),
          } satisfies LockTim,
        },
      };
    case "hax": {
      const hashes = Array.isArray(prim.preimages) ? (prim.preimages as Digest[]) : [];
      return {
        primitive: {
          $case: "hax",
          hax: { hashes: hashes.map(digestToGrpcHash) },
        },
      };
    }
    case "brn":
      return { primitive: { $case: "burn", burn: {} } };
  }
}

function spendConditionToGrpc(sc: SpendCondition): GrpcLockMerkleProof["spend_condition"] {
  return { primitives: sc.map(lockPrimitiveToGrpc) };
}

function merkleProofToGrpc(proof: { root: Digest; path: Digest[] }): GrpcMerkleProof {
  return {
    root: digestToGrpcHash(proof.root),
    path: proof.path.map(digestToGrpcHash),
  };
}

function lockMerkleProofToGrpc(lmp: LockMerkleProof): GrpcLockMerkleProof {
  const axis = "version" in lmp && lmp.version === "full" ? lmp.axis : 1;
  const out: GrpcLockMerkleProof = {
    spend_condition: spendConditionToGrpc(lmp.spend_condition),
    axis: String(axis),
    proof: merkleProofToGrpc(lmp.proof),
  };
  if ("version" in lmp && lmp.version === "full") out.lmp_version = "1";
  return out;
}

function pkhSignatureToGrpc(sig: PkhSignature): GrpcPkhSignature {
  const pairs = Array.isArray(sig) ? sig : [];
  return {
    entries: pairs.map(([hash, [pubkey, signature]]) => ({
      hash: digestToGrpcHash(hash),
      pubkey: schnorrPubkeyToGrpc(pubkey),
      signature: schnorrSignatureToGrpc(signature),
    })),
  };
}

function haxPreimagesToGrpc(haxMap: [Digest, Noun][]): HaxPreimage[] {
  return haxMap.map(([hash, noun]) => ({
    hash: digestToGrpcHash(hash),
    value: jam(noun),
  }));
}

function noteDataToGrpc(data: NoteData): GrpcNoteData {
  return {
    entries: data.map(([key, noun]) => ({ key, blob: jam(noun) })),
  };
}

function sourceToGrpc(source: SeedV1["output_source"]): Source | undefined {
  if (source == null) return undefined;
  if ("Parent" in source) return undefined;
  const out: Source = { coinbase: source.is_coinbase };
  out.hash = digestToGrpcHash(source.hash);
  return out;
}

function lockRootDigest(lockRoot: SeedV1["lock_root"]): Digest {
  return typeof lockRoot === "string" ? lockRoot : "";
}

function seedToGrpc(seed: SeedV1): Seed {
  const out: Seed = {
    lock_root: digestToGrpcHash(lockRootDigest(seed.lock_root)),
    note_data: noteDataToGrpc(seed.note_data),
    gift: { value: seed.gift },
    parent_hash: digestToGrpcHash(seed.parent_hash),
  };
  const source = sourceToGrpc(seed.output_source);
  if (source) out.output_source = source;
  return out;
}

function witnessSpendToGrpc(spend: Spend1V1): WitnessSpend {
  return {
    witness: {
      lock_merkle_proof: lockMerkleProofToGrpc(spend.witness.lock_merkle_proof),
      pkh_signature: pkhSignatureToGrpc(spend.witness.pkh_signature),
      hax: haxPreimagesToGrpc(
        Array.isArray(spend.witness.hax_map) ? spend.witness.hax_map : []
      ),
    } satisfies Witness,
    seeds: (Array.isArray(spend.seeds) ? spend.seeds : []).map(seedToGrpc),
    fee: { value: spend.fee },
  };
}

function spendToGrpc(spend: SpendV1): Spend | undefined {
  if (spend.tag !== 1) return undefined;
  return { spend_kind: { $case: "witness", witness: witnessSpendToGrpc(spend) } };
}

function spendEntryToGrpc(name: Name, spend: SpendV1): SpendEntry {
  return {
    name: nameToGrpcName(name),
    spend: spendToGrpc(spend),
  };
}

/** Encode native v1 raw tx as `common.v2.RawTransaction` protobuf message. */
export function rawTxV1ToGrpc(tx: RawTxV1): RawTransaction {
  return {
    version: { value: tx.version },
    id: digestToGrpcHash(tx.id),
    spends: tx.spends.map(([name, spend]) => spendEntryToGrpc(name, spend)),
  };
}

/** Serialized `common.v2.RawTransaction` bytes (no gRPC-web frame). */
export function encodeRawTransactionBytes(tx: RawTxV1): Uint8Array {
  return GrpcRawTransaction.encode(rawTxV1ToGrpc(tx)).finish();
}