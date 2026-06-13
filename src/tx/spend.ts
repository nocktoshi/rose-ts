import type { Nicks, Spend1V1, SpendV1, SeedsV1, Witness } from "../types.js";
import { digestFromBase58 } from "../core/digest.js";
import { hashNicks, hashToDigest, hashTuple } from "../core/hashable.js";
import { hashSpendV1SigHash, seedsV1SigHash } from "../hash/tx.js";
import type { Digest } from "../types.js";

export type LegacySignature = [string, { c: string; s: string }][];

export function spendV1NewWitness(witness: Witness, seeds: SeedsV1, fee: Nicks): SpendV1 {
  const spend: Spend1V1 = { witness, seeds, fee };
  return { tag: 1, ...spend };
}

export function spendV1NewLegacy(seeds: SeedsV1, fee: Nicks): SpendV1 {
  return { tag: 0, signature: [] as LegacySignature, seeds, fee };
}

/** `SpendV1::sig_hash` — seeds sig-hash tuple with fee (differs from signing `hashSpendV1SigHash` only by name on S1). */
export function spendV1SigHash(spend: SpendV1): Digest {
  if (spend.tag === 1) {
    return hashSpendV1SigHash(spend);
  }
  return hashToDigest(
    hashTuple(digestFromBase58(seedsV1SigHash(spend.seeds)), hashNicks(spend.fee))
  );
}