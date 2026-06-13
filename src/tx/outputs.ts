import { mustAt } from "../core/must.js";
import { hashSeedV1, hashSeedsV1Digest } from "../hash/tx.js";
import { hashToDigest } from "../core/hashable.js";
import { hashZSetSingleton } from "../core/zbase.js";
import { lockRootHash } from "../hash/index.js";
import { nameV1 } from "../hash/note.js";
import type {
  Digest,
  Name,
  Nicks,
  Note,
  NoteData,
  NoteV1,
  RawTxV1,
  SeedV1,
  Source,
  TxEngineSettings,
} from "../types.js";

function normalizedSeed(seed: SeedV1): SeedV1 {
  return { ...seed, output_source: null };
}

function mergeNoteData(entries: NoteData[]): NoteData {
  const map = new Map<string, NoteData[number][1]>();
  for (const data of entries) {
    for (const [k, v] of data) map.set(k, v);
  }
  return [...map.entries()];
}

function hashNormalizedSeedSet(seeds: SeedV1[]): Digest {
  const normalized = seeds.map(normalizedSeed);
  if (normalized.length === 1) {
    return hashToDigest(hashZSetSingleton(mustAt(normalized, 0), hashSeedV1));
  }
  return hashSeedsV1Digest(normalized);
}

export function rawTxV1Outputs(
  obj: RawTxV1,
  originPage: number,
  settings: TxEngineSettings
): Note[] {
  const seedsByLock = new Map<string, SeedV1[]>();

  for (const [, spend] of obj.spends) {
    const seeds = spend.tag === 1 ? spend.seeds : spend.seeds;
    for (const seed of seeds) {
      const key = lockRootHash(seed.lock_root);
      const list = seedsByLock.get(key) ?? [];
      list.push(seed);
      seedsByLock.set(key, list);
    }
  }

  const outputs: NoteV1[] = [];

  for (const [lockRootHashKey, seeds] of seedsByLock) {
    if (seeds.length === 0) continue;

    const totalAssets = seeds.reduce((acc, s) => acc + BigInt(s.gift), 0n);

    const noteData =
      settings.tx_engine_patch >= 1
        ? mergeNoteData(seeds.map((s) => s.note_data))
        : mustAt(seeds, 0).note_data;

    const srcSetHash = hashNormalizedSeedSet(seeds);
    const src: Source = { hash: srcSetHash, is_coinbase: false };
    const name: Name = nameV1(lockRootHashKey as Digest, src);

    outputs.push({
      version: 1,
      origin_page: originPage,
      name,
      note_data: noteData,
      assets: String(totalAssets) as Nicks,
    });
  }

  return outputs;
}