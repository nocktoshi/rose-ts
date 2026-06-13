#!/usr/bin/env node
/**
 * Generate TypeScript protobuf types from nockapp-grpc-proto.
 *
 * Proto source (first match wins):
 *   1. NOCKAPP_GRPC_PROTO env (path to .../proto directory)
 *   2. ../proto (vendored copy in this package)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = join(here, "..");

const candidates = [
  process.env.NOCKAPP_GRPC_PROTO,
  join(pkgRoot, "proto"),
  resolve(pkgRoot, "../../../nockchain/crates/nockapp-grpc-proto/proto"),
].filter(Boolean);

const protoRoot = candidates.find((p) => existsSync(p));
if (!protoRoot) {
  console.error(
    "proto-gen: no proto root found. Set NOCKAPP_GRPC_PROTO or vendor protos into crates/rose-ts/proto"
  );
  process.exit(1);
}

const outDir = join(pkgRoot, "src/grpc/gen");
const plugin = join(pkgRoot, "node_modules/.bin/protoc-gen-ts_proto");
const entry = join(protoRoot, "nockchain/public/v2/nockchain.proto");

const args = [
  `--plugin=protoc-gen-ts_proto=${plugin}`,
  `--ts_proto_out=${outDir}`,
  "--ts_proto_opt=esModuleInterop=true,outputServices=false,env=browser,useOptionals=messages,oneof=unions,snakeToCamel=false,importSuffix=.js,forceLong=string",
  `--proto_path=${protoRoot}`,
  entry,
];

const result = spawnSync("protoc", args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`proto-gen: wrote ${outDir} from ${protoRoot}`);