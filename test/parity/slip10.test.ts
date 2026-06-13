import { describe, it } from "vitest";
import { base58 } from "@scure/base";
import { must } from "../../src/core/must.js";
import * as RoseTs from "../../src/index.js";
import { getWasm } from "../helpers/wasm.js";
import { expectBytesEqual, expectParity } from "../helpers/parity.js";

const WALLET_MNEMONIC =
  "clutch inmate mango seek attract credit illegal popular term loyal fiber output trumpet lucky garbage merge menu certain dynamic aim trip fantasy master unveil";

function fromB58(s: string): Uint8Array {
  return base58.decode(s);
}

function wasmKeyPlain(key: {
  privateKey?: Uint8Array;
  publicKey: Uint8Array;
  chainCode: Uint8Array;
}) {
  return {
    privateKey: key.privateKey ? new Uint8Array(key.privateKey) : undefined,
    publicKey: new Uint8Array(key.publicKey),
    chainCode: new Uint8Array(key.chainCode),
  };
}

function tsKeyPlain(key: RoseTs.ExtendedKey) {
  return {
    privateKey: key.privateKey ? new Uint8Array(key.privateKey) : undefined,
    publicKey: new Uint8Array(key.publicKey),
    chainCode: new Uint8Array(key.chainCode),
  };
}

describe("parity: slip10", () => {
  it("deriveMasterKey matches wasm on mnemonic seed", async () => {
    const wasm = await getWasm();
    const wasmKey = wasm.deriveMasterKeyFromMnemonic(WALLET_MNEMONIC, "");
    const tsKey = RoseTs.deriveMasterKeyFromMnemonic(WALLET_MNEMONIC, "");
    expectParity("deriveMasterKeyFromMnemonic", wasmKeyPlain(wasmKey), tsKeyPlain(tsKey));
    expectBytesEqual(must(tsKey.privateKey, "master private key"), fromB58("3MoHxVXWAr9qny12Sw8ZZtrgEBFcZegQQVkwYyePb9LZ"));
    expectBytesEqual(tsKey.chainCode, fromB58("3NhBRdy7vRw8vKQ5RnR3CNcD43WDn5Ky7mhhotqUcaiR"));
  });

  it("deriveChild matches wasm (normal + hardened)", async () => {
    const wasm = await getWasm();
    const wasmMaster = wasm.deriveMasterKeyFromMnemonic(WALLET_MNEMONIC, "");
    const tsMaster = RoseTs.deriveMasterKeyFromMnemonic(WALLET_MNEMONIC, "");

    const wasmChild = wasmMaster.deriveChild(0);
    const tsChild = tsMaster.deriveChild(0);
    expectParity("deriveChild(0)", wasmKeyPlain(wasmChild), tsKeyPlain(tsChild));
    expectBytesEqual(must(tsChild.privateKey, "child private key"), fromB58("6AifHLAuT1MxnFsoCwjKNFaBze91DXFDV1rRLefkzPEK"));

    const wasmHardened = wasmMaster.deriveChild(1 << 31);
    const tsHardened = tsMaster.deriveChild(1 << 31);
    expectParity("deriveChild(hardened 0)", wasmKeyPlain(wasmHardened), tsKeyPlain(tsHardened));
    expectBytesEqual(must(tsHardened.privateKey, "hardened private key"), fromB58("CpMAmcgN1V6Majtx2HC7ULLXD9psA3Gg3nMye3JpKpH"));
  });

  it("signMessage digest matches nockchain-wallet vector", async () => {
    const wasm = await getWasm();
    const signMnemonic =
      "kangaroo gap pair wonder grid version winter burden garment resemble object trap survey custom mask fiber anger hospital conduct draft page hello embark core";
    const wasmKey = wasm.deriveMasterKeyFromMnemonic(signMnemonic, "");
    const tsKey = RoseTs.deriveMasterKeyFromMnemonic(signMnemonic, "");
    const priv = wasmKey.privateKey;
    if (!priv) throw new Error("missing private key");
    const message = "hello";
    const wasmSig = wasm.signMessage(priv, message);
    const tsSig = RoseTs.signMessage(must(tsKey.privateKey, "signing private key"), message);
    expectParity("signMessage", wasmSig, tsSig);
  });
});