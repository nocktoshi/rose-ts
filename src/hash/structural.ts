import { hashFixed, hashVarlen } from "../core/tip5/index.js";
import { digestFromBelts, digestToBase58 } from "../core/digest.js";
import type { NounTree } from "../noun/types.js";

function structuralDigestBelts(noun: NounTree): bigint[] {
  if (noun.tag === "atom") {
    const v = noun.value.tryIntoU64();
    if (v === null) throw new Error("atom too large for structural hash");
    return hashVarlen([1n, v]);
  }
  const l = structuralDigestBelts(noun.head);
  const r = structuralDigestBelts(noun.tail);
  return hashFixed([...l, ...r]);
}

export function hashNounStructural(noun: NounTree): string {
  return digestToBase58(digestFromBelts(structuralDigestBelts(noun)));
}

export function hashNounWholeBelts(noun: NounTree): bigint[] {
  const leaves: bigint[] = [];
  const dyck: bigint[] = [];

  function visit(n: NounTree): void {
    if (n.tag === "atom") {
      const v = n.value.tryIntoU64();
      if (v === null) throw new Error("atom too large");
      leaves.push(v);
    } else {
      dyck.push(0n);
      visit(n.head);
      dyck.push(1n);
      visit(n.tail);
    }
  }

  visit(noun);
  const combined = [BigInt(leaves.length), ...leaves, ...dyck];
  return hashVarlen(combined);
}

export function hashNounWhole(noun: NounTree): string {
  return digestToBase58(digestFromBelts(hashNounWholeBelts(noun)));
}