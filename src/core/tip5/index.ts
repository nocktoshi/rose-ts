import {mustAt} from '../must.js';
import {
  badd,
  bmul,
  bpow,
  montReduction,
  montify,
  type Belt,
  PRIME_128,
} from '../belt.js';
import {
  LOOKUP_TABLE,
  MDS_MATRIX,
  NUM_ROUNDS,
  NUM_SPLIT_AND_LOOKUP,
  R,
  RATE,
  ROUND_CONSTANTS,
  STATE_SIZE,
} from './constants.js';

const sboxLayer = (state: Belt[]): Belt[] => {
  const res: Belt[] = new Array(STATE_SIZE).fill(0n);

  for (let i = 0; i < NUM_SPLIT_AND_LOOKUP; i++) {
    const bytes = new Uint8Array(8);
    let v = mustAt(state, i);
    for (let j = 0; j < 8; j++) {
      bytes[j] = Number(v & 0xffn);
      v >>= 8n;
    }
    for (let j = 0; j < 8; j++) {
      bytes[j] = mustAt(LOOKUP_TABLE, mustAt(bytes, j));
    }
    let out = 0n;
    for (let j = 7; j >= 0; j--) {
      out = (out << 8n) | BigInt(mustAt(bytes, j));
    }
    res[i] = out;
  }

  for (let j = NUM_SPLIT_AND_LOOKUP; j < STATE_SIZE; j++) {
    res[j] = bpow(mustAt(state, j), 7n);
  }
  return res;
};

const linearLayer = (state: Belt[]): Belt[] => {
  const result: Belt[] = new Array(STATE_SIZE).fill(0n);
  for (let i = 0; i < STATE_SIZE; i++) {
    for (let j = 0; j < STATE_SIZE; j++) {
      const product = bmul(mustAt(mustAt(MDS_MATRIX, i), j), mustAt(state, j));
      result[i] = badd(mustAt(result, i), product);
    }
  }
  return result;
};

export const permute = (sponge: Belt[]): void => {
  for (let i = 0; i < NUM_ROUNDS; i++) {
    const a = sboxLayer(sponge);
    const b = linearLayer(a);
    for (let j = 0; j < STATE_SIZE; j++) {
      const rCons = ((mustAt(ROUND_CONSTANTS, i * STATE_SIZE + j) * R) %
        PRIME_128) as Belt;
      sponge[j] = badd(rCons, mustAt(b, j));
    }
  }
};

const tip5MontifyVec = (input: Belt[]): Belt[] => input.map(b => montify(b));

const tip5CalcDigest = (sponge: Belt[]): Belt[] =>
  sponge.slice(0, 5).map(v => montReduction(v));

const createInitSpongeVariable = (): Belt[] => new Array(STATE_SIZE).fill(0n);

const createInitSpongeFixed = (): Belt[] => {
  const sponge = new Array(STATE_SIZE).fill(0n);
  for (let i = 10; i < STATE_SIZE; i++) {
    sponge[i] = 4294967295n;
  }
  return sponge;
};

const tip5AbsorbSponge = (
  sponge: Belt[],
  input: Belt[],
  pad: boolean,
): void => {
  const r = input.length % RATE;
  const fullChunks = Math.floor(input.length / RATE);

  for (let chunkIdx = 0; chunkIdx < fullChunks; chunkIdx++) {
    const chunk = tip5MontifyVec(
      input.slice(chunkIdx * RATE, (chunkIdx + 1) * RATE),
    );
    for (let i = 0; i < RATE; i++) {
      sponge[i] = mustAt(chunk, i);
    }
    permute(sponge);
  }

  if (pad) {
    const tail = new Array(RATE).fill(0n);
    const end = input.slice(fullChunks * RATE);
    for (let i = 0; i < end.length; i++) {
      tail[i] = mustAt(end, i);
    }
    tail[end.length] = 1n;
    const chunk = tip5MontifyVec(tail);
    for (let i = 0; i < RATE; i++) {
      sponge[i] = mustAt(chunk, i);
    }
    permute(sponge);
  } else if (r !== 0) {
    throw new Error('unpadded input must be multiple of RATE');
  }
};

export const hashVarlen = (input: Belt[]): Belt[] => {
  const sponge = createInitSpongeVariable();
  tip5AbsorbSponge(sponge, input, true);
  return tip5CalcDigest(sponge);
};

export const hashFixed = (input: Belt[]): Belt[] => {
  const sponge = createInitSpongeFixed();
  tip5AbsorbSponge(sponge, input, false);
  return tip5CalcDigest(sponge);
};
