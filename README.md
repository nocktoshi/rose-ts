# rose-ts

Pure TypeScript Nockchain wallet primitives — a curated drop-in for protocol-facing APIs in `@nockbox/iris-wasm`, without a WebAssembly runtime.

Use it in Node.js, browsers, React Native, Cloudflare Workers, or anywhere you want Nockchain cryptography and transaction semantics in plain TS.

**Parity bar:** 78 vitest tests compare implemented exports against `@nockbox/iris-wasm` as the oracle. See [roadmap.md](./roadmap.md) for coverage detail.

## Install

```bash
npm install @nockchain/rose-ts
```

---

## Wasm parity overview

| | `@nockchain/iris-wasm` | `@nockchain/rose-ts` |
|--|------------------------|----------------------|
| Surface | ~280 functions + 4 classes | Curated wallet / v1-tx subset |
| Runtime | Wasm init required | Plain TS / ESM |
| v0 tx construction | Supported | **Out of scope** (v0 decode in protobuf OK) |
| Noun codecs | `*FromNoun` / `*ToNoun` / `*Hash` per type | Selected hash helpers only |
| gRPC client | `GrpcClient` | `RpcClient` (+ deprecated `GrpcClient` alias) |
| SLIP-10 / signing | `PrivateKey`, `ExtendedKey` | ✅ parity (`PrivateKey`, `ExtendedKey`) |

---

## APIs only in rose-ts (not wasm)

These helpers exist in pure TS to cover wallet flows wasm does not export as standalone functions:

### Witness assembly (manual spends)

| API | Description |
|-----|-------------|
| `lockMerkleProofFromLock(lock, index)` | Merkle proof for spending `lock` at spend-condition index |
| `witnessNew(lock, index)` | Empty witness shell (`Witness::new`) |
| `witnessFromLock` | Alias of `witnessNew` |
| `witnessFromLockMerkleProof(lmp, pkhSigs?, haxMap?)` | Build witness from parts |
| `witnessClearSignatures(witness)` | Strip `pkh_signature` / `hax_map` |
| `witnessWithPkhSignature(witness, [pkh, [pubkeyB58, sig]])` | Immutable witness + PKH sig |
| `witnessWithHaxPreimage(witness, digest, noun)` | Immutable witness + hax preimage |
| `spendV1FromLock(lock, lockSpIndex, seeds, fee, unlocks?)` | One-shot witness spend constructor |

`SpendBuilder` extras for manual assembly:

| API | Description |
|-----|-------------|
| `SpendBuilder.newFromWitness(note, witness, refundLock?)` | Start a spend from a pre-built witness |
| `setWitness(witness)` | Replace witness (invalidates sigs) |
| `pushPkhSignature(pkh, pubkeyBase58, signature)` | Add/update a PKH unlock |
| `pushHaxPreimage(digest, preimageNoun)` | Add/update a hax unlock |

Wasm equivalent today: build witness in Rust via `SpendBuilder.new(note, lock, index)` only; no standalone witness helpers.

### HTLC / multisig spend helpers

| API | Description |
|-----|-------------|
| `htlcOrLock(hNock, buyerPkh, sellerPkh, refundHeight)` | OR(claim \| refund) lock tree |
| `htlcLockRootDigest(...)` | Digest of HTLC lock root |
| `multisigLock(m, pkhDigests)` | Single-leaf m-of-n PKH lock |
| `TxBuilder.simpleSpendWithLocks(notes, locks, lockSpIndices, …, options?)` | Explicit lock + index per note; optional `preimageJam` + `outputExtras` |
| `TxBuilder.simpleSpendHtlc(notes, locks, lockSpIndex, …, options?)` | HTLC: index `0` = claim (requires `preimageJam`), `1` = refund |
| `TxBuilder.simpleSpendMultisig(notes, locks, lockSpIndex, …, outputExtras?)` | Wrapper over `simpleSpendWithLocks` |

Wasm has only `TxBuilder.simpleSpend(notes, locks, recipient, gift, fee, refundPkh, includeLockData)` — no HTLC/multisig wrappers, no memo/blob on seeds.

### Note-data memo / blob ([nockchain#116](https://github.com/nockchain/nockchain/pull/116))

