import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));
const noble = (sub: string) => path.resolve(root, "node_modules/@noble/hashes", sub);

export default defineConfig({
  resolve: {
    alias: {
      // @noble/hashes v2 only exports subpaths with a `.js` suffix.
      "@noble/hashes/hmac": noble("hmac.js"),
      "@noble/hashes/sha2": noble("sha2.js"),
    },
  },
  test: {
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 120_000,
    server: {
      deps: {
        inline: [/@nockchain\/rose-wasm/, /@noble\/hashes/, /@scure\//],
      },
    },
  },
});