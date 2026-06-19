import type {Digest, Signature} from '../types.js';
import {digestFromBase58} from '../core/digest.js';
import {G_ORDER, truncGOrder, U256} from '../core/u256.js';
import {hashVarlen} from '../core/tip5/index.js';
import {
  A_GEN,
  chAdd,
  chNeg,
  chScalBig,
  cheetahPointFromBase58,
  cheetahPointToBase58,
  publicKeyFromBeBytes as pointFromBeBytes,
  publicKeyToBeBytes,
  type CheetahPoint,
} from './cheetah.js';

export class PublicKey {
  private constructor(readonly point: CheetahPoint) {}

  static fromBeBytes(bytes: Uint8Array): PublicKey {
    if (bytes.length !== 97) throw new Error('Public key must be 97 bytes');
    return new PublicKey(pointFromBeBytes(bytes));
  }

  static fromHex(hex: string): PublicKey | undefined {
    if (hex.length !== 194) return undefined;
    const bytes = new Uint8Array(97);
    for (let i = 0; i < 97; i++) {
      const byteHex = hex.slice(i * 2, i * 2 + 2);
      const v = parseInt(byteHex, 16);
      if (Number.isNaN(v)) return undefined;
      bytes[i] = v;
    }
    return new PublicKey(pointFromBeBytes(bytes));
  }

  /** Wasm wire `PublicKey` is base58 CheetahPoint. */
  static fromBase58(b58: string): PublicKey {
    return new PublicKey(cheetahPointFromBase58(b58));
  }

  toBeBytes(): Uint8Array {
    return publicKeyToBeBytes(this.point);
  }

  toHex(): string {
    return [...this.toBeBytes()]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  toBase58(): string {
    return cheetahPointToBase58(this.point);
  }

  /**
   * Derive a chainsig-style child public key: `childP = rootP + tweak·G`, where
   * `tweakLeBytes` (32 bytes) is interpreted little-endian and reduced mod the
   * group order — the exact mapping the NEAR-MPC contract's `derive_tweak` and
   * the Rust `tweak_scalar` use. This is the per-(predecessor, path) Nockchain
   * key an MPC root key controls; `hashPublicKey(childP.toBeBytes())` is its PKH.
   */
  deriveChild(tweakLeBytes: Uint8Array): PublicKey {
    const tweak = U256.fromLeBytes(tweakLeBytes).addMod(U256.ZERO, G_ORDER);
    const tweakG = chScalBig(tweak, A_GEN);
    if (!tweakG) throw new Error('deriveChild: scalar multiplication failed');
    const childPoint = chAdd(this.point, tweakG);
    if (!childPoint) throw new Error('deriveChild: point addition failed');
    return new PublicKey(childPoint);
  }

  verify(digest: Digest, signature: Signature): boolean {
    const c = U256.fromLeHex(signature.c);
    const s = U256.fromLeHex(signature.s);
    if (
      c.eq(U256.ZERO) ||
      !c.lt(G_ORDER) ||
      s.eq(U256.ZERO) ||
      !s.lt(G_ORDER)
    ) {
      return false;
    }

    const sg = chScalBig(s, A_GEN);
    if (!sg) return false;
    const cPk = chScalBig(c, this.point);
    if (!cPk) return false;
    const scalar = chAdd(sg, chNeg(cPk));
    if (!scalar) return false;

    const mBelts = [...digestFromBase58(digest)];
    const transcript: bigint[] = [
      ...scalar.x,
      ...scalar.y,
      ...this.point.x,
      ...this.point.y,
      ...mBelts,
    ];
    const chal = truncGOrder(hashVarlen(transcript));
    return chal.eq(c);
  }
}

export const publicKeyFromHex = (hex: string): PublicKey | undefined =>
  PublicKey.fromHex(hex);

export const publicKeyToHex = (pk: PublicKey): string => pk.toHex();

export const publicKeyFromBeBytes = (bytes: Uint8Array): PublicKey =>
  PublicKey.fromBeBytes(bytes);

export const publicKeyVerify = (
  pk: PublicKey,
  digest: Digest,
  signature: Signature,
): boolean => pk.verify(digest, signature);
