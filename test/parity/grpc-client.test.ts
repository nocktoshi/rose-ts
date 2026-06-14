import {describe, it, expect} from 'vitest';
import {RpcClient} from '../../src/rpc/client.js';
import {readFileSync} from 'node:fs';
import {dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import * as RoseTs from '../../src/index.js';
import {getWasm} from '../helpers/wasm.js';
import {expectParity} from '../helpers/parity.js';
import {
  decodeTransactionAcceptedResponse,
  decodeWalletSendTransactionResponse,
  encodeTransactionAccepted,
  encodeWalletGetBalanceByFirstName,
  encodeWalletSendTransaction,
} from '../../src/grpc/rpc.js';
import {WalletSendTransactionRequest} from '../../src/grpc/gen/nockchain/public/v2/nockchain.js';

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../rose-wasm/scripts',
);

const grpcWebOk = (message: Uint8Array): Uint8Array => {
  const out = new Uint8Array(5 + message.length);
  out[4] = message.length;
  out.set(message, 5);
  return out;
};

describe('parity: grpc client', () => {
  it('transactionAccepted decodes bool response', async () => {
    const responseBody = grpcWebOk(new Uint8Array([0x08, 0x01]));
    const fetchFn: typeof fetch = async () =>
      new Response(responseBody, {status: 200});

    const client = new RpcClient('https://nockchain.example', fetchFn);
    await expect(
      client.transactionAccepted(
        '6xefAkmuxMmKxPCxvAc6rkWqD1uZ9buXk8tzthuzjvArhLGX7mBRA84',
      ),
    ).resolves.toBe(true);
  });

  it('getBalanceByFirstName calls WalletGetBalance RPC', async () => {
    const responseBody = grpcWebOk(new Uint8Array([0x0a, 0x02, 0x0a, 0x00]));
    let calledUrl = '';
    const fetchFn: typeof fetch = async url => {
      calledUrl = String(url);
      return new Response(responseBody, {status: 200});
    };

    const client = new RpcClient('https://nockchain.example', fetchFn);
    const balance = await client.getBalanceByFirstName(
      '3mCt7nT11XNGQmEvpaSSaU7QnkPpi3dy8Nf6cyabb4UxCU2bKjWoxN2',
    );
    expect(calledUrl).toContain('WalletGetBalance');
    expect(balance.notes).toEqual([]);
  });

  it('full lock merkle proof encodes lmp_version as tas(%full)', async () => {
    const settings = RoseTs.txEngineSettingsV1BythosDefault();
    const hNock = RoseTs.hashPreimage(
      new Uint8Array([
        1, 4, 94, 58, 17, 242, 138, 59, 221, 17, 3, 236, 145, 212, 172, 51, 41,
        91, 17, 50, 64, 143, 128, 4, 27, 38, 225, 48, 160, 7, 16, 192, 24, 8,
        250, 63, 48, 130, 139, 12, 240, 187, 33, 147, 240, 145, 120, 104, 131,
        3, 244, 36, 50, 199, 221, 55, 56, 152, 120, 0, 129, 72, 209, 194, 114,
        52, 110, 8, 86, 192, 239, 178, 176, 65, 126, 22, 54, 38, 6,
      ]),
    );
    const lock = RoseTs.htlcOrLock(
      hNock,
      '8s29XUK8Do7QWt2MHfPdd1gDSta6db4c3bQrxP1YdJNfXpL3WPzTT5',
      'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp',
      83000n,
    );
    const note = RoseTs.noteFromProtobuf({
      note_version: {
        V1: {
          version: {value: '1'},
          origin_page: {value: '86402'},
          name: {
            first: '3cz3rZkJoucX7dvaZyivJhG7RebWzqAkD1vUioMg5X5aQcGiaPs2AKM',
            last: 'CLRdUQh2bax3Jp2kLDvJRXG5kR25bbrjccMZqpiBwV7sbeWdNBMMDJB',
          },
          note_data: {entries: []},
          assets: {value: '17009691'},
        },
      },
    });
    const buyerLock = RoseTs.lockFromList([
      RoseTs.spendConditionNewPkh(
        RoseTs.pkhSingle(
          '8s29XUK8Do7QWt2MHfPdd1gDSta6db4c3bQrxP1YdJNfXpL3WPzTT5',
        ),
      ),
    ]);
    const spend = RoseTs.SpendBuilder.new(note, lock, 0, buyerLock);
    spend.computeRefund(false);
    const builder = new RoseTs.TxBuilder(settings);
    builder.spend(spend);
    builder.recalcAndSetFee(false);
    const raw = RoseTs.nockchainTxToRawTx(builder.build());

    const frame = encodeWalletSendTransaction(raw.id, raw as never);
    const bodyLen =
      (frame[1] << 24) | (frame[2] << 16) | (frame[3] << 8) | frame[4];
    const req = WalletSendTransactionRequest.decode(
      frame.subarray(5, 5 + bodyLen),
    );
    const lmp =
      req.raw_tx?.spends[0]?.spend?.spend_kind?.witness?.witness
        ?.lock_merkle_proof;
    expect(lmp?.lmp_version).toBe('1819047270');
    expect(lmp?.axis).toBe('6');

    const witnessSpend = req.raw_tx?.spends[0]?.spend?.spend_kind?.witness;
    const seed = witnessSpend?.seeds[0];
    expect(seed?.lock_root?.belt_1?.value).not.toBe('0');
    // The lone refund seed pays the fee, so gift + fee must equal the note's assets.
    expect(
      BigInt(seed?.gift?.value ?? '0') +
        BigInt(witnessSpend?.fee?.value ?? '0'),
    ).toBe(17009691n);
  });

  it('applyWitness keeps hax from spend when witness_data omits it', () => {
    const settings = RoseTs.txEngineSettingsV1BythosDefault();
    const builder = new RoseTs.TxBuilder(settings);
    const note = RoseTs.noteFromProtobuf({
      note_version: {
        V1: {
          version: {value: '1'},
          origin_page: {value: '1'},
          name: {
            first: '4aAqswWFkNi6bey6Ac58QxsmMLV3VAC1LKnXwAaQvhYSZb6epr7aXap',
            last: 'pnCZnNbZ1NGqeP2vSBBzQM3ecpjCoAnmFJH6Z6gGwpfjjBhNtddZqj',
          },
          note_data: {entries: []},
          assets: {value: '1000'},
        },
      },
    });
    const hNock = RoseTs.hashPreimage(
      new Uint8Array([
        1, 4, 94, 58, 17, 242, 138, 59, 221, 17, 3, 236, 145, 212, 172, 51, 41,
        91, 17, 50, 64, 143, 128, 4, 27, 38, 225, 48, 160, 7, 16, 192, 24, 8,
        250, 63, 48, 130, 139, 12, 240, 187, 33, 147, 240, 145, 120, 104, 131,
        3, 244, 36, 50, 199, 221, 55, 56, 152, 120, 0, 129, 72, 209, 194, 114,
        52, 110, 8, 86, 192, 239, 178, 176, 65, 126, 22, 54, 38, 6,
      ]),
    );
    const lock = RoseTs.htlcOrLock(
      hNock,
      'ey4Lwommv6EeDfZzMrNKf7pJzShfoiCxJh7hEcoKu9TfzaXxngcwHJ',
      'gFz59ms5byUAp4kbgatYHZFve3ZxMSqspGPUVweyP1u4XQCzLjsdKp',
      1000n,
    );
    const spend = RoseTs.SpendBuilder.new(note, lock, 0, null);
    spend.addPreimage(
      new Uint8Array([
        1, 4, 94, 58, 17, 242, 138, 59, 221, 17, 3, 236, 145, 212, 172, 51, 41,
        91, 17, 50, 64, 143, 128, 4, 27, 38, 225, 48, 160, 7, 16, 192, 24, 8,
        250, 63, 48, 130, 139, 12, 240, 187, 33, 147, 240, 145, 120, 104, 131,
        3, 244, 36, 50, 199, 221, 55, 56, 152, 120, 0, 129, 72, 209, 194, 114,
        52, 110, 8, 86, 192, 239, 178, 176, 65, 126, 22, 54, 38, 6,
      ]),
    );
    builder.spend(spend);
    const tx = builder.build();
    const signed = structuredClone(tx);
    const hax = signed.witness_data.data[0][1].hax_map;
    signed.witness_data.data[0][1].hax_map = [];
    signed.spends[0][1].witness.hax_map = hax;
    const raw = RoseTs.nockchainTxToRawTx(signed);
    const witness = raw.spends[0][1];
    if (witness.tag !== 1) throw new Error('expected witness spend');
    expect(witness.witness.hax_map).toHaveLength(1);
    void settings;
  });

  it('generated RawTransaction encodes WalletSendTransaction protobuf (not JSON)', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const raw = wasm.rawTxFromProtobuf(pb);
    const frame = encodeWalletSendTransaction(raw.id, raw as never);
    expect(frame[0]).toBe(0);
    expect(frame.length).toBeGreaterThan(100);

    const bodyLen =
      (frame[1] << 24) | (frame[2] << 16) | (frame[3] << 8) | frame[4];
    const req = WalletSendTransactionRequest.decode(
      frame.subarray(5, 5 + bodyLen),
    );
    expect(req.raw_tx?.spends.length).toBeGreaterThan(0);
    expect(req.raw_tx?.spends[0]?.spend?.spend_kind?.$case).toBe('witness');

    const jsonMarker = new TextEncoder().encode('"spends"');
    let hasJson = false;
    for (let i = 0; i <= frame.length - jsonMarker.length; i++) {
      if (
        frame
          .subarray(i, i + jsonMarker.length)
          .every((b, j) => b === jsonMarker[j])
      ) {
        hasJson = true;
        break;
      }
    }
    expect(hasJson).toBe(false);
  });

  it('RpcClient.sendTransaction accepts NockchainTx', async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, 'test.json'), 'utf8'));
    const raw = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const nockTx = wasm.TxBuilder.fromRawTx(raw, settings).build();
    const tsTx = RoseTs.TxBuilder.fromRawTx(raw as never, settings).build();
    expectParity('nockTx for send', nockTx, tsTx);

    const responseBody = grpcWebOk(new Uint8Array([0x0a, 0x00]));
    const fetchFn: typeof fetch = async () =>
      new Response(responseBody, {status: 200});
    const client = new RpcClient('https://nockchain.example', fetchFn);
    await expect(client.sendTransaction(tsTx as never)).resolves.toBe(
      'Transaction acknowledged',
    );
  });

  it('proto encoders produce grpc-web frames', () => {
    const firstName = '3mCt7nT11XNGQmEvpaSSaU7QnkPpi3dy8Nf6cyabb4UxCU2bKjWoxN2';
    const req = encodeWalletGetBalanceByFirstName(firstName);
    expect(req[0]).toBe(0);
    expect(req.length).toBeGreaterThan(5);

    const ack = decodeWalletSendTransactionResponse(
      grpcWebOk(new Uint8Array([0x0a, 0x00])),
    );
    expect(ack.ack).toBe(true);

    const txReq = encodeTransactionAccepted('tx-id');
    expect(txReq[0]).toBe(0);
    const accepted = decodeTransactionAcceptedResponse(
      grpcWebOk(new Uint8Array([0x08, 0x01])),
    );
    expect(accepted.accepted).toBe(true);
    expect(txReq.length).toBeGreaterThan(5);
  });
});
