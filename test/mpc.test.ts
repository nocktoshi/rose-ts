import {describe, it, expect} from 'vitest';
import {hexToBytes} from '@noble/hashes/utils.js';
import {PrivateKey} from '../src/crypto/privateKey.js';
import {PublicKey} from '../src/crypto/publicKey.js';
import {hashPublicKey} from '../src/crypto/index.js';
import {
  lockFromList,
  pkhSingle,
  spendConditionNewPkh,
  hashSpendV1SigHash,
} from '../src/hash/index.js';
import {noteFromProtobuf} from '../src/proto/index.js';
import {
  SpendBuilder,
  TxBuilder,
  txEngineSettingsV1BythosDefault,
} from '../src/tx/index.js';
import type {Digest} from '../src/types.js';
import {
  ContractMpcSigner,
  deriveMpcAddress,
  deriveTweak,
  LocalMpcSigner,
  signTxWithMpc,
} from '../src/mpc.js';

const PREDECESSOR = 'solver.near';
const PATH = 'nock-bridge/0';
const ROOT_KEY = new Uint8Array(32).fill(7);

const someDigest = (fill: number): Digest =>
  hashPublicKey(new Uint8Array(97).fill(fill)) as Digest;

describe('PrivateKey.deriveChild / PublicKey.deriveChild agree', () => {
  it("child private key's public key equals the derived child public key", () => {
    const rootKey = PrivateKey.fromBytes(ROOT_KEY);
    const tweak = deriveTweak(PREDECESSOR, PATH);
    const childKey = rootKey.deriveChild(tweak);
    const childPub = PublicKey.fromBeBytes(rootKey.publicKey).deriveChild(
      tweak,
    );
    expect([...childKey.publicKey]).toEqual([...childPub.toBeBytes()]);
  });
});

describe('deriveMpcAddress', () => {
  it('is deterministic; distinct paths give distinct addresses', () => {
    const root = PublicKey.fromBeBytes(
      PrivateKey.fromBytes(ROOT_KEY).publicKey,
    );
    const a = deriveMpcAddress(root, PREDECESSOR, 'p/0');
    const b = deriveMpcAddress(root, PREDECESSOR, 'p/0');
    const c = deriveMpcAddress(root, PREDECESSOR, 'p/1');
    expect(a.pkh).toBe(b.pkh);
    expect(a.pkh).not.toBe(c.pkh);
    expect(deriveTweak(PREDECESSOR, PATH).length).toBe(32);
  });
});

describe('LocalMpcSigner', () => {
  it('signs under the derived child key; a wrong path rejects', async () => {
    const signer = new LocalMpcSigner(ROOT_KEY, PREDECESSOR);
    const childPub = await signer.childPublicKey(PATH);
    const digest = someDigest(3);
    const sig = await signer.sign(PATH, digest);

    expect(childPub.verify(digest, sig)).toBe(true);
    const other = await signer.childPublicKey('nock-bridge/9');
    expect(other.verify(digest, sig)).toBe(false);
  });
});

describe('ContractMpcSigner', () => {
  it('parses 64-byte c‖s into a verifying signature', async () => {
    const local = new LocalMpcSigner(ROOT_KEY, PREDECESSOR);
    const childPub = await local.childPublicKey(PATH);
    const rootBe = PrivateKey.fromBytes(ROOT_KEY).publicKey;
    const digest = someDigest(5);

    const sig = await local.sign(PATH, digest);
    const packed = new Uint8Array(64);
    packed.set(hexToBytes(sig.c), 0);
    packed.set(hexToBytes(sig.s), 32);

    const contract = new ContractMpcSigner(
      rootBe,
      PREDECESSOR,
      async () => packed,
    );
    const out = await contract.sign(PATH, digest);
    expect(out).toEqual(sig);
    expect(childPub.verify(digest, out)).toBe(true);
  });

  it('rejects a wrong-length signature', async () => {
    const c = new ContractMpcSigner(
      new Uint8Array(97),
      PREDECESSOR,
      async () => new Uint8Array(10),
    );
    await expect(c.sign(PATH, someDigest(1))).rejects.toThrow(/64 bytes/);
  });
});

describe('signTxWithMpc', () => {
  it('signs a tx with the derived child key', async () => {
    const signer = new LocalMpcSigner(ROOT_KEY, PREDECESSOR);
    const childPub = await signer.childPublicKey(PATH);
    const pkh = hashPublicKey(childPub.toBeBytes());
    const settings = txEngineSettingsV1BythosDefault();

    const note = noteFromProtobuf({
      note_version: {
        V1: {
          version: {value: '1'},
          origin_page: {value: '13'},
          name: {first: someDigest(1), last: someDigest(2)},
          note_data: {entries: []},
          assets: {value: '5000000'},
        },
      },
    } as never);
    const lock = lockFromList([spendConditionNewPkh(pkhSingle(pkh))]);
    const sb = SpendBuilder.new(note, lock, 0, lock);
    sb.computeRefund(false);
    const tb = new TxBuilder(settings);
    tb.spend(sb);
    tb.recalcAndSetFee(false);

    await signTxWithMpc(tb, signer, PATH);

    const sp = tb.allSpends()[0]!.spend;
    if (sp.tag !== 1) throw new Error('expected a witness spend');
    const digest = hashSpendV1SigHash(sp);
    const entry = sp.witness.pkh_signature[0]!;
    expect(entry[0]).toBe(pkh);
    expect(childPub.verify(digest, entry[1][1])).toBe(true);
  });
});
