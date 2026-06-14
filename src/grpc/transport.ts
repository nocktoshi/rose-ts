/** gRPC-web transport (5-byte frame + fetch). */

import {mustAt} from '../core/must.js';

export type FetchFn = typeof fetch;

export const grpcWebFrame = (message: Uint8Array): Uint8Array => {
  const out = new Uint8Array(5 + message.length);
  out[0] = 0;
  out[1] = (message.length >>> 24) & 0xff;
  out[2] = (message.length >>> 16) & 0xff;
  out[3] = (message.length >>> 8) & 0xff;
  out[4] = message.length & 0xff;
  out.set(message, 5);
  return out;
};

export const unwrapGrpcWebFrames = (body: Uint8Array): Uint8Array[] => {
  const messages: Uint8Array[] = [];
  let off = 0;
  while (off + 5 <= body.length) {
    const len =
      (mustAt(body, off + 1) << 24) |
      (mustAt(body, off + 2) << 16) |
      (mustAt(body, off + 3) << 8) |
      mustAt(body, off + 4);
    off += 5;
    messages.push(body.subarray(off, off + len));
    off += len;
  }
  return messages;
};

const grpcStatusError = (response: Response): Error | null => {
  const status = response.headers.get('grpc-status');
  if (status == null || status === '0') return null;
  const message = response.headers.get('grpc-message');
  const detail = message
    ? decodeURIComponent(message)
    : `grpc-status ${status}`;
  return new Error(`gRPC error: ${detail}`);
};

export const NOCKCHAIN_SERVICE = 'nockchain.public.v2.NockchainService';
export const NOCKCHAIN_BLOCK_SERVICE =
  'nockchain.public.v2.NockchainBlockService';

export const grpcWebCall = async (
  endpoint: string,
  method: string,
  body: Uint8Array,
  fetchFn: FetchFn,
  service: string = NOCKCHAIN_SERVICE,
): Promise<Uint8Array> => {
  const url = `${endpoint.replace(/\/$/, '')}/${service}/${method}`;
  const response = await fetchFn(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/grpc-web+proto',
      'x-grpc-web': '1',
    },
    body: new Uint8Array(body),
  });
  if (!response.ok) {
    throw new Error(`gRPC error: ${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const grpcErr = grpcStatusError(response);
  if (grpcErr && bytes.length === 0) throw grpcErr;
  return bytes;
};
