/** Base58 Tip5 digest (branded string). */
export type Digest = string & { readonly __tag_digest?: undefined };

/** Nicks amount as decimal string (branded). */
export type Nicks = string & { readonly __tag_nicks?: undefined };

import type { NounWire } from "./noun/types.js";

/** Jam/cue wire noun (`hex-atom` or right-nested cell array). */
export type Noun = NounWire;

/** Wire Z-map/Z-set: `[key, value][]` (wasm/oracle JSON parity). */
export type ZMap<K, V> = [K, V][];
export type ZSet<T> = T[];

export interface Name {
  first: Digest;
  last: Digest;
  _sig?: number;
  source?: Source;
  parent?: Digest;
  parent_hash?: Digest;
  Parent?: { parent: Digest; index: number };
}

export type Source =
  | { hash: Digest; is_coinbase: boolean }
  | { Parent: { parent: Digest; index: number } };

export type Version = 0 | 1;
export type TxId = Digest;
export type BlockHeight = number;

export interface Pkh {
  m: number;
  hashes: ZSet<Digest>;
}

export interface LockTim {
  rel: TimelockRange;
  abs: TimelockRange;
}

export interface TimelockRange {
  min: number | null;
  max: number | null;
}

export interface Hax {
  preimages: ZSet<Digest>;
}

export type LockPrimitive =
  | ({ tag: "pkh" } & Pkh)
  | ({ tag: "tim" } & LockTim)
  | ({ tag: "hax" } & Hax)
  | { tag: "brn" };

export type SpendCondition = LockPrimitive[];

export interface LockV2 {
  p: SpendCondition;
  q: SpendCondition;
}

export interface LockV4 {
  p: LockV2;
  q: LockV2;
}

export interface LockV8 {
  p: LockV4;
  q: LockV4;
}

export interface LockV16 {
  p: LockV8;
  q: LockV8;
}

export type Lock =
  | SpendCondition
  | ({ tag: 2 } & LockV2)
  | ({ tag: 4 } & LockV4)
  | ({ tag: 8 } & LockV8)
  | ({ tag: 16 } & LockV16);

export type LockRoot = Digest | Lock;

/** Wire: `[key, noun][]` (empty map is `[]`). */
export type NoteData = [string, Noun][];

export interface NoteV1 {
  version: Version;
  origin_page: BlockHeight;
  name: Name;
  note_data: NoteData;
  assets: Nicks;
  lock?: Lock;
  source?: Source;
  parent_hash?: Digest;
}

export interface NoteV0 {
  inner: {
    version: Version;
    origin_page: BlockHeight;
    timelock?: { tim: unknown };
  };
  name: Name;
  sig: unknown;
  source: { hash: Digest; is_coinbase: boolean };
  assets: Nicks;
}

export type Note = NoteV0 | NoteV1;

export interface SeedV1 {
  output_source: Source | null;
  lock_root: LockRoot;
  note_data: NoteData;
  gift: Nicks;
  parent_hash: Digest;
}

export interface MerkleProof {
  root: Digest;
  path: Digest[];
}

export interface LockMerkleProofStub {
  spend_condition: SpendCondition;
  axis: 1;
  proof: MerkleProof;
}

export interface LockMerkleProofFull {
  spend_condition: SpendCondition;
  axis: number;
  proof: MerkleProof;
}

export type LockMerkleProof =
  | LockMerkleProofStub
  | ({ version: "full" } & LockMerkleProofFull);

export interface Signature {
  c: string;
  s: string;
}

/** Wire: `[pkh_digest, [pubkey_base58, signature]][]` */
export type PkhSignature = [Digest, [string, Signature]][];

export interface Witness {
  lock_merkle_proof: LockMerkleProof;
  pkh_signature: PkhSignature;
  hax_map: ZMap<Digest, Noun>;
  tim: null;
}

export type SeedsV1 = SeedV1[];

export interface Spend1V1 {
  witness: Witness;
  seeds: SeedsV1;
  fee: Nicks;
}

export type SpendV1 =
  | { tag: 0; signature: unknown; seeds: SeedsV1; fee: Nicks }
  | ({ tag: 1 } & Spend1V1);

/** Wire: `[name, spend][]` */
export type SpendsV1 = [Name, SpendV1][];

export interface WitnessData {
  data: [Name, Witness][];
}

export interface LockMetadata {
  lock: Lock;
  include_data: boolean;
}

export type InputDisplay =
  | { inputs: ZMap<Name, unknown> }
  | { tag: 0; inputs: ZMap<Name, unknown> }
  | { tag: 1; inputs: ZMap<Name, SpendCondition> };

export interface TransactionDisplay {
  inputs: InputDisplay;
  outputs: ZMap<Digest, LockMetadata>;
}

export interface NockchainTx {
  version: Version;
  id: TxId;
  spends: SpendsV1;
  display: TransactionDisplay;
  witness_data: WitnessData;
}

export interface RawTxV1 {
  version: 1;
  id: TxId;
  spends: SpendsV1;
}

export interface TxEngineSettings {
  tx_engine_version: Version;
  tx_engine_patch: number;
  min_fee: Nicks;
  cost_per_word: Nicks;
  witness_word_div: number;
}

/** gRPC v2 raw transaction (wire format). */
export interface PbCom2RawTransaction {
  version?: { value: string };
  id: string;
  spends: PbCom2SpendEntry[];
}

export interface PbCom2SpendEntry {
  name?: { first: string; last: string; source?: unknown };
  spend?: PbCom2Spend | null;
}

export interface PbCom2Spend {
  spend_kind?: PbCom2SpendSpendKind;
}

export type PbCom2SpendSpendKind =
  | { Legacy: unknown }
  | { Witness: PbCom2WitnessSpend };

export interface PbCom2WitnessSpend {
  witness?: PbCom2Witness | null;
  seeds: PbCom2Seed[];
  fee?: { value: string };
}

export interface PbCom2Witness {
  lock_merkle_proof?: unknown;
  pkh_signature?: unknown;
  hax: PbCom2HaxPreimage[];
}

export interface PbCom2HaxPreimage {
  hash?: unknown;
  value: number[];
}

export interface PbCom2Seed {
  output_source?: unknown;
  lock_root: string;
  note_data?: unknown;
  gift?: { value: string };
  parent_hash: string;
}

export interface PbCom2Note {
  note_version?: { V1: PbCom2NoteV1 } | { Legacy: unknown };
}

export interface PbCom2NoteV1 {
  version?: { value: string };
  origin_page?: { value: string };
  name?: { first: string; last: string; source?: unknown };
  note_data?: unknown;
  assets?: { value: string };
}

export interface PbCom2Balance {
  notes: PbCom2BalanceEntry[];
  height?: { value: string };
  block_id: string;
  page?: { next_page_token: string };
}

export interface PbCom2BalanceEntry {
  name?: { first: string; last: string };
  note?: PbCom2Note | null;
}

/** LockInput tuple for simpleSpend: [lock, lock_sp_index]. */
export interface TxLock { lock: Lock; lock_sp_index: number }

/** Missing unlock primitives on a spend (wasm `MissingUnlocks`). */
export type MissingUnlocks =
  | { Pkh: { num_sigs: number; sig_of: Digest[] } }
  | { Hax: { preimages_for: Digest[] } }
  | "Brn"
  | { Sig: { num_sigs: number; sig_of: Uint8Array[] } };