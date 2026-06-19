import {describe, it, expect} from 'vitest';
import {
  digestFromBase58,
  digestFromMessageBytes,
  digestToMessageBytes,
} from '../src/core/digest.js';
import {hashPublicKey} from '../src/crypto/index.js';

describe('digestToMessageBytes (Cheetah MPC signing payload)', () => {
  it('is 40 bytes, per-belt little-endian, and round-trips', () => {
    const digest = hashPublicKey(new Uint8Array(97).fill(3));
    const belts = digestFromBase58(digest);
    const msg = digestToMessageBytes(digest);

    expect(msg.length).toBe(40);
    for (let i = 0; i < 5; i++) {
      let v = belts[i];
      for (let j = 0; j < 8; j++) {
        expect(msg[i * 8 + j]).toBe(Number(v & 0xffn));
        v >>= 8n;
      }
    }
    expect(digestFromMessageBytes(msg)).toEqual(belts);
  });

  it('accepts DigestBelts directly (same as from base58)', () => {
    const digest = hashPublicKey(new Uint8Array(97).fill(7));
    const belts = digestFromBase58(digest);
    expect([...digestToMessageBytes(belts)]).toEqual([
      ...digestToMessageBytes(digest),
    ]);
  });
});
