import type { Digest, Signature } from "../types.js";
import { digestFromBase58 } from "../core/digest.js";
import { G_ORDER, truncGOrder, U256 } from "../core/u256.js";
import { hashVarlen } from "../core/tip5/index.js";
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
} from "./cheetah.js";

export class PublicKey {
  private constructor(readonly point: CheetahPoint) {}

  static fromBeBytes(bytes: Uint8Array): PublicKey {
    if (bytes.length !== 97) throw new Error("Public key must be 97 bytes");
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
    return [...this.toBeBytes()].map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  toBase58(): string {
    return cheetahPointToBase58(this.point);
  }

  verify(digest: Digest, signature: Signature): boolean {
    const c = U256.fromLeHex(signature.c);
    const s = U256.fromLeHex(signature.s);
    if (c.eq(U256.ZERO) || !c.lt(G_ORDER) || s.eq(U256.ZERO) || !s.lt(G_ORDER)) {
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

export function publicKeyFromHex(hex: string): PublicKey | undefined {
  return PublicKey.fromHex(hex);
}

export function publicKeyToHex(pk: PublicKey): string {
  return pk.toHex();
}

export function publicKeyFromBeBytes(bytes: Uint8Array): PublicKey {
  return PublicKey.fromBeBytes(bytes);
}

export function publicKeyVerify(pk: PublicKey, digest: Digest, signature: Signature): boolean {
  return pk.verify(digest, signature);
}