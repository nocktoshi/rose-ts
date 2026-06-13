import type { Name, NockchainTx, SpendV1, SpendsV1, Witness, WitnessData } from "../types.js";

export function nameKey(name: Name): string {
  return `${name.first}:${name.last}:${name._sig ?? 0}`;
}

function cloneWitness(w: Witness): Witness {
  return {
    lock_merkle_proof: w.lock_merkle_proof,
    pkh_signature: Array.isArray(w.pkh_signature) ? [...w.pkh_signature] : [],
    hax_map: Array.isArray(w.hax_map) ? [...w.hax_map] : [],
    tim: w.tim ?? null,
  };
}

function stripWitness(w: Witness): Witness {
  return {
    lock_merkle_proof: w.lock_merkle_proof,
    pkh_signature: [],
    hax_map: [],
    tim: null,
  };
}

/** Split full witness spends into stripped spends + witness_data (rose-nockchain-types). */
export function splitWitness(spends: SpendsV1): { spends: SpendsV1; witnessData: WitnessData } {
  const outSpends: SpendsV1 = [];
  const data: [Name, Witness][] = [];

  for (const [name, spend] of spends) {
    if (spend.tag !== 1) {
      outSpends.push([name, spend]);
      continue;
    }
    const witness = cloneWitness(spend.witness);
    outSpends.push([name, { ...spend, witness: stripWitness(witness) }]);
    data.push([name, witness]);
  }

  return { spends: outSpends, witnessData: { data } };
}

export function applyWitness(
  spends: SpendsV1,
  witnessData: NockchainTx["witness_data"]
): SpendsV1 {
  const witnessByName = new Map<string, Witness>();
  for (const [name, witness] of witnessData.data) {
    witnessByName.set(nameKey(name), witness);
  }

  return spends.map(([name, spend]) => {
    if (spend.tag !== 1) return [name, spend] as [Name, SpendV1];
    const witness = witnessByName.get(nameKey(name));
    if (!witness) return [name, spend] as [Name, SpendV1];
    return [name, { ...spend, witness: cloneWitness(witness) }] as [Name, SpendV1];
  });
}