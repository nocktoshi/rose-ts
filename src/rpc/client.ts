import type {NockchainTx} from '../types.js';
import {nockchainTxToRawTx} from '../tx/index.js';
import {
  decodeGetBlocksResponse,
  decodeTransactionAcceptedResponse,
  decodeWalletGetBalanceResponse,
  decodeWalletSendTransactionResponse,
  encodeGetBlocks,
  encodeTransactionAccepted,
  encodeWalletGetBalanceByAddress,
  encodeWalletGetBalanceByFirstName,
  encodeWalletSendTransaction,
  type GrpcBlocks,
} from '../grpc/rpc.js';
import {
  grpcWebCall,
  NOCKCHAIN_BLOCK_SERVICE,
  type FetchFn,
} from '../grpc/transport.js';
import type {Balance, BalanceEntry} from './types.js';

export type {FetchFn};
export type {GrpcBlocks, GrpcBlockEntry} from '../grpc/rpc.js';

/** Public RPC client — protobuf types from nockapp-grpc-proto. */
export class RpcClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetchFn: FetchFn = fetch,
  ) {}

  async sendTransaction(tx: NockchainTx): Promise<string> {
    const rawTx = nockchainTxToRawTx(tx);
    const body = encodeWalletSendTransaction(rawTx.id, rawTx);
    const response = await grpcWebCall(
      this.endpoint,
      'WalletSendTransaction',
      body,
      this.fetchFn,
    );
    const decoded = decodeWalletSendTransactionResponse(response);
    if (decoded.error) throw new Error(`Server error: ${decoded.error}`);
    if (!decoded.ack) throw new Error('Empty response from server');
    return 'Transaction acknowledged';
  }

  /**
   * Fetch a page of recent blocks (public v2 `NockchainBlockService/GetBlocks`).
   * Returns the server's current tip height and a most-recent-first page of
   * `{height, blockId, parent, timestamp, txIds}`.
   */
  async getBlocks(limit = 50): Promise<GrpcBlocks> {
    const body = encodeGetBlocks(limit);
    const response = await grpcWebCall(
      this.endpoint,
      'GetBlocks',
      body,
      this.fetchFn,
      NOCKCHAIN_BLOCK_SERVICE,
    );
    return decodeGetBlocksResponse(response);
  }

  async transactionAccepted(txId: string): Promise<boolean> {
    const body = encodeTransactionAccepted(txId);
    const response = await grpcWebCall(
      this.endpoint,
      'TransactionAccepted',
      body,
      this.fetchFn,
    );
    const decoded = decodeTransactionAcceptedResponse(response);
    if (decoded.error) throw new Error(`Server error: ${decoded.error}`);
    if (decoded.accepted === undefined)
      throw new Error('Empty response from server');
    return decoded.accepted;
  }

  async getBalance(address: string): Promise<Balance> {
    const body = encodeWalletGetBalanceByAddress(address);
    const response = await grpcWebCall(
      this.endpoint,
      'WalletGetBalance',
      body,
      this.fetchFn,
    );
    const decoded = decodeWalletGetBalanceResponse(response);
    if (decoded.error) throw new Error(`Server error: ${decoded.error}`);
    if (!decoded.balance) throw new Error('Empty response from server');
    const out: Balance = {
      notes: decoded.balance.notes as BalanceEntry[],
      block_id: decoded.balance.block_id,
    };
    const height = decoded.balance.height?.value;
    if (height != null) out.height = height;
    return out;
  }

  async getBalanceByFirstName(firstName: string): Promise<Balance> {
    const body = encodeWalletGetBalanceByFirstName(firstName);
    const response = await grpcWebCall(
      this.endpoint,
      'WalletGetBalance',
      body,
      this.fetchFn,
    );
    const decoded = decodeWalletGetBalanceResponse(response);
    if (decoded.error) throw new Error(`Server error: ${decoded.error}`);
    if (!decoded.balance) throw new Error('Empty response from server');
    const out: Balance = {
      notes: decoded.balance.notes as BalanceEntry[],
      block_id: decoded.balance.block_id,
    };
    const height = decoded.balance.height?.value;
    if (height != null) out.height = height;
    return out;
  }
}
