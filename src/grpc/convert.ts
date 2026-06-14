import {digestFromBase58} from '../core/digest.js';
import {digestFromProtobuf, type PbCom1Hash} from '../proto/digest.js';
import type {
  Digest,
  PbCom2Balance,
  PbCom2BalanceEntry,
  PbCom2Note,
  PbCom2NoteV1,
} from '../types.js';
import type {
  Balance as GrpcBalance,
  Note as GrpcNote,
} from './gen/nockchain/common/v2/blockchain.js';
import type {Hash} from './gen/nockchain/common/v1/primitives.js';
import type {Name as GrpcName} from './gen/nockchain/common/v1/blockchain.js';

const grpcHashToPb = (h: Hash): PbCom1Hash => {
  const pb: PbCom1Hash = {};
  if (h.belt_1) pb.belt_1 = {value: String(h.belt_1.value)};
  if (h.belt_2) pb.belt_2 = {value: String(h.belt_2.value)};
  if (h.belt_3) pb.belt_3 = {value: String(h.belt_3.value)};
  if (h.belt_4) pb.belt_4 = {value: String(h.belt_4.value)};
  if (h.belt_5) pb.belt_5 = {value: String(h.belt_5.value)};
  return pb;
};

export const grpcHashToDigest = (h: Hash | undefined): string => {
  if (!h) return '';
  return digestFromProtobuf(grpcHashToPb(h));
};

const grpcNameToPb = (
  name: GrpcName | undefined,
): {first: string; last: string} | undefined => {
  if (!name?.first || !name.last) return undefined;
  return {
    first: grpcHashToDigest(name.first),
    last: grpcHashToDigest(name.last),
  };
};

const grpcNoteToPb = (note: GrpcNote | undefined): PbCom2Note | null => {
  if (!note?.note_version) return null;
  if (note.note_version.$case === 'v1') {
    const v1 = note.note_version.v1;
    const pbV1: PbCom2NoteV1 = {
      version: {value: String(v1.version?.value ?? 1)},
      origin_page: {value: String(v1.origin_page?.value ?? 0)},
      note_data: {
        entries: (v1.note_data?.entries ?? []).map(e => ({
          key: e.key,
          blob: [...e.blob],
        })),
      },
      assets: {value: String(v1.assets?.value ?? 0)},
    };
    const name = grpcNameToPb(v1.name);
    if (name) pbV1.name = name;
    return {note_version: {V1: pbV1}};
  }
  if (note.note_version.$case === 'legacy') {
    return {note_version: {Legacy: note.note_version.legacy as never}};
  }
  return null;
};

const balanceEntryToPb = (
  entry: GrpcBalance['notes'][number],
): PbCom2BalanceEntry => {
  const out: PbCom2BalanceEntry = {note: grpcNoteToPb(entry.note)};
  const name = grpcNameToPb(entry.name);
  if (name) out.name = name;
  return out;
};

/** Map generated `common.v2.Balance` to wasm-compatible `PbCom2Balance`. */
export const grpcBalanceToPb = (balance: GrpcBalance): PbCom2Balance => {
  const out: PbCom2Balance = {
    notes: balance.notes
      .filter(entry => entry.name != null || entry.note != null)
      .map(balanceEntryToPb),
    block_id: grpcHashToDigest(balance.block_id),
  };
  if (balance.height) out.height = {value: String(balance.height.value)};
  if (balance.page) out.page = {next_page_token: balance.page.next_page_token};
  return out;
};

export const digestToGrpcHash = (digest: string): Hash => {
  const belts = digestFromBase58(digest as Digest);
  return {
    belt_1: {value: String(belts[0])},
    belt_2: {value: String(belts[1])},
    belt_3: {value: String(belts[2])},
    belt_4: {value: String(belts[3])},
    belt_5: {value: String(belts[4])},
  };
};

export const nameToGrpcName = (name: {
  first: string;
  last: string;
}): GrpcName => ({
  first: digestToGrpcHash(name.first),
  last: digestToGrpcHash(name.last),
});