| API | Description |
|-----|-------------|
| `noteDataPushMemo(data, utf8)` | Push `%memo` (non-empty UTF-8) |
| `noteDataPushBlob(data, utf8)` | Push `%blob` (trimmed UTF-8; empty omits) |
| `decodePackedBlobUtf8(jamBytes)` | Decode packed belt jam → UTF-8 |
| `decodeNoteDataPackedUtf8(noun)` | Decode note-data entry value |
| `encodeBlobBelts(bytes)` | Length-prefixed LE u32 belt packing |

Encoding uses `vecToNoun` (proper list with trailing `0`), matching wallet / explorer jam. Decoder accepts both proper and improper lists.

### Transaction helpers

| API | Description |
|-----|-------------|
| `rawTxV1ToNockchainTx(raw)` | Inverse of `nockchainTxToRawTx` |
| `spendsV1ApplyWitness(spends, witnessData)` | Reattach witness payloads |
| `nockchainTxOutputs`, `rawTxV1Outputs` | Derive output notes from a tx |

### Crypto

| API | Description |
|-----|-------------|
| `PublicKey` class | `fromBeBytes`, `fromHex`, `toHex`, `verify(digest, sig)` |
| `publicKeyFromHex`, `publicKeyToHex`, `publicKeyVerify` | Functional wrappers |

Wasm exposes `PublicKey` as a type alias to `CheetahPoint` with free functions (`publicKeyFromHex`, …), not a TS class.

---

## Rose-ts extensions to wasm APIs

| Wasm API | Rose-ts difference |
|----------|-------------------|
| `TxBuilder.simpleSpend(...)` | **8th argument** `outputExtras?: { memo?, blob? }` on output seeds |
| `SpendBuilder.addPreimage` / `TxBuilder.addPreimage` | See [behavioral differences](#behavioral-differences-vs-wasm) below |
| `rawTxFromProtobuf` | Decodes **legacy (v0) spends** inside v1 raw txs (wasm path); rose-ts implements both witness and legacy branches |
| `GrpcClient` | Prefer `RpcClient` — same wire, clearer naming |

---

## Behavioral differences vs wasm

### Hax preimage hashing (`addPreimage`)

- **HTLC / wallet convention:** Hax preimages in lock trees use the **structural** hash-noun digest (`hashPreimage` / `hashStructuredNoun` / node “hax check”).
- **rose-ts `addPreimage`:** Cues jam, hashes with `hashNounStructural`, and only attaches when that digest appears in the spend condition’s hax preimage set.
- **wasm / Rust `SpendBuilder::add_preimage`:** Uses `preimage.hash()` (varlen / “whole” noun hash via Dyck + leaves).

For HTLC locks built with `hashPreimage(jam)` (as in `htlcOrLock`), **rose-ts correctly attaches claim preimages**. Wasm may not attach the same jam when the spend condition lists structural digests — claim spends built only in wasm should be validated before broadcast.

### Memo / blob note-data

- Keys and order on output seeds: `lock` → `blob` → `memo` (when `includeLockData` and extras are set).
- Packed blob/memo values: `[byte-len, …u32-le limbs…]` jammed as a proper list (`vecToNoun`).
- Empty memo throws; empty/whitespace blob is omitted.

### Multisig (`multisigLock`)

- Lock **construction** matches wasm (`pkhNew(m, hashes)` + `lockFromList`).
- **Local** `lockRootHash(multisigLock(...))` fails for `m > 1` until multi-element ZSet hashing is implemented in TS.
- Use wasm `lockRootHash` as oracle, or build spends via `simpleSpendMultisig` (witness path works for locks wasm can hash).

### V0 protocol

- `SpendBuilder.new` **rejects** v0 notes.
- v0 spend **decoding** from protobuf is supported; v0 spend **construction** is out of scope.

### Types / wire shapes

- `PkhSignature`: wire `[pkh, [pubkey_base58, {c,s}][]` (TS arrays); wasm typings use `ZMap` — values round-trip the same on the wire.
- `NoteData`: wire `[key, noun][]`; empty map is `[]`.

---

## Quick reference — transaction building

### Simple PKH spend with memo/blob

```typescript
import {
  TxBuilder,
  txEngineSettingsV1BythosDefault,
  nockchainTxToRawTx,
  rawTxToProtobuf,
} from "@nockchain/rose-ts";

const settings = txEngineSettingsV1BythosDefault();
const builder = new TxBuilder(settings);

builder.simpleSpend(
  [note],
  [{ lock, lock_sp_index: 0 }],
  recipientPkh,
  "1000000",
  null,       // auto fee
  myPkh,      // change
  true,       // include lock in note_data
  { memo: "hello", blob: "nns/v1/claim/example.nock" }
);

await builder.sign(privateKey);
const nockTx = builder.build();
const raw = nockchainTxToRawTx(nockTx);
```

### HTLC claim

```typescript
import { htlcOrLock, hashPreimage, TxBuilder } from "@nockchain/rose-ts";

const hNock = hashPreimage(preimageJam);
const lock = htlcOrLock(hNock, buyerPkh, sellerPkh, 1000n);

builder.simpleSpendHtlc(
  [note],
  [lock],
  0,              // claim branch
  recipientPkh,
  gift,
  null,
  buyerPkh,
  true,
  {
    preimageJam,
    outputExtras: { memo: "claim", blob: "payload" },
  }
);
```

### Manual witness spend

```typescript
import {
  spendV1FromLock,
  spendV1NewWitness,
  witnessWithHaxPreimage,
  witnessNew,
} from "@nockchain/rose-ts";

// Option A: one-shot
const spend = spendV1FromLock(lock, 0, seeds, fee, {
  haxMap: [[hNock, preimageNoun]],
});

// Option B: compose
let witness = witnessNew(lock, 0);
witness = witnessWithHaxPreimage(witness, hNock, preimageNoun);
const spend2 = spendV1NewWitness(witness, seeds, fee);

const sb = SpendBuilder.newFromWitness(note, witness, refundLock);
sb.seed(recipientSeed);
sb.fee(feePortion);
```

### Multisig lock (construction)

```typescript
import { multisigLock, lockRootHash } from "@nockchain/rose-ts";

const lock = multisigLock(2, [pkhA, pkhB, pkhC]);
// lock_sp_index is 0 for this single-leaf lock

builder.simpleSpendMultisig(
  [note],
  [lock],
  0,
  recipientPkh,
  gift,
  null,
  myPkh,
  false,
  { memo: "2-of-3" }
);
```

---

## Getting started (identity → lock → tx)

### Identity

```typescript
import { hashPublicKey, verifySignature, deriveMasterKeyFromMnemonic, PrivateKey } from "@nockchain/rose-ts";

const master = deriveMasterKeyFromMnemonic(mnemonic, "");
const pkh = hashPublicKey(master.publicKey);
const key = PrivateKey.fromBytes(master.privateKey);
```

### PKH lock

```typescript
import { pkhSingle, spendConditionNewPkh, lockFromList, lockRootHash } from "@nockchain/rose-ts";

const lock = lockFromList([spendConditionNewPkh(pkhSingle(pkh))]);
const lockRoot = lockRootHash(lock);
```

### Connect & submit

```typescript
import { RpcClient, noteFromProtobuf, rawTxToProtobuf } from "@nockchain/rose-ts";

const client = new RpcClient("http://localhost:8080");
const balance = await client.getBalanceByFirstName(pkh);
const note = noteFromProtobuf(balance.notes[0].note);

// ... build & sign ...

await client.sendTransaction(rawTxToProtobuf(raw));
```

---

## Exported API index (by module)

### Noun (`jam`, `cue`, `tas`, `tasBelts`, `atomToBelts`, `beltsToAtom`, `untas`)

### Crypto

`deriveMasterKey`, `deriveMasterKeyFromMnemonic`, `ExtendedKey`, `PrivateKey`, `PublicKey`, `hashPublicKey`, `signMessage`, `verifySignature`, `publicKeyFromBeBytes`, `publicKeyFromHex`, `publicKeyToHex`, `publicKeyVerify`

### Hash / locks / note-data

`hashPreimage`, `hashNoun`, `hashStructuredNoun`, `hashU64`, `pkhSingle`, `pkhNew`, `pkhHash`, `haxHash`, `haxHashPreimage`, `spendCondition*`, `lockFromList`, `lockFromListBurnpad`, `lockRootHash`, `lockHash`, `lockHeight`, `lockProve`, `noteDataEmpty`, `noteDataPushPkh`, `noteDataPushLock`, `noteDataPushMemo`, `noteDataPushBlob`, `decodeNoteDataPackedUtf8`, `decodePackedBlobUtf8`, `encodeBlobBelts`, `noteHash`, `nameV1`, `nameHash`, `hashName`, `hashSeedV1Digest`, `hashSeedsV1Digest`, `hashSpendV1SigHash`, `hashWitnessDigest`, `hashPkhSignatureDigest`, `hashSpendsV1`, `hashLockMerkleProofDigest`, `seedV1NewSinglePkh`

### Transaction

`TxBuilder`, `SpendBuilder`, `txEngineSettingsV1Default`, `txEngineSettingsV1BythosDefault`, `nockchainTxToRawTx`, `rawTxV1ToNockchainTx`, `rawTxV1New`, `rawTxV1Version`, `rawTxV1InputNames`, `rawTxV1InputSpendConditions`, `spendV1NewWitness`, `spendV1NewLegacy`, `spendV1SigHash`, `spendV1FromLock`, `witnessFromLock`, `witnessNew`, `lockMerkleProofFromLock`, `witnessFromLockMerkleProof`, `witnessClearSignatures`, `witnessWithPkhSignature`, `witnessWithHaxPreimage`, `multisigLock`, `htlcOrLock`, `htlcLockRootDigest`, `nockchainTxOutputs`, `rawTxV1Outputs`, `rawTxTotalFees`, `rawTxV1CalcId`, `spendV1Fee`, `spendV1TotalGifts`, `spendV1UnclampedFee`, `spendsV1Fee`, `spendsV1TotalFees`, `spendsV1TotalGifts`, `spendsV1UnclampedFee`, `spendsV1ApplyWitness`

Types: `OutputNoteData`, `SimpleSpendLockOptions`

### Protobuf (wire)

`noteFromProtobuf`, `noteToProtobuf`, `spendConditionFromProtobuf`, `spendConditionToProtobuf`, `digestFromProtobuf`, `digestToProtobuf`, `rawTxFromProtobuf`, `rawTxToProtobuf`

### RPC

`RpcClient` — `getBalanceByFirstName`, `getBalanceByAddress`, `sendTransaction`, `transactionAccepted`, …

---

## Hybrid setup with rose-wasm

Use wasm when you need an oracle or APIs not yet ported. Rose-ts can verify txs wasm builds:

```typescript
import init, { TxBuilder as WasmTxBuilder, rawTxFromProtobuf } from "@nockbox/iris-wasm";
import { TxBuilder, nockchainTxToRawTx, rawTxV1CalcId } from "@nockchain/rose-ts";

await init();

const wasmTx = new WasmTxBuilder(settings).build();
const tsTx = TxBuilder.fromNockchainTx(wasmTx, settings).build();
// For PKH paths: rawTxV1CalcId(nockchainTxToRawTx(wasmTx)) === rawTxV1CalcId(nockchainTxToRawTx(tsTx))
```

Migrate incrementally: keep wasm for exotic noun codecs; use rose-ts for bundler-friendly wallet code paths.

---

## Development

```bash
npm install
npm run build
npm test          # 78 parity tests (requires @nockbox/iris-wasm devDep)
npm run test:watch
```

## Related Projects

- [`@nockbox/iris-rs`](https://github.com/nockbox/iris-rs) — iris-rs
- [`@nockbox/iris-sdk`](https://github.com/nockbox/iris-sdk) — iris-sdk
- [`roadmap.md`](./roadmap.md) — coverage matrix and next steps
- [`@nockchain/rose-rs`](../../) — Rust workspace (protocol types, crypto, gRPC proto)

## License

MIT License

Copyright (c) 2026 nocktoshi <nocktoshi@nockchain.net>

Copyright (c) 2025 NockBox inc. <tech@nockbox.org>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
