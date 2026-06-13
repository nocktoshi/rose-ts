import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { rawTxV1CalcId } from "../src/hash/tx.js";
import { rawTxFromProtobuf } from "../src/proto/rawTx.js";

const FIXTURE = join(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/claim-pb-38BAKLt2.json"
);

const NODE_EXPECTED = "8XKHCKLJ7JRiHohurEnVEL4boiNKNUVihtjwjiCJHhB2rhuKJsReLis";
const CLIENT_SENT = "6xefAkmuxMmKxPCxvAc6rkWqD1uZ9buXk8tzthuzjvArhLGX7mBRA84";

describe("claim pb 38BAKLt2 (axis-6 HTLC)", () => {
  it("structural witness hax yields node id, not stale client id", () => {
    const pb = JSON.parse(readFileSync(FIXTURE, "utf8"));
    expect(pb.id).toBe(CLIENT_SENT);
    const raw = rawTxFromProtobuf(pb);
    const id = rawTxV1CalcId(raw);
    expect(id).toBe(NODE_EXPECTED);
    expect(id).not.toBe(CLIENT_SENT);
  });
});