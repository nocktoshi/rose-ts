import {mustAt} from '../core/must.js';
import type {
  Digest,
  LockPrimitive,
  LockMerkleProof,
  MerkleProof,
  Name,
  NoteData,
  PbCom2RawTransaction,
  PbCom2SpendEntry,
  PkhSignature,
  RawTxV1,
  SeedV1,
  Signature,
  Spend1V1,
  SpendV1,
  SpendCondition,
} from '../types.js';
import {cheetahPointFromBase58} from '../crypto/cheetah.js';
import {U256} from '../core/u256.js';
import {lockRootHash} from '../hash/index.js';
import {tasU64} from '../noun/belts.js';
import {jam} from '../noun/index.js';

export {noteFromProtobuf, noteToProtobuf} from './note.js';
export {spendConditionFromProtobuf} from './decode.js';
export {digestFromProtobuf, digestToProtobuf} from './digest.js';
export type {PbCom1Hash} from './digest.js';
export {rawTxFromProtobuf} from './rawTx.js';

const sixBelt = (f6: bigint[]): Record<string, {value: string}> => ({
  belt_1: {value: String(mustAt(f6, 0))},
  belt_2: {value: String(mustAt(f6, 1))},
  belt_3: {value: String(mustAt(f6, 2))},
  belt_4: {value: String(mustAt(f6, 3))},
  belt_5: {value: String(mustAt(f6, 4))},
  belt_6: {value: String(mustAt(f6, 5))},
});

const schnorrFromSignature = (sig: Signature): Record<string, unknown> => {
  const c = beltsFromLeBytes(U256.fromLeHex(sig.c).toLeBytes());
  const s = beltsFromLeBytes(U256.fromLeHex(sig.s).toLeBytes());
  const chal: Record<string, {value: string}> = {};
  const sigVal: Record<string, {value: string}> = {};
  for (let i = 0; i < 8; i++) {
    chal[`belt_${i + 1}`] = {value: String(c[i] ?? 0n)};
    sigVal[`belt_${i + 1}`] = {value: String(s[i] ?? 0n)};
  }
  return {chal, sig: sigVal};
};

const beltsFromLeBytes = (bytes: Uint8Array): bigint[] => {
  const belts: bigint[] = [];
  for (let i = 0; i < bytes.length; i += 4) {
    const chunk = bytes.subarray(i, Math.min(i + 4, bytes.length));
    let v = 0n;
    for (let j = 0; j < chunk.length; j++) {
      v |= BigInt(mustAt(chunk, j)) << BigInt(j * 8);
    }
    belts.push(v);
  }
  while (belts.length < 8) belts.push(0n);
  return belts;
};

const pubkeyToPb = (pk: string): Record<string, unknown> => {
  const point = cheetahPointFromBase58(pk);
  return {
    value: {
      x: sixBelt(point.x),
      y: sixBelt(point.y),
      inf: point.inf,
    },
  };
};

const pkhSignatureToPb = (sig: PkhSignature): Record<string, unknown> => ({
  entries: sig.map(([hash, [pubkey, signature]]) => ({
    hash,
    pubkey: pubkeyToPb(pubkey),
    signature: schnorrFromSignature(signature),
  })),
});

const lockPrimitiveToPb = (prim: LockPrimitive): Record<string, unknown> => {
  switch (prim.tag) {
    case 'pkh': {
      const hashes = Array.isArray(prim.hashes)
        ? (prim.hashes as Digest[])
        : [];
      return {primitive: {Pkh: {m: prim.m, hashes}}};
    }
    case 'tim':
      return {primitive: {Tim: prim}};
    case 'hax': {
      const hashes = Array.isArray(prim.preimages)
        ? (prim.preimages as Digest[])
        : [];
      return {primitive: {Hax: {hashes}}};
    }
    case 'brn':
      return {primitive: {Burn: {}}};
  }
};

export const spendConditionToProtobuf = (
  sc: SpendCondition,
): Record<string, unknown> => ({primitives: sc.map(p => lockPrimitiveToPb(p))});

const merkleProofToPb = (proof: MerkleProof): Record<string, unknown> => ({
  root: proof.root,
  path: proof.path,
});

const lockMerkleProofToPb = (lmp: LockMerkleProof): Record<string, unknown> => {
  const base = {
    spend_condition: spendConditionToProtobuf(lmp.spend_condition),
    axis: lmp.axis,
    proof: merkleProofToPb(lmp.proof),
  };
  if ('version' in lmp && lmp.version === 'full') {
    return {...base, lmp_version: String(tasU64('full'))};
  }
  return base;
};

const noteDataToPb = (data: NoteData): Record<string, unknown> => ({
  entries: data.map(([key, noun]) => ({key, blob: [...jam(noun)]})),
});

const haxMapToPb = (
  haxMap: Spend1V1['witness']['hax_map'],
): {hash: string; value: number[]}[] => {
  const pairs = Array.isArray(haxMap) ? haxMap : [];
  return pairs.map(([hash, noun]) => ({
    hash,
    value: [...jam(noun)],
  }));
};

const seedToPb = (seed: SeedV1): Record<string, unknown> => ({
  output_source: seed.output_source,
  lock_root: lockRootHash(seed.lock_root),
  note_data: noteDataToPb(seed.note_data),
  gift: {value: seed.gift},
  parent_hash: seed.parent_hash,
});

const spendToPb = (spend: SpendV1): Record<string, unknown> | null => {
  if (spend.tag === 0) return null;
  const s = spend as Spend1V1;
  return {
    spend_kind: {
      Witness: {
        witness: {
          lock_merkle_proof: lockMerkleProofToPb(s.witness.lock_merkle_proof),
          pkh_signature: pkhSignatureToPb(s.witness.pkh_signature),
          hax: haxMapToPb(s.witness.hax_map),
        },
        seeds: (Array.isArray(s.seeds) ? s.seeds : []).map(seedToPb),
        fee: {value: s.fee},
      },
    },
  };
};

const nameToPb = (name: Name): Record<string, unknown> => ({
  first: name.first,
  last: name.last,
});

export const rawTxToProtobuf = (tx: RawTxV1): PbCom2RawTransaction => ({
  version: {value: '1'},
  id: tx.id,
  spends: tx.spends.map(
    ([name, spend]): PbCom2SpendEntry => ({
      name: nameToPb(name) as NonNullable<PbCom2SpendEntry['name']>,
      spend: spendToPb(spend) as NonNullable<PbCom2SpendEntry['spend']>,
    }),
  ),
});
