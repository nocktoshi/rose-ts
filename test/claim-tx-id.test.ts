import { describe, expect, it } from "vitest";
import { rawTxV1CalcId } from "../src/hash/tx.js";
import { rawTxFromProtobuf } from "../src/proto/rawTx.js";

const NODE_EXPECTED = "2F7ob33ut265MDVrncN9WMMZ5JrZXb6NBBoTMGdT2d2Ch8zBzjvSs4";
const CLIENT_SENT = "CnxkWx817NtqxF49tm7V1fdYVPmwbeMi5hQgvAikZ9gzDUhpAGcQv6j";

const USER_PB = {
  version: { value: "1" },
  id: CLIENT_SENT,
  spends: [
    {
      name: {
        first: "3cz3rZkJoucX7dvaZyivJhG7RebWzqAkD1vUioMg5X5aQcGiaPs2AKM",
        last: "CLRdUQh2bax3Jp2kLDvJRXG5kR25bbrjccMZqpiBwV7sbeWdNBMMDJB",
      },
      spend: {
        spend_kind: {
          Witness: {
            witness: {
              lock_merkle_proof: {
                spend_condition: {
                  primitives: [
                    {
                      primitive: {
                        Pkh: {
                          m: 1,
                          hashes: ["8s29XUK8Do7QWt2MHfPdd1gDSta6db4c3bQrxP1YdJNfXpL3WPzTT5"],
                        },
                      },
                    },
                    {
                      primitive: {
                        Hax: {
                          hashes: ["Bct6efbYzgwrcCj9Mk6n6XeLUaEkRGDAikkb5LnxAH9uBAavZ1offaR"],
                        },
                      },
                    },
                  ],
                },
                axis: 3,
                proof: {
                  root: "4Gfw18uMsFYTZVPhRGbpkw6RGSEKtDkHCVqFPsRQTDrouw7xTuBR2iW",
                  path: ["B5mZuJShE1sPVFHZSYxGmCTQtmz9kVCS5xgQa81XgHfcnYBZt59KcXR"],
                },
                lmp_version: "1819047270",
              },
              pkh_signature: {
                entries: [
                  {
                    hash: "8s29XUK8Do7QWt2MHfPdd1gDSta6db4c3bQrxP1YdJNfXpL3WPzTT5",
                    pubkey: {
                      value: {
                        x: {
                          belt_1: { value: "9742120347922570733" },
                          belt_2: { value: "7172134143161497029" },
                          belt_3: { value: "13752990376315485127" },
                          belt_4: { value: "16218355081430265339" },
                          belt_5: { value: "13500707885951173747" },
                          belt_6: { value: "5360143654045681557" },
                        },
                        y: {
                          belt_1: { value: "11723526618108448898" },
                          belt_2: { value: "13132607793143460349" },
                          belt_3: { value: "4848632966693356779" },
                          belt_4: { value: "428030307283633308" },
                          belt_5: { value: "12004657580423825270" },
                          belt_6: { value: "716199237807648642" },
                        },
                        inf: false,
                      },
                    },
                    signature: {
                      chal: {
                        belt_1: { value: "3464335630" },
                        belt_2: { value: "1316190513" },
                        belt_3: { value: "2649398374" },
                        belt_4: { value: "4100739209" },
                        belt_5: { value: "3443902238" },
                        belt_6: { value: "2121131877" },
                        belt_7: { value: "253167635" },
                        belt_8: { value: "277333494" },
                      },
                      sig: {
                        belt_1: { value: "574420276" },
                        belt_2: { value: "2807505291" },
                        belt_3: { value: "4214106641" },
                        belt_4: { value: "2936241099" },
                        belt_5: { value: "2991585549" },
                        belt_6: { value: "3444954752" },
                        belt_7: { value: "568906094" },
                        belt_8: { value: "617446894" },
                      },
                    },
                  },
                ],
              },
              hax: [
                {
                  hash: "Bct6efbYzgwrcCj9Mk6n6XeLUaEkRGDAikkb5LnxAH9uBAavZ1offaR",
                  value: [
                    1, 122, 127, 157, 238, 181, 251, 251, 23, 49, 128, 0, 139, 171, 141, 4, 125,
                    176, 15, 127, 128, 31, 196, 109, 138, 225, 198, 63, 208, 24, 224, 167, 88,
                    211, 188, 230, 245, 193, 238, 7, 248, 123, 74, 0, 22, 8, 92, 239, 132, 1, 4,
                    112, 109, 108, 56, 171, 152, 156, 144, 3, 236, 165, 52, 9, 56, 101, 223, 225,
                    18, 240, 231, 128, 207, 223, 163, 133, 145, 149, 1,
                  ],
                },
              ],
            },
            seeds: [
              {
                output_source: null,
                lock_root: "A3LoWjxurwiyzhkv8sgDv2MVu9PwgWHmqoncXw9GEQ5M3qx46svvadE",
                note_data: { entries: [] },
                gift: { value: "16653339" },
                parent_hash: "2ohVk8J3JHrHAczAGwvqg3yKxNQh4E7DcKe6GwLPYb8pugN3WiZbAxG",
              },
            ],
            fee: { value: "356352" },
          },
        },
      },
    },
  ],
};

describe("claim tx id from user pb", () => {
  it("rawTxV1CalcId uses structural hax (differs from stale client id)", () => {
    const raw = rawTxFromProtobuf(USER_PB as never);
    const id = rawTxV1CalcId(raw);
    // Structural witness hax hashing (node hashable-noun). Matches nockchain-e2e harness.
    expect(id).toBe("uFAJUFitgTHzvTFn9GZiGi7uEtGwNBeVvkhduMDdj7ag4rz144KLFF");
    expect(id).not.toBe(CLIENT_SENT);
    // Node log expected id for this broadcast; re-claim after rebuild should align.
    expect(id).not.toBe(NODE_EXPECTED);
  });
});