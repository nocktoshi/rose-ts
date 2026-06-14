import {
  GetBlocksRequest,
  GetBlocksResponse,
  TransactionAcceptedRequest,
  TransactionAcceptedResponse,
  WalletGetBalanceRequest,
  WalletGetBalanceResponse,
  WalletSendTransactionRequest,
  WalletSendTransactionResponse,
} from './gen/nockchain/public/v2/nockchain.js';
import {
  digestToGrpcHash,
  grpcBalanceToPb,
  grpcHashToDigest,
} from './convert.js';
import {rawTxV1ToGrpc} from './rawTx.js';
import {grpcWebFrame, unwrapGrpcWebFrames} from './transport.js';
import type {Digest, PbCom2Balance, RawTxV1} from '../types.js';

/** One block as returned by the public v2 `GetBlocks` RPC. */
export interface GrpcBlockEntry {
  height: bigint;
  blockId: Digest;
  parent: Digest | null;
  timestamp: bigint;
  txIds: string[];
}

export interface GrpcBlocks {
  /** The server's current tip height. */
  currentHeight: bigint;
  /** A page of blocks (most-recent first). */
  blocks: GrpcBlockEntry[];
}

const decodeFirstFrame = <T>(
  body: Uint8Array,
  decode: (bytes: Uint8Array) => T,
): T => {
  const frames = unwrapGrpcWebFrames(body);
  const frame = frames[0];
  if (!frame) throw new Error('Empty response from server');
  return decode(frame);
};

export const encodeGetBlocks = (limit: number): Uint8Array => {
  const req = GetBlocksRequest.encode({
    page: {client_page_items_limit: limit, page_token: '', max_bytes: '0'},
  }).finish();
  return grpcWebFrame(req);
};

export const decodeGetBlocksResponse = (body: Uint8Array): GrpcBlocks => {
  const resp = decodeFirstFrame(body, GetBlocksResponse.decode);
  if (resp.result?.$case === 'error') {
    throw new Error(resp.result.error.message || 'gRPC GetBlocks error');
  }
  if (resp.result?.$case !== 'blocks') return {currentHeight: 0n, blocks: []};
  const data = resp.result.blocks;
  return {
    currentHeight: BigInt(data.current_height),
    blocks: data.blocks.map(b => {
      const parent = grpcHashToDigest(b.parent);
      return {
        height: BigInt(b.height),
        blockId: grpcHashToDigest(b.block_id) as Digest,
        parent: parent === '' ? null : (parent as Digest),
        timestamp: BigInt(b.timestamp),
        txIds: b.tx_ids.map(h => h.hash),
      };
    }),
  };
};

export const encodeWalletGetBalanceByFirstName = (
  firstName: string,
): Uint8Array => {
  const req = WalletGetBalanceRequest.encode({
    selector: {$case: 'first_name', first_name: {hash: firstName}},
    page: {client_page_items_limit: 0, page_token: '', max_bytes: '0'},
  }).finish();
  return grpcWebFrame(req);
};

export const encodeWalletGetBalanceByAddress = (
  address: string,
): Uint8Array => {
  const req = WalletGetBalanceRequest.encode({
    selector: {$case: 'address', address: {key: address}},
    page: {client_page_items_limit: 0, page_token: '', max_bytes: '0'},
  }).finish();
  return grpcWebFrame(req);
};

export const encodeTransactionAccepted = (txId: string): Uint8Array => {
  const req = TransactionAcceptedRequest.encode({tx_id: {hash: txId}}).finish();
  return grpcWebFrame(req);
};

export const encodeWalletSendTransaction = (
  txId: Digest,
  rawTx: RawTxV1,
): Uint8Array => {
  const req = WalletSendTransactionRequest.encode({
    tx_id: digestToGrpcHash(txId),
    raw_tx: rawTxV1ToGrpc(rawTx),
  }).finish();
  return grpcWebFrame(req);
};

export const decodeWalletGetBalanceResponse = (
  body: Uint8Array,
): {
  balance?: PbCom2Balance;
  error?: string;
} => {
  const resp = decodeFirstFrame(body, WalletGetBalanceResponse.decode);
  if (resp.result?.$case === 'error') {
    return {error: resp.result.error.message || 'Server error'};
  }
  if (resp.result?.$case === 'balance') {
    return {balance: grpcBalanceToPb(resp.result.balance)};
  }
  throw new Error('Empty response from server');
};

export const decodeWalletSendTransactionResponse = (
  body: Uint8Array,
): {ack?: true; error?: string} => {
  const resp = decodeFirstFrame(body, WalletSendTransactionResponse.decode);
  if (resp.result?.$case === 'error') {
    return {error: resp.result.error.message || 'Server error'};
  }
  if (resp.result?.$case === 'ack') return {ack: true};
  throw new Error('Empty response from server');
};

export const decodeTransactionAcceptedResponse = (
  body: Uint8Array,
): {accepted?: boolean; error?: string} => {
  const resp = decodeFirstFrame(body, TransactionAcceptedResponse.decode);
  if (resp.result?.$case === 'error') {
    return {error: resp.result.error.message || 'Server error'};
  }
  if (resp.result?.$case === 'accepted')
    return {accepted: resp.result.accepted};
  throw new Error('Empty response from server');
};
