Wasm exposes **~280 functions + 4 classes**; rose-ts exports a curated subset with vitest parity against `@nockchain/rose-wasm`. v0 protocol is **out of scope**.

**API reference & wasm differences:** see [README.md](./README.md) (rose-ts-only APIs, extensions, behavioral diffs).

## Done (wallet / HTLC / v1 tx path)

| Area | rose-ts | Parity tests |
|------|---------|--------------|
| Crypto (SLIP-10, sign/verify, `hashPublicKey`, `PublicKey` class) | ✅ | `crypto`, `slip10`, `tx-assembly` |
| V1 locks & hashes (`lockFromList`, `lockProve`, HTLC, burnpad) | ✅ | `lock`, `lock-api`, `golden-htlc`, `next-batch` |
| Lock / spend-condition helpers (`pkh*`, `hax*`, `spendCondition*`) | ✅ | `next-batch` |
| `TxBuilder` / `SpendBuilder` (build, fee, sign, memo/blob on seeds) | ✅ | `tx-builder`, `outputs-fee`, `tx-roundtrip`, `note-data` |
| Tx assembly (`spendV1NewWitness/Legacy`, `spendV1SigHash`, witness helpers, `spendV1FromLock`) | ✅ | `tx-assembly`, `witness-assembly` |
| HTLC / multisig `simpleSpendHtlc`, `simpleSpendMultisig`, `simpleSpendWithLocks` + memo/blob | ✅ | `simple-spend-variants` |
| Raw tx v1 (round-trip, outputs, fees, accessors) | ✅ | `raw-tx`, `tx-roundtrip`, `outputs-fee`, `next-batch` |
| Note-data (`noteDataPushPkh/Lock/Memo/Blob`, packed belt decode) | ✅ | `note-data` |
| Settings + protobuf (`txEngineSettings*`, `spendCondition*`, `digest*`) | ✅ | `next-batch`, `tx-roundtrip`, `grpc` |
| Protobuf raw tx decode (witness + legacy spends) | ✅ | `raw-tx`, `tx-roundtrip` |
| Hash/noun exports + gRPC `RpcClient` | ✅ | `hash-exports`, `hash`, `noun`, `grpc-client` |

**Current test bar:** 78/78 vitest parity tests, `npm run build` clean.

### Memo / blob on sends (PR #116)

Per [nockchain#116](https://github.com/nockchain/nockchain/pull/116): output seeds accept UTF-8 `memo` and `blob` in note-data using length-prefixed packed belts (`encode_blob_belts`). Use:

```typescript
TxBuilder.simpleSpend(notes, locks, recipient, gift, fee, refundPkh, includeLockData, {
  memo: "hello",
  blob: "nns/v1/claim/example",
});
```

Or compose manually: `noteDataPushMemo(noteDataPushBlob(noteDataPushLock(...), blob), memo)`.

HTLC claim with preimage + memo/blob:

```typescript
builder.simpleSpendHtlc(notes, htlcLocks, 0, recipient, gift, fee, refundPkh, true, {
  preimageJam: jamBytes,
  outputExtras: { memo: "hello", blob: "path/to/blob" },
});
```

---

## Next (lower priority, v1 / wallet)

| Wasm | Status |
|------|--------|
| Multi-element ZSet hashing (m-of-n multisig spend build) | partial — `multisigLock` works; witness prove needs ZSet |
| `noteDataPush` wasm oracle tests | N/A until wasm ships PR #116 helpers |

---

## Out of scope

### V0 protocol

All v0 note/spend/seed/raw-tx **construction** paths. `SpendBuilder.new` rejects v0 notes. Legacy **spend decode** inside v1 raw txs is supported.

### Blockchain / page / coinbase

`page*`, `blockchainConstantsMainnet`, `balanceFromNoun`, etc.

### Noun round-trip surface (~150 APIs)

Wasm `*FromNoun` / `*ToNoun` / `*Hash` for every struct — not exported.

### Wasm-only bootstrap

`initPanicHook`, wasm `init` / `initSync`, `ExtendedKey.free()`.