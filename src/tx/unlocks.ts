import type { Digest, MissingUnlocks, Spend1V1, SpendCondition, SpendV1, TxEngineSettings } from "../types.js";

function spendConditionPkh(sc: SpendCondition) {
  return sc.filter((p) => p.tag === "pkh");
}

function spendConditionHax(sc: SpendCondition) {
  return sc.filter((p) => p.tag === "hax");
}

function spendConditionBrn(sc: SpendCondition): boolean {
  return sc.some((p) => p.tag === "brn");
}

/** rose-nockchain-types `SpendBuilder::missing_unlocks`. */
export function computeMissingUnlocks(spend: SpendV1): MissingUnlocks[] {
  if (spend.tag !== 1) return [];
  const s = spend as Spend1V1;
  const missing: MissingUnlocks[] = [];
  const presentSigs = new Set(
    (Array.isArray(s.witness.pkh_signature) ? s.witness.pkh_signature : []).map(([pkh]) => pkh)
  );
  const sc = s.witness.lock_merkle_proof.spend_condition;

  for (const p of spendConditionPkh(sc)) {
    const hashes = Array.isArray(p.hashes) ? (p.hashes as Digest[]) : [];
    const checked = hashes.filter((h) => presentSigs.has(h));
    if (checked.length < p.m) {
      const sigOf = hashes.filter((h) => !presentSigs.has(h));
      missing.push({ Pkh: { num_sigs: p.m - checked.length, sig_of: sigOf } });
    }
  }

  for (const h of spendConditionHax(sc)) {
    const valid = new Set(Array.isArray(h.preimages) ? (h.preimages as Digest[]) : []);
    const current = new Set(
      (Array.isArray(s.witness.hax_map) ? s.witness.hax_map : []).map(([digest]) => digest)
    );
    const preimagesFor = [...valid].filter((d) => !current.has(d));
    if (preimagesFor.length > 0) {
      missing.push({ Hax: { preimages_for: preimagesFor } });
    }
  }

  if (spendConditionBrn(sc)) {
    missing.push("Brn");
  }

  return missing;
}

/** rose-nockchain-types `SpendBuilder::missing_unlocks_fee`. */
export function missingUnlocksFee(spend: SpendV1, settings: TxEngineSettings): bigint {
  let fee = 0n;
  for (const mu of computeMissingUnlocks(spend)) {
    if (typeof mu === "object" && "Pkh" in mu) {
      fee +=
        (BigInt(settings.cost_per_word) * 35n * BigInt(mu.Pkh.num_sigs)) /
        BigInt(settings.witness_word_div);
    }
  }
  return fee;
}