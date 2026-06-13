import type {
  Digest,
  LockMerkleProof,
  Name,
  NoteData,
  PbCom2RawTransaction,
  PkhSignature,
  RawTxV1,
  SeedV1,
  Signature,
  Source,
  Spend1V1,
  SpendV1,
  SpendsV1,
  Witness,
} from "../types.js";
import { mustAt } from "../core/must.js";
import { spendConditionFromProtobuf } from "./decode.js";
import { cue } from "../noun/cue.js";
import { toWire } from "../noun/types.js";
import type { Noun } from "../types.js";
import { cheetahPointToBase58 } from "../crypto/cheetah.js";
import type { CheetahPoint, F6lt } from "../crypto/cheetah.js";
import { U256 } from "../core/u256.js";

function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`missing required field: ${field}`);
  }
  return value;
}

function digestField(value: unknown, field: string): Digest {
  if (typeof value === "string") return value as Digest;
  if (value && typeof value === "object" && "value" in value) {
    const v = (value as { value?: string }).value;
    if (typeof v === "string") return v as Digest;
  }
  throw new Error(`invalid digest field: ${field}`);
}

function nicksField(value: unknown, field: string): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object" && "value" in value) {
    const v = (value as { value?: string }).value;
    if (typeof v === "string") return v;
  }
  throw new Error(`invalid nicks field: ${field}`);
}

function sixBeltFromPb(pb: Record<string, { value?: string } | undefined>): F6lt {
  const belt = (n: number) => BigInt(pb[`belt_${n}`]?.value ?? 0);
  return [belt(1), belt(2), belt(3), belt(4), belt(5), belt(6)];
}

function cheetahPointFromPb(pb: {
  x?: Record<string, { value?: string }>;
  y?: Record<string, { value?: string }>;
  inf?: boolean;
}): CheetahPoint {
  return {
    x: sixBeltFromPb(pb.x ?? {}),
    y: sixBeltFromPb(pb.y ?? {}),
    inf: pb.inf ?? false,
  };
}

function beltsFromPb(pb: Record<string, { value?: string } | undefined>, count: number): bigint[] {
  const belts: bigint[] = [];
  for (let i = 1; i <= count; i++) {
    belts.push(BigInt(pb[`belt_${i}`]?.value ?? 0));
  }
  return belts;
}

function beltsToLeBytes(belts: readonly bigint[]): Uint8Array {
  const out = new Uint8Array(32);
  for (let i = 0; i < belts.length && i < 8; i++) {
    const v = mustAt(belts, i);
    for (let j = 0; j < 4; j++) {
      out[i * 4 + j] = Number((v >> BigInt(j * 8)) & 0xffn);
    }
  }
  return out;
}

function u256ToLeHex(v: U256): string {
  return [...v.toLeBytes()].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function signatureFromPb(pb: {
  chal?: Record<string, { value?: string }>;
  sig?: Record<string, { value?: string }>;
}): Signature {
  const c = U256.fromLeBytes(beltsToLeBytes(beltsFromPb(pb.chal ?? {}, 8)));
  const s = U256.fromLeBytes(beltsToLeBytes(beltsFromPb(pb.sig ?? {}, 8)));
  return { c: u256ToLeHex(c), s: u256ToLeHex(s) };
}

function sourceFromPb(pb: { hash: string; is_coinbase?: boolean }): Source {
  return {
    hash: pb.hash as Digest,
    is_coinbase: pb.is_coinbase ?? false,
  };
}

function noteDataFromPb(pb: { entries?: { key: string; blob: number[] }[] } | null | undefined): NoteData {
  const entries = pb?.entries ?? [];
  if (entries.length === 0) return [];
  return entries.map((e) => {
    const tree = cue(new Uint8Array(e.blob));
    if (!tree) throw new Error("invalid note_data jam");
    return [e.key, toWire(tree) as Noun];
  });
}

function lockMerkleProofFromPb(pb: {
  spend_condition?: { primitives?: { primitive?: Record<string, unknown> }[] };
  axis?: number;
  proof?: { root?: unknown; path?: unknown[] };
  lmp_version?: string;
}): LockMerkleProof {
  const spendCondition = spendConditionFromProtobuf(
    required(pb.spend_condition, "LockMerkleProof.spend_condition") as Parameters<
      typeof spendConditionFromProtobuf
    >[0]
  );
  const proofPb = required(pb.proof, "LockMerkleProof.proof");
  const proof = {
    root: digestField(proofPb.root, "MerkleProof.root"),
    path: (proofPb.path ?? []).map((h) => digestField(h, "MerkleProof.path")),
  };
  const axis = pb.axis ?? 1;
  if (pb.lmp_version === "full") {
    return { version: "full", spend_condition: spendCondition, axis, proof };
  }
  if (axis === 1) {
    return { spend_condition: spendCondition, axis: 1, proof };
  }
  throw new Error("stub merkle proof with axis != 1");
}

function legacySignatureFromPb(pb: {
  entries?: {
    schnorr_pubkey?: { value?: { x?: unknown; y?: unknown; inf?: boolean } };
    signature?: { chal?: Record<string, { value?: string }>; sig?: Record<string, { value?: string }> };
  }[];
}): [string, Signature][] {
  const entries = pb.entries ?? [];
  return entries.map((entry) => {
    const pubkeyPb = required(entry.schnorr_pubkey?.value, "LegacySignatureEntry.schnorr_pubkey");
    const pubkey = cheetahPointToBase58(cheetahPointFromPb(pubkeyPb as Parameters<typeof cheetahPointFromPb>[0]));
    const signature = signatureFromPb(required(entry.signature, "LegacySignatureEntry.signature"));
    return [pubkey, signature];
  });
}

function pkhSignatureFromPb(pb: {
  entries?: {
    hash?: unknown;
    pubkey?: { value?: { x?: unknown; y?: unknown; inf?: boolean } };
    signature?: { chal?: Record<string, { value?: string }>; sig?: Record<string, { value?: string }> };
  }[];
}): PkhSignature {
  const entries = pb.entries ?? [];
  return entries.map((entry) => {
    const hash = digestField(entry.hash, "PkhSignatureEntry.hash");
    const pubkeyPb = required(entry.pubkey?.value, "PkhSignatureEntry.pubkey");
    const pubkey = cheetahPointToBase58(cheetahPointFromPb(pubkeyPb as Parameters<typeof cheetahPointFromPb>[0]));
    const signature = signatureFromPb(required(entry.signature, "PkhSignatureEntry.signature"));
    return [hash, [pubkey, signature]] as PkhSignature[number];
  });
}

function witnessFromPb(pb: {
  lock_merkle_proof?: unknown;
  pkh_signature?: unknown;
  hax?: { hash?: unknown; value: number[] }[];
}): Witness {
  const lockMerkleProof = lockMerkleProofFromPb(
    required(pb.lock_merkle_proof, "Witness.lock_merkle_proof") as Parameters<typeof lockMerkleProofFromPb>[0]
  );
  const pkhSignature = pkhSignatureFromPb(
    required(pb.pkh_signature, "Witness.pkh_signature") as Parameters<typeof pkhSignatureFromPb>[0]
  );
  const haxMap: Witness["hax_map"] = [];
  for (const hax of pb.hax ?? []) {
    const hash = digestField(hax.hash, "HaxPreimage.hash");
    const tree = cue(new Uint8Array(hax.value));
    if (!tree) throw new Error("invalid hax preimage jam");
    haxMap.push([hash, toWire(tree) as Noun]);
  }
  return {
    lock_merkle_proof: lockMerkleProof,
    pkh_signature: pkhSignature,
    hax_map: haxMap,
    tim: null,
  };
}

function seedFromPb(pb: {
  output_source?: { source?: { hash: string; is_coinbase?: boolean } } | null;
  lock_root?: unknown;
  note_data?: { entries?: { key: string; blob: number[] }[] } | null;
  gift?: unknown;
  parent_hash?: unknown;
}): SeedV1 {
  const outputSource = pb.output_source?.source
    ? sourceFromPb(pb.output_source.source)
    : null;
  return {
    output_source: outputSource,
    lock_root: digestField(pb.lock_root, "Seed.lock_root"),
    note_data: noteDataFromPb(pb.note_data),
    gift: nicksField(pb.gift, "Seed.gift") as SeedV1["gift"],
    parent_hash: digestField(pb.parent_hash, "Seed.parent_hash"),
  };
}

function nameFromPb(pb: { first: string; last: string }): Name {
  return { first: pb.first as Digest, last: pb.last as Digest, _sig: 0 };
}

function spendFromPb(pb: { spend_kind?: Record<string, unknown> }): SpendV1 {
  const kind = required(pb.spend_kind, "Spend.spend_kind");
  if ("Witness" in kind) {
    const w = kind["Witness"] as {
      witness?: unknown;
      seeds?: unknown[];
      fee?: unknown;
    };
    const witness = witnessFromPb(required(w.witness, "WitnessSpend.witness") as Parameters<typeof witnessFromPb>[0]);
    const seeds = (w.seeds ?? []).map((s) =>
      seedFromPb(s as Parameters<typeof seedFromPb>[0])
    );
    const fee = nicksField(required(w.fee, "WitnessSpend.fee"), "WitnessSpend.fee");
    const spend: Spend1V1 = { witness, seeds, fee: fee as Spend1V1["fee"] };
    return { tag: 1, ...spend };
  }
  if ("Legacy" in kind) {
    const l = kind["Legacy"] as {
      signature?: unknown;
      seeds?: unknown[];
      fee?: unknown;
    };
    const signature = legacySignatureFromPb(
      required(l.signature, "LegacySpend.signature") as Parameters<typeof legacySignatureFromPb>[0]
    );
    const seeds = (l.seeds ?? []).map((s) =>
      seedFromPb(s as Parameters<typeof seedFromPb>[0])
    );
    const fee = nicksField(required(l.fee, "LegacySpend.fee"), "LegacySpend.fee");
    return { tag: 0, signature, seeds, fee: fee as Spend1V1["fee"] };
  }
  throw new Error("unsupported spend kind");
}

export function rawTxFromProtobuf(tx: PbCom2RawTransaction): RawTxV1 {
  const version = Number(required(tx.version?.value, "RawTransaction.version"));
  if (version !== 1) {
    throw new Error(`unsupported RawTransaction version: ${version}`);
  }
  const id = digestField(tx.id, "RawTransaction.id");
  const spends: SpendsV1 = (tx.spends ?? []).map((entry) => {
    const name = nameFromPb(required(entry.name, "SpendEntry.name") as { first: string; last: string });
    const spend = spendFromPb(required(entry.spend, "SpendEntry.spend") as { spend_kind?: Record<string, unknown> });
    return [name, spend] as [Name, SpendV1];
  });
  return { version: 1, id, spends };
}