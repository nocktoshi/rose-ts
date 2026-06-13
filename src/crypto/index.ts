import type { Signature } from "../types.js";
import { beltsFromBytes } from "../core/belt.js";
import { cheetahPointHash, publicKeyFromBeBytes, verifySignature as verifySig } from "./cheetah.js";
import { vecToNoun } from "../noun/belts.js";
import { hashNounWholeBelts } from "../hash/structural.js";

export { deriveMasterKey, deriveMasterKeyFromMnemonic, ExtendedKey } from "./slip10.js";
export { PrivateKey, signMessage } from "./privateKey.js";
export {
  PublicKey,
  publicKeyFromBeBytes,
  publicKeyFromHex,
  publicKeyToHex,
  publicKeyVerify,
} from "./publicKey.js";

export function hashPublicKey(publicKeyBytes: Uint8Array): string {
  if (publicKeyBytes.length !== 97) {
    throw new Error("Public key must be 97 bytes");
  }
  const point = publicKeyFromBeBytes(publicKeyBytes);
  return cheetahPointHash(point);
}

export function verifySignature(
  publicKeyBytes: Uint8Array,
  signature: Signature,
  message: string
): boolean {
  if (publicKeyBytes.length !== 97) {
    throw new Error("Public key must be 97 bytes");
  }
  const belts = beltsFromBytes(new TextEncoder().encode(message));
  const noun = vecToNoun(belts);
  const digest = hashNounWholeBelts(noun);
  return verifySig(publicKeyBytes, signature.c, signature.s, digest);
}