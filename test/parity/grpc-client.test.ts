import { describe, it, expect } from "vitest";
import { RpcClient } from "../../src/rpc/client.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectParity } from "../helpers/parity.js";
import {
  decodeTransactionAcceptedResponse,
  decodeWalletSendTransactionResponse,
  encodeTransactionAccepted,
  encodeWalletGetBalanceByFirstName,
  encodeWalletSendTransaction,
} from "../../src/grpc/rpc.js";
import { WalletSendTransactionRequest } from "../../src/grpc/gen/nockchain/public/v2/nockchain.js";

const FIXTURE_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../../rose-wasm/scripts"
);

function grpcWebOk(message: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + message.length);
  out[4] = message.length;
  out.set(message, 5);
  return out;
}

describe("parity: grpc client", () => {
  it("transactionAccepted decodes bool response", async () => {
    const responseBody = grpcWebOk(new Uint8Array([0x08, 0x01]));
    const fetchFn: typeof fetch = async () =>
      new Response(responseBody, { status: 200 });

    const client = new RpcClient("https://nockchain.example", fetchFn);
    await expect(
      client.transactionAccepted("6xefAkmuxMmKxPCxvAc6rkWqD1uZ9buXk8tzthuzjvArhLGX7mBRA84")
    ).resolves.toBe(true);
  });

  it("getBalanceByFirstName calls WalletGetBalance RPC", async () => {
    const responseBody = grpcWebOk(new Uint8Array([0x0a, 0x02, 0x0a, 0x00]));
    let calledUrl = "";
    const fetchFn: typeof fetch = async (url) => {
      calledUrl = String(url);
      return new Response(responseBody, { status: 200 });
    };

    const client = new RpcClient("https://nockchain.example", fetchFn);
    const balance = await client.getBalanceByFirstName(
      "3mCt7nT11XNGQmEvpaSSaU7QnkPpi3dy8Nf6cyabb4UxCU2bKjWoxN2"
    );
    expect(calledUrl).toContain("WalletGetBalance");
    expect(balance.notes).toEqual([]);
  });

  it("generated RawTransaction encodes WalletSendTransaction protobuf (not JSON)", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const raw = wasm.rawTxFromProtobuf(pb);
    const frame = encodeWalletSendTransaction(raw.id, raw as never);
    expect(frame[0]).toBe(0);
    expect(frame.length).toBeGreaterThan(100);

    const bodyLen = (frame[1] << 24) | (frame[2] << 16) | (frame[3] << 8) | frame[4];
    const req = WalletSendTransactionRequest.decode(frame.subarray(5, 5 + bodyLen));
    expect(req.raw_tx?.spends.length).toBeGreaterThan(0);
    expect(req.raw_tx?.spends[0]?.spend?.spend_kind?.$case).toBe("witness");

    const jsonMarker = new TextEncoder().encode('"spends"');
    let hasJson = false;
    for (let i = 0; i <= frame.length - jsonMarker.length; i++) {
      if (frame.subarray(i, i + jsonMarker.length).every((b, j) => b === jsonMarker[j])) {
        hasJson = true;
        break;
      }
    }
    expect(hasJson).toBe(false);
  });

  it("RpcClient.sendTransaction accepts NockchainTx", async () => {
    const wasm = await getWasm();
    const pb = JSON.parse(readFileSync(join(FIXTURE_DIR, "test.json"), "utf8"));
    const raw = wasm.rawTxFromProtobuf(pb);
    const settings = wasm.txEngineSettingsV1BythosDefault();
    const nockTx = wasm.TxBuilder.fromRawTx(raw, settings).build();
    const tsTx = RoseTs.TxBuilder.fromRawTx(raw as never, settings).build();
    expectParity("nockTx for send", nockTx, tsTx);

    const responseBody = grpcWebOk(new Uint8Array([0x0a, 0x00]));
    const fetchFn: typeof fetch = async () => new Response(responseBody, { status: 200 });
    const client = new RpcClient("https://nockchain.example", fetchFn);
    await expect(client.sendTransaction(tsTx as never)).resolves.toBe(
      "Transaction acknowledged"
    );
  });

  it("proto encoders produce grpc-web frames", () => {
    const firstName = "3mCt7nT11XNGQmEvpaSSaU7QnkPpi3dy8Nf6cyabb4UxCU2bKjWoxN2";
    const req = encodeWalletGetBalanceByFirstName(firstName);
    expect(req[0]).toBe(0);
    expect(req.length).toBeGreaterThan(5);

    const ack = decodeWalletSendTransactionResponse(grpcWebOk(new Uint8Array([0x0a, 0x00])));
    expect(ack.ack).toBe(true);

    const txReq = encodeTransactionAccepted("tx-id");
    expect(txReq[0]).toBe(0);
    const accepted = decodeTransactionAcceptedResponse(grpcWebOk(new Uint8Array([0x08, 0x01])));
    expect(accepted.accepted).toBe(true);
    expect(txReq.length).toBeGreaterThan(5);
  });
});