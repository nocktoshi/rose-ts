import {describe, expect, it} from 'vitest';
import {mustAt} from '../../src/core/must.js';
import * as RoseTs from '../../src/index.js';
import {jam} from '../../src/noun/index.js';

/** Explorer snapshot from nockchain/wallet-tx-builder PR #116. */
const EXPLORER_BLOB_B64 = 'wWpAd3ObewO+XczLOOCzhaW1A/6Lm9s84Lu4vY2DrwU=';
const BLOB_UTF8 = 'nns/v1/claim/nns.nock';

describe('note-data memo/blob (PR #116 packed belts)', () => {
  it('noteDataPushBlob round-trips UTF-8 and matches explorer jam decode', () => {
    let data = RoseTs.noteDataEmpty();
    data = RoseTs.noteDataPushBlob(data, BLOB_UTF8);
    expect(data.map(([k]) => k)).toEqual(['blob']);
    const decoded = RoseTs.decodeNoteDataPackedUtf8(mustAt(data, 0)[1]);
    expect(decoded).toBe(BLOB_UTF8);

    const explorerJam = Uint8Array.from(atob(EXPLORER_BLOB_B64), c =>
      c.charCodeAt(0),
    );
    expect(RoseTs.decodePackedBlobUtf8(explorerJam)).toBe(BLOB_UTF8);
    expect(RoseTs.decodePackedBlobUtf8(jam(mustAt(data, 0)[1]))).toBe(
      BLOB_UTF8,
    );
  });

  it('noteDataPushMemo encodes UTF-8 and preserves lock ordering', () => {
    const BUYER_PKH = '9zpwNfGdcPT1QUKw2Fnw2zvftzpAYEjzZfTqGW8KLnf3NmEJ7yR5t2Y';
    let data = RoseTs.noteDataPushPkh(
      RoseTs.noteDataEmpty(),
      RoseTs.pkhSingle(BUYER_PKH),
    );
    data = RoseTs.noteDataPushBlob(data, 'payload');
    data = RoseTs.noteDataPushMemo(data, 'hello memo');
    expect(data.map(([k]) => k)).toEqual(['lock', 'blob', 'memo']);
    expect(RoseTs.decodeNoteDataPackedUtf8(mustAt(data, 1)[1])).toBe('payload');
    expect(RoseTs.decodeNoteDataPackedUtf8(mustAt(data, 2)[1])).toBe(
      'hello memo',
    );
  });

  it('rejects empty memo', () => {
    expect(() => RoseTs.noteDataPushMemo(RoseTs.noteDataEmpty(), '')).toThrow(
      /empty/i,
    );
  });
});
