/**
 * Vitest global setup: patch Node fetch for local .wasm files, then init wasm oracle.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeAll } from "vitest";

const realFetch = globalThis.fetch;

globalThis.fetch = (async (input: unknown, init?: unknown) => {
  const url =
    typeof input === "string"
      ? input
      : (input as URL).href ?? (input as Request).url ?? String(input);
  if (url.startsWith("file://") && url.endsWith(".wasm")) {
    const bytes = readFileSync(fileURLToPath(url));
    return new Response(bytes, { headers: { "content-type": "application/wasm" } });
  }
  return (realFetch as (i: unknown, n?: unknown) => Promise<Response>)(input, init);
}) as typeof fetch;

beforeAll(async () => {
  const init = (await import("@nockchain/rose-wasm")).default;
  await init();
});