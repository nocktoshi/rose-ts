export interface BalanceEntry {
  name?: { first: string; last: string };
  note?: { note_version?: { V1?: unknown; Legacy?: unknown } } | null;
}

export interface Balance {
  notes: BalanceEntry[];
  block_id: string;
  height?: string;
}