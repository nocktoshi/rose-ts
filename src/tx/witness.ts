import { proveHashableLock } from "../core/merkle.js";
import { lockHeight, lockSpendCondition } from "../core/lock.js";
import { toWire, type NounTree } from "../noun/types.js";
import type {
  Digest,
  Lock,
  LockMerkleProof,
  Noun,
  Nicks,
  PkhSignature,
  SeedsV1,
  Signature,
  SpendCondition,
  SpendV1,
  Witness,
} from "../types.js";
import { spendV1NewWitness } from "./spend.js";

const AXIS_MOLD_HASH =
  "6mhCSwJQDvbkbiPAUNjetJtVoo1VLtEhmEYoU4hmdGd6ep1F6ayaV4A" as Digest;

/** Build a lock merkle proof for spending `lock` at spend-condition index `index`. */
export function lockMerkleProofFromLock(lock: Lock, index: number): LockMerkleProof {
  const spendCondition = lockSpendCondition(lock, index);
  const leafNumber = lockHeight(lock) === 1 ? index : index + 1;
  const { proof, axis } = proveHashableLock(lock, leafNumber);

  if (axis === 1n && proof.path.length === 0) {
    return {
      spend_condition: spendCondition,
      axis: 1,
      proof,
    };
  }
  return {
    version: "full",
    spend_condition: spendCondition,
    axis: Number(axis),
    proof,
  };
}

/** Empty witness shell with only a lock merkle proof (rose-nockchain-types `Witness::new`). */
export function witnessNew(lock: Lock, index: number): Witness {
  return witnessFromLockMerkleProof(lockMerkleProofFromLock(lock, index));
}

/** Alias for `witnessNew`. */
export function witnessFromLock(lock: Lock, index: number): Witness {
  return witnessNew(lock, index);
}

export function witnessFromLockMerkleProof(
  lockMerkleProof: LockMerkleProof,
  pkhSignature: PkhSignature = [],
  haxMap: [Digest, Noun][] = []
): Witness {
  void AXIS_MOLD_HASH;
  return {
    lock_merkle_proof: lockMerkleProof,
    pkh_signature: [...pkhSignature],
    hax_map: [...haxMap],
    tim: null,
  };
}

export function witnessClearSignatures(witness: Witness): Witness {
  return {
    ...witness,
    pkh_signature: [],
    hax_map: [],
  };
}

export function witnessWithPkhSignature(
  witness: Witness,
  entry: [Digest, [string, Signature]]
): Witness {
  const pkh = entry[0];
  const sigs = [...witness.pkh_signature];
  const idx = sigs.findIndex(([h]) => h === pkh);
  if (idx >= 0) sigs[idx] = entry;
  else sigs.push(entry);
  return { ...witness, pkh_signature: sigs };
}

function haxPreimageToWire(noun: Noun): Noun {
  if (typeof noun === "string" || Array.isArray(noun)) return noun;
  if (noun && typeof noun === "object" && "tag" in noun) {
    return toWire(noun as NounTree);
  }
  return noun;
}

export function witnessWithHaxPreimage(
  witness: Witness,
  digest: Digest,
  preimageNoun: Noun
): Witness {
  const wire = haxPreimageToWire(preimageNoun);
  const hax = [...witness.hax_map];
  const idx = hax.findIndex(([d]) => d === digest);
  if (idx >= 0) hax[idx] = [digest, wire];
  else hax.push([digest, wire]);
  return { ...witness, hax_map: hax };
}

/** Assemble a witness spend from lock + optional unlock data. */
export function spendV1FromLock(
  lock: Lock,
  lockSpIndex: number,
  seeds: SeedsV1,
  fee: Nicks,
  unlocks?: {
    pkhSignatures?: PkhSignature;
    haxMap?: [Digest, Noun][];
  }
): SpendV1 {
  let witness = witnessNew(lock, lockSpIndex);
  if (unlocks?.pkhSignatures) {
    for (const entry of unlocks.pkhSignatures) {
      witness = witnessWithPkhSignature(witness, entry);
    }
  }
  if (unlocks?.haxMap) {
    for (const [digest, noun] of unlocks.haxMap) {
      witness = witnessWithHaxPreimage(witness, digest, noun);
    }
  }
  return spendV1NewWitness(witness, seeds, fee);
}

export function spendConditionFromWitness(w: Witness): SpendCondition {
  return w.lock_merkle_proof.spend_condition;
}