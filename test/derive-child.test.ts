import {describe, it, expect} from 'vitest';
import {PublicKey} from '../src/crypto/publicKey.js';
import {A_GEN, chScalBig, publicKeyToBeBytes} from '../src/crypto/cheetah.js';
import {U256, G_ORDER} from '../src/core/u256.js';

/**
 * chainsig child-key derivation used by the NEAR-MPC Nockchain adapter. The MPC
 * nodes sign with `rootKey` tweaked by `tweak = sha3_256(prefix + predecessor +
 * "," + path)` (see the contract's `derive_tweak`), interpreting `tweak` exactly
 * as the Rust `tweak_scalar` does: little-endian, reduced mod the group order.
 * The client must derive the SAME `childP = rootP + tweak·G` so the address it
 * shows is the one the MPC signature is valid for.
 */
describe('PublicKey.deriveChild (chainsig child-key derivation)', () => {
  it('childP = rootP + tweak·G equals (x + tweak)·G with an LE-mod-n tweak', () => {
    // A small, valid root scalar x (< group order), big-endian.
    const xBe = new Uint8Array(32);
    xBe.set([0x12, 0x34, 0x56, 0x78], 28);
    const x = U256.fromBeBytes(xBe);
    const rootPoint = chScalBig(x, A_GEN);
    if (!rootPoint) throw new Error('rootPoint');
    const root = PublicKey.fromBeBytes(publicKeyToBeBytes(rootPoint));

    const tweakBytes = new Uint8Array(32).fill(0x9a);
    const tweak = U256.fromLeBytes(tweakBytes).addMod(U256.ZERO, G_ORDER);
    const childX = x.addMod(tweak, G_ORDER);
    const expectedChild = chScalBig(childX, A_GEN);
    if (!expectedChild) throw new Error('expectedChild');

    const derived = root.deriveChild(tweakBytes);
    expect([...derived.toBeBytes()]).toEqual([
      ...publicKeyToBeBytes(expectedChild),
    ]);
  });

  it('a different path/tweak yields a different child key', () => {
    const root = PublicKey.fromBeBytes(
      publicKeyToBeBytes(chScalBig(U256.fromU64(99n), A_GEN)!),
    );
    const a = root.deriveChild(new Uint8Array(32).fill(1)).toBase58();
    const b = root.deriveChild(new Uint8Array(32).fill(2)).toBase58();
    expect(a).not.toBe(b);
  });
});
