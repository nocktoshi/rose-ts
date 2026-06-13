import type {
  BlockHeight,
  Digest,
  Name,
  Nicks,
  Note,
  NoteData,
  NoteV0,
  NoteV1,
  PbCom2Note,
  Version,
} from "../types.js";
import { cue, jam, type Noun } from "../noun/index.js";

function required<T>(value: T | null | undefined, field: string): T {
  if (value === null || value === undefined) {
    throw new Error(`missing required field: ${field}`);
  }
  return value;
}

function parseVersion(value: string | undefined): Version {
  const v = Number(value ?? "1");
  if (v === 0 || v === 1) return v;
  throw new Error(`invalid note version: ${value}`);
}

function parseName(pb: { first: string; last: string; source?: unknown }): Name {
  return {
    first: pb.first as Digest,
    last: pb.last as Digest,
    _sig: 0,
  };
}

function noteDataFromPb(pb: { entries?: { key: string; blob: number[] }[] } | null | undefined): NoteData {
  const entries = pb?.entries ?? [];
  if (entries.length === 0) return [];
  return entries.map((e) => [e.key, cue(new Uint8Array(e.blob))]);
}

function noteDataToPb(data: NoteData): { entries: { key: string; blob: number[] }[] } {
  const pairs = Array.isArray(data) ? (data as [string, Noun][]) : [];
  return {
    entries: pairs.map(([key, noun]) => ({
      key,
      blob: [...jam(noun)],
    })),
  };
}

function isNoteV1(note: Note): note is NoteV1 {
  return "origin_page" in note && !("inner" in note);
}

export function noteFromProtobuf(value: PbCom2Note): Note {
  const version = required(value.note_version, "note_version");

  if ("V1" in version) {
    const v1 = version.V1;
    return {
      version: parseVersion(v1.version?.value),
      origin_page: Number(required(v1.origin_page?.value, "origin_page")) as BlockHeight,
      name: parseName(required(v1.name, "name") as { first: string; last: string }),
      note_data: noteDataFromPb(v1.note_data as { entries?: { key: string; blob: number[] }[] }),
      assets: required(v1.assets?.value, "assets") as Nicks,
    };
  }

  if ("Legacy" in version) {
    const legacy = version.Legacy as {
      version?: { value: string };
      origin_page?: { value: string };
      name?: { first: string; last: string };
      lock?: unknown;
      source?: { hash: string; is_coinbase?: boolean };
      assets?: { value: string };
      timelock?: unknown;
    };
    return {
      inner: {
        version: parseVersion(legacy.version?.value ?? "0"),
        origin_page: Number(required(legacy.origin_page?.value, "origin_page")) as BlockHeight,
        timelock: { tim: null },
      },
      name: parseName(required(legacy.name, "name") as { first: string; last: string }),
      sig: legacy.lock ?? { m: 0, pubkeys: [] },
      source: {
        hash: (legacy.source?.hash ?? "0") as Digest,
        is_coinbase: legacy.source?.is_coinbase ?? false,
      },
      assets: required(legacy.assets?.value, "assets") as Nicks,
    } as NoteV0;
  }

  throw new Error("unsupported note_version");
}

export function noteToProtobuf(note: Note): PbCom2Note {
  if (isNoteV1(note)) {
    return {
      note_version: {
        V1: {
          version: { value: String(note.version) },
          origin_page: { value: String(note.origin_page) },
          name: { first: note.name.first, last: note.name.last },
          note_data: noteDataToPb(note.note_data),
          assets: { value: note.assets },
        },
      },
    };
  }

  const v0 = note as NoteV0;
  return {
    note_version: {
      Legacy: {
        version: { value: String(v0.inner.version) },
        origin_page: { value: String(v0.inner.origin_page) },
        name: { first: v0.name.first, last: v0.name.last },
        lock: v0.sig,
        source: v0.source,
        assets: { value: v0.assets },
        timelock: v0.inner.timelock ?? { value: { Neither: {} } },
      },
    },
  };
}