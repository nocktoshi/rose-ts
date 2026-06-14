import type {Digest, Lock} from '../types.js';
import {lockFromList, pkhNew, spendConditionNewPkh} from '../hash/index.js';

/** Single-leaf m-of-n PKH lock (`lock_sp_index` is always 0). */
export const multisigLock = (
  m: number,
  pkhDigests: readonly Digest[],
): Lock => {
  if (m < 1 || m > pkhDigests.length) {
    throw new Error(`invalid multisig m=${m} of n=${pkhDigests.length}`);
  }
  return lockFromList([spendConditionNewPkh(pkhNew(m, [...pkhDigests]))]);
};
