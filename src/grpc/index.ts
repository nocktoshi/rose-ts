import type {NockchainTx} from '../types.js';
import {RpcClient} from '../rpc/client.js';
import type {Balance} from '../rpc/types.js';

export type FetchFn = typeof fetch;

/** @deprecated Use RpcClient instead. */
export class GrpcClient extends RpcClient {
  override async sendTransaction(tx: NockchainTx): Promise<string> {
    return super.sendTransaction(tx);
  }

  async getBalanceByAddress(
    address: string,
  ): Promise<Balance & {notes: Balance['notes']}> {
    return super.getBalance(address);
  }

  override async getBalanceByFirstName(firstName: string): Promise<Balance> {
    return super.getBalanceByFirstName(firstName);
  }
}
