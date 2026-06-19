import {describe, it, expect} from 'vitest';
import * as RoseTs from '../src/index.js';

/**
 * Verifies the external/remote-signer seam used by NEAR-MPC (chain-signatures)
 * signing of Nockchain transactions: `signWith(pubkeyBeBytes, signDigest)` must
 * (a) hand the callback exactly the canonical `hashSpendV1SigHash` digest, and
 * (b) produce a witness byte-identical to the local-key `sign(key)` path — since
 * `sign` now delegates to `signWith`, an MPC signer cannot drift from the local one.
 */
describe('SpendBuilder.signWith (external / remote signer seam)', () => {
  const mkFixture = () => {
    const key = RoseTs.PrivateKey.fromBytes(new Uint8Array(32).fill(7));
    const pubkey = key.publicKey; // 97-byte BE Cheetah point
    const pkh = RoseTs.hashPublicKey(pubkey);
    const name0 = RoseTs.hashPublicKey(new Uint8Array(97).fill(1));
    const name1 = RoseTs.hashPublicKey(new Uint8Array(97).fill(2));
    const notePb = {
      note_version: {
        V1: {
          version: {value: '1'},
          origin_page: {value: '13'},
          name: {first: name0, last: name1},
          note_data: {entries: []},
          assets: {value: '5000000'},
        },
      },
    };
    const note = RoseTs.noteFromProtobuf(notePb as never);
    const lock = RoseTs.lockFromList([
      RoseTs.spendConditionNewPkh(RoseTs.pkhSingle(pkh)),
    ]);
    const mkSpend = () => RoseTs.SpendBuilder.new(note, lock, 0, lock);
    return {key, pubkey, mkSpend};
  };

  it('matches sign(key), feeds the oracle hashSpendV1SigHash, and verifies', async () => {
    const {key, pubkey, mkSpend} = mkFixture();

    // Local-key signing (the canonical reference).
    const local = mkSpend();
    expect(await local.sign(key)).toBe(true);

    // Remote signing: only a pubkey + a digest->signature callback. The callback
    // stands in for an MPC round; here it reuses the local key to produce (c, s).
    const remote = mkSpend();
    const expectedDigest = RoseTs.hashSpendV1SigHash(remote.spend as never);
    let seenDigest: string | undefined;
    const ok = await remote.signWith(pubkey, async digest => {
      seenDigest = digest;
      return key.signDigest(digest);
    });
    expect(ok).toBe(true);

    // (a) the oracle is handed exactly the canonical sig-hash digest.
    expect(seenDigest).toBe(expectedDigest);

    // (b) remote signing yields a witness identical to the local path.
    expect(remote.spend.witness.pkh_signature).toEqual(
      local.spend.witness.pkh_signature,
    );

    // and the externally-produced signature verifies against the public key.
    const entry = remote.spend.witness.pkh_signature[0];
    const sig = entry[1][1];
    expect(
      RoseTs.PublicKey.fromBeBytes(pubkey).verify(expectedDigest, sig),
    ).toBe(true);
  });
});
