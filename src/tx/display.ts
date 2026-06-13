import type { InputDisplay, Name, SpendCondition } from "../types.js";
import { nameKey } from "./spends.js";

function findInZMap<T>(
  inputs: [Name, T][],
  name: Name
): T | undefined {
  const key = nameKey(name);
  for (const [n, v] of inputs) {
    if (nameKey(n) === key) return v;
  }
  return undefined;
}

/** Resolve per-input display metadata (rose-nockchain-types `InputDisplay::get`). */
export function getDisplayInput(
  display: InputDisplay,
  name: Name
): SpendCondition | { tag: "v0"; sig: unknown } | undefined {
  if ("tag" in display && display.tag === 1) {
    const sc = findInZMap(display.inputs as [Name, SpendCondition][], name);
    return sc;
  }
  if ("tag" in display && display.tag === 0) {
    const sig = findInZMap(display.inputs as [Name, unknown][], name);
    if (sig !== undefined) return { tag: "v0", sig };
  }
  if ("inputs" in display && !("tag" in display)) {
    const entry = findInZMap(
      display.inputs as [Name, SpendCondition | { tag: "v0"; sig: unknown } | unknown][],
      name
    );
    if (entry === undefined) return undefined;
    if (Array.isArray(entry) || (typeof entry === "object" && entry !== null && "tag" in entry)) {
      return entry as SpendCondition;
    }
    return { tag: "v0", sig: entry };
  }
  return undefined;
}

export function isV1DisplayInput(
  input: ReturnType<typeof getDisplayInput>
): input is SpendCondition {
  return input !== undefined && !(typeof input === "object" && "tag" in input && input.tag === "v0");
}