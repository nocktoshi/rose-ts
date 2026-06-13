import { hmac } from "@noble/hashes/hmac.js";
import { sha512 } from "@noble/hashes/sha2.js";
import { mnemonicToSeedSync } from "@scure/bip39";
import { U256, G_ORDER } from "../core/u256.js";
import {
  A_GEN,
  chAdd,
  chScalBig,
  publicKeyFromBeBytes,
  publicKeyToBeBytes,
  publicKeyToSlip10Bytes,
  type CheetahPoint,
} from "./cheetah.js";

const DOMAIN_SEPARATOR = new TextEncoder().encode("Nockchain seed");

function hmacSha512(key: Uint8Array, data: Uint8Array): Uint8Array {
  return hmac(sha512, key, data);
}

function scalarFromPrivateBytes(bytes: Uint8Array): U256 {
  return U256.fromBeBytes(bytes);
}

function publicKeyFromScalar(scalar: U256): CheetahPoint {
  const pt = chScalBig(scalar, A_GEN);
  if (!pt) throw new Error("invalid private key scalar");
  return pt;
}

function indexBytes(index: number): Uint8Array {
  const out = new Uint8Array(4);
  new DataView(out.buffer).setUint32(0, index >>> 0, false);
  return out;
}

export class ExtendedKey {
  constructor(
    readonly privateKey: Uint8Array | null,
    readonly publicKey: Uint8Array,
    readonly chainCode: Uint8Array
  ) {}

  deriveChild(index: number): ExtendedKey {
    const hardened = (index >>> 0) >= 0x8000_0000;
    const idx = indexBytes(index);

    const initialData = (): Uint8Array => {
      if (hardened) {
        if (!this.privateKey) {
          throw new Error("Cannot derive hardened child without private key");
        }
        const data = new Uint8Array(1 + 32 + 4);
        data[0] = 0x00;
        data.set(this.privateKey, 1);
        data.set(idx, 33);
        return data;
      }
      const data = new Uint8Array(1 + 96 + 4);
      data[0] = 0x01;
      data.set(publicKeyToSlip10Bytes(publicKeyFromBeBytes(this.publicKey)), 1);
      data.set(idx, 97);
      return data;
    };

    const init = initialData();
    let result = hmacSha512(this.chainCode, init);

    for (;;) {
      const left = U256.fromBeBytes(result.slice(0, 32));
      const chainCode = result.slice(32, 64);

      if (left.lt(G_ORDER) && !left.eq(U256.ZERO)) {
        if (this.privateKey) {
          const parent = scalarFromPrivateBytes(this.privateKey);
          const s = left.addMod(parent, G_ORDER);
          if (!s.eq(U256.ZERO)) {
            const priv = s.toBeBytes();
            const pub = publicKeyToBeBytes(publicKeyFromScalar(s));
            return new ExtendedKey(priv, pub, chainCode);
          }
        } else {
          const leftPoint = chScalBig(left, A_GEN);
          if (leftPoint) {
            const parent = publicKeyFromBeBytes(this.publicKey);
            const child = chAdd(leftPoint, parent);
            if (child && !child.inf) {
              return new ExtendedKey(null, publicKeyToBeBytes(child), chainCode);
            }
          }
        }
      }

      const retry = new Uint8Array(1 + 32 + 4);
      retry[0] = 0x01;
      retry.set(chainCode, 1);
      retry.set(idx, 33);
      result = hmacSha512(this.chainCode, retry);
    }
  }
}

export function deriveMasterKey(seed: Uint8Array): ExtendedKey {
  let result = hmacSha512(DOMAIN_SEPARATOR, seed);

  for (;;) {
    const s = U256.fromBeBytes(result.subarray(0, 32));
    const chainCode = result.slice(32, 64);
    if (s.lt(G_ORDER) && !s.eq(U256.ZERO)) {
      const priv = s.toBeBytes();
      const pub = publicKeyToBeBytes(publicKeyFromScalar(s));
      return new ExtendedKey(priv, pub, chainCode);
    }
    result = hmacSha512(DOMAIN_SEPARATOR, result.subarray(0, 64));
  }
}

export function deriveMasterKeyFromMnemonic(
  mnemonic: string,
  passphrase?: string | null
): ExtendedKey {
  const seed = mnemonicToSeedSync(mnemonic, passphrase ?? "");
  return deriveMasterKey(seed);
}