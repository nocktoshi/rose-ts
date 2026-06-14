import type {Digest, Signature} from '../types.js';
import {mustAt} from '../core/must.js';
import {beltsFromBytes} from '../core/belt.js';
import {digestFromBase58} from '../core/digest.js';
import {hashVarlen} from '../core/tip5/index.js';
import {G_ORDER, truncGOrder, U256} from '../core/u256.js';
import {vecToNoun} from '../noun/belts.js';
import {hashNounWholeBelts} from '../hash/structural.js';
import {
  A_GEN,
  chScalBig,
  publicKeyToBeBytes,
  type CheetahPoint,
} from './cheetah.js';

const leBytesToBelts = (bytes: Uint8Array): bigint[] => {
  const belts: bigint[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, Math.min(i + 4, bytes.length));
    let v = 0n;
    for (let j = 0; j < chunk.length; j++) {
      v |= BigInt(mustAt(chunk, j)) << BigInt(j * 8);
    }
    belts.push(v);
  }
  return belts;
};

const u256ToLeHex = (v: U256): string =>
  [...v.toLeBytes()].map(b => b.toString(16).padStart(2, '0')).join('');

const nonceFor = (
  scalar: U256,
  pubkey: CheetahPoint,
  mBelts: bigint[],
): U256 => {
  const transcript: bigint[] = [
    ...pubkey.x,
    ...pubkey.y,
    ...mBelts,
    ...leBytesToBelts(scalar.toLeBytes()),
  ];
  return truncGOrder(hashVarlen(transcript));
};

const signMulti = (
  scalar: U256,
  mBelts: bigint[],
  sharedNonce: U256,
  combinedPubkey: CheetahPoint,
): Signature => {
  const scalarPt = chScalBig(sharedNonce, A_GEN);
  if (!scalarPt) throw new Error('invalid nonce scalar');

  const chal = truncGOrder(
    hashVarlen([
      ...scalarPt.x,
      ...scalarPt.y,
      ...combinedPubkey.x,
      ...combinedPubkey.y,
      ...mBelts,
    ]),
  );

  const nonce = nonceFor(scalar, combinedPubkey, mBelts);
  const chalMul = chal.mulMod(scalar, G_ORDER);
  const s = nonce.addMod(chalMul, G_ORDER);

  return {c: u256ToLeHex(chal), s: u256ToLeHex(s)};
};

export class PrivateKey {
  private readonly scalar: U256;

  constructor(signingKeyBytes: Uint8Array) {
    if (signingKeyBytes.length !== 32) {
      throw new Error('Private key must be 32 bytes');
    }
    this.scalar = U256.fromBeBytes(signingKeyBytes);
  }

  static fromBytes(signingKeyBytes: Uint8Array): PrivateKey {
    return new PrivateKey(signingKeyBytes);
  }

  get publicKey(): Uint8Array {
    const pt = this.publicKeyPoint();
    return publicKeyToBeBytes(pt);
  }

  signDigest(digest: Digest): Signature {
    const pubkey = this.publicKeyPoint();
    const mBelts = [...digestFromBase58(digest)];
    const nonce = nonceFor(this.scalar, pubkey, mBelts);
    return signMulti(this.scalar, mBelts, nonce, pubkey);
  }

  private publicKeyPoint(): CheetahPoint {
    const pt = chScalBig(this.scalar, A_GEN);
    if (!pt) throw new Error('invalid private key');
    return pt;
  }
}

export const signMessage = (
  privateKeyBytes: Uint8Array,
  message: string,
): Signature => {
  const belts = beltsFromBytes(new TextEncoder().encode(message));
  const noun = vecToNoun(belts);
  const digest = hashNounWholeBelts(noun);
  const scalar = U256.fromBeBytes(privateKeyBytes);
  const pubkeyPt = chScalBig(scalar, A_GEN);
  if (!pubkeyPt) throw new Error('invalid private key');
  const nonce = nonceFor(scalar, pubkeyPt, digest);
  return signMulti(scalar, digest, nonce, pubkeyPt);
};
