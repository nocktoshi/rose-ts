/**
 * Remote-MPC signing of Nockchain (Cheetah Schnorr) transactions via NEAR
 * chain-signatures. An MPC network holds a Cheetah root key; for a `(predecessor,
 * path)` it controls the chainsig child address `childP = rootP + tweak·G`, and
 * signs transactions for that address without any party holding the child key.
 *
 * This builds on the curve primitives in this package — `PublicKey.deriveChild`,
 * `PrivateKey.deriveChild`, and `TxBuilder.signWith` — so any app can drive
 *  Nockchain transactions from a NEAR-MPC key.
 */
import {sha3_256} from '@noble/hashes/sha3.js';
import type {Digest, NockchainTx, Signature} from './types.js';
import {PrivateKey} from './crypto/privateKey.js';
import {PublicKey} from './crypto/publicKey.js';
import {hashPublicKey} from './crypto/index.js';
import {TxBuilder} from './tx/builder.js';

/**
 * Prefix from the NEAR-MPC contract's `derive_tweak` (`near-mpc-crypto-types`).
 * The tweak is SHA3-256 (NOT keccak) of `${prefix}${predecessor},${path}`.
 */
const TWEAK_DERIVATION_PREFIX = 'near-mpc-recovery v0.1.0 epsilon derivation:';

/** The 32-byte chainsig tweak for `(predecessor, path)`. */
export const deriveTweak = (predecessorId: string, path: string): Uint8Array =>
  sha3_256(
    new TextEncoder().encode(
      `${TWEAK_DERIVATION_PREFIX}${predecessorId},${path}`,
    ),
  );

export interface MpcAddress {
  /** Derived child public key (`rootP + tweak·G`). */
  publicKey: PublicKey;
  /** base58 PKH — the Nockchain address the MPC key controls for this path. */
  pkh: Digest;
}

/**
 * Derive the Nockchain address an MPC root key controls for `(predecessor, path)`.
 * Equivalent to what the MPC network's signatures verify against.
 */
export const deriveMpcAddress = (
  rootPublicKey: PublicKey | Uint8Array,
  predecessorId: string,
  path: string,
): MpcAddress => {
  const root =
    rootPublicKey instanceof PublicKey
      ? rootPublicKey
      : PublicKey.fromBeBytes(rootPublicKey);
  const publicKey = root.deriveChild(deriveTweak(predecessorId, path));
  return {publicKey, pkh: hashPublicKey(publicKey.toBeBytes())};
};

/** Source of Nockchain (Cheetah Schnorr) `{c, s}` signatures from an MPC root key. */
export interface MpcSigner {
  /** Derived child public key for `path` — the address this signer controls. */
  childPublicKey(path: string): Promise<PublicKey>;
  /**
   * Sign a Nockchain sig-hash `digest` under the child key for `path`; the
   * signature verifies against `childPublicKey(path)`.
   */
  sign(path: string, digest: Digest): Promise<Signature>;
}

/**
 * Single-key signer that derives the child key locally and signs. NOT threshold
 * MPC — for development, tests, and single-operator use. The network signer
 * ({@link ContractMpcSigner}) implements the same interface; the network derives
 * the child share internally.
 */
export class LocalMpcSigner implements MpcSigner {
  private readonly rootKey: PrivateKey;

  constructor(
    rootPrivateKeyBytes: Uint8Array,
    private readonly predecessorId: string,
  ) {
    this.rootKey = PrivateKey.fromBytes(rootPrivateKeyBytes);
  }

  async childPublicKey(path: string): Promise<PublicKey> {
    return PublicKey.fromBeBytes(this.rootKey.publicKey).deriveChild(
      deriveTweak(this.predecessorId, path),
    );
  }

  async sign(path: string, digest: Digest): Promise<Signature> {
    return this.rootKey
      .deriveChild(deriveTweak(this.predecessorId, path))
      .signDigest(digest);
  }
}

/**
 * Network signer: delegates to a `requestSignature` callback that performs the
 * NEAR MPC contract `sign` round-trip (Cheetah domain) and returns the 64-byte
 * `c‖s` from `SignatureResponse::Cheetah` (each scalar little-endian). The contract
 * transport + digest→payload encoding are injected, so this package stays free of
 * any NEAR dependency.
 */
export class ContractMpcSigner implements MpcSigner {
  constructor(
    private readonly rootPublicKeyBe: Uint8Array,
    private readonly predecessorId: string,
    private readonly requestSignature: (
      path: string,
      digest: Digest,
    ) => Promise<Uint8Array>,
  ) {}

  async childPublicKey(path: string): Promise<PublicKey> {
    return deriveMpcAddress(this.rootPublicKeyBe, this.predecessorId, path)
      .publicKey;
  }

  async sign(path: string, digest: Digest): Promise<Signature> {
    const sig = await this.requestSignature(path, digest);
    if (sig.length !== 64) {
      throw new Error(`Cheetah signature must be 64 bytes, got ${sig.length}`);
    }
    const hex = (b: Uint8Array): string =>
      [...b].map(x => x.toString(16).padStart(2, '0')).join('');
    // c‖s, each a 32-byte little-endian scalar; `Signature` carries LE hex.
    return {c: hex(sig.subarray(0, 32)), s: hex(sig.subarray(32, 64))};
  }
}

/**
 * Sign every spend of `builder` with an {@link MpcSigner}: derives the child
 * public key for `path`, then routes each spend's sig-hash digest through
 * `signWith`. Caller does `builder.build()`.
 */
export const signTxWithMpc = async (
  builder: TxBuilder,
  signer: MpcSigner,
  path: string,
): Promise<void> => {
  const childPublicKey = await signer.childPublicKey(path);
  await builder.signWith(childPublicKey.toBeBytes(), digest =>
    signer.sign(path, digest),
  );
};

/** Convenience: rebuild `tx`, sign it via the MPC signer, and return the signed tx. */
export const signNockchainTxWithMpc = async (
  tx: NockchainTx,
  signer: MpcSigner,
  path: string,
  settings: ConstructorParameters<typeof TxBuilder>[0],
): Promise<NockchainTx> => {
  const builder = TxBuilder.fromNockchainTx(tx, settings);
  await signTxWithMpc(builder, signer, path);
  return builder.build();
};
