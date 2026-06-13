import { describe, it, expect } from "vitest";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectParity } from "../helpers/parity.js";
import { HAX_PREIMAGE_JAM, HAX_PREIMAGE_DIGEST } from "../fixtures/hax.js";

/** Golden vectors from atomic-nock/src/__snapshots__/rose.test.ts.snap */
const GOLDEN = {
  hashPreimageDigest: HAX_PREIMAGE_DIGEST,
  buyerPkh: "ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ",
  sellerPkh: "gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp",
  htlcLockRoot: "9unhsEogr7AtzuTg8smkbpdkJjwgu6ZzSe5n57LYCRww6qtSHhwFzYM",
  refundHeight: 1000,
} as const;

describe("parity: golden HTLC vectors (atomic-nock rose.test.ts)", () => {
  it("hashPreimage on golden hax jam", async () => {
    const wasm = await getWasm();
    const wasmDigest = wasm.hashPreimage(HAX_PREIMAGE_JAM);
    const tsDigest = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    expectParity("hashPreimage", wasmDigest, tsDigest);
    expect(tsDigest).toBe(GOLDEN.hashPreimageDigest);
  });

  it("hashPublicKey on all-zero / all-one 97-byte keys", async () => {
    const wasm = await getWasm();
    const zero97 = new Uint8Array(97).fill(0);
    const one97 = new Uint8Array(97).fill(1);
    const wasmZero = wasm.hashPublicKey(zero97);
    const wasmOne = wasm.hashPublicKey(one97);
    const tsZero = RoseTs.hashPublicKey(zero97);
    const tsOne = RoseTs.hashPublicKey(one97);
    expectParity("hashPublicKey zero97", wasmZero, tsZero);
    expectParity("hashPublicKey one97", wasmOne, tsOne);
    expect(tsZero).toBe(GOLDEN.buyerPkh);
    expect(tsOne).toBe(GOLDEN.sellerPkh);
  });

  it("htlcLockRootDigest at refundHeight 1000", async () => {
    const wasm = await getWasm();
    const hNock = RoseTs.hashPreimage(HAX_PREIMAGE_JAM);
    const buyerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(0));
    const sellerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(1));
    const refundHeight = BigInt(GOLDEN.refundHeight);

    const wasmLock = wasm.lockFromList([
      [
        ...wasm.spendConditionNewPkh(wasm.pkhSingle(buyerPkh)),
        { tag: "hax", preimages: [hNock] },
      ],
      [
        ...wasm.spendConditionNewPkh(wasm.pkhSingle(sellerPkh)),
        {
          tag: "tim",
          rel: { min: null, max: null },
          abs: { min: Number(refundHeight), max: null },
        },
      ],
    ]);
    const wasmRoot = wasm.lockRootHash(wasmLock);
    const tsRoot = RoseTs.htlcLockRootDigest(hNock, buyerPkh, sellerPkh, refundHeight);

    expectParity("htlcLockRootDigest", wasmRoot, tsRoot);
    expect(tsRoot).toBe(GOLDEN.htlcLockRoot);
  });

  it("matches atomic-nock snapshot shape for rose-ts fields", async () => {
    const jam = HAX_PREIMAGE_JAM;
    const hNock = RoseTs.hashPreimage(jam);
    const buyerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(0));
    const sellerPkh = RoseTs.hashPublicKey(new Uint8Array(97).fill(1));
    const lockRoot = RoseTs.htlcLockRootDigest(hNock, buyerPkh, sellerPkh, 1000n);

    expect({
      hashPreimage: { jam: [...jam], digest: hNock },
      hashPublicKey: { zero97: buyerPkh, one97: sellerPkh },
      htlcLockRoot: { hNock, buyerPkh, sellerPkh, refundHeight: 1000, lockRoot },
    }).toEqual({
      hashPreimage: {
        jam: [...HAX_PREIMAGE_JAM],
        digest: GOLDEN.hashPreimageDigest,
      },
      hashPublicKey: {
        zero97: GOLDEN.buyerPkh,
        one97: GOLDEN.sellerPkh,
      },
      htlcLockRoot: {
        hNock: GOLDEN.hashPreimageDigest,
        buyerPkh: GOLDEN.buyerPkh,
        sellerPkh: GOLDEN.sellerPkh,
        refundHeight: GOLDEN.refundHeight,
        lockRoot: GOLDEN.htlcLockRoot,
      },
    });
  });
});