import { mustAt } from "../core/must.js";
import type {
  Digest,
  Lock,
  LockMerkleProof,
  LockMetadata,
  LockRoot,
  MissingUnlocks,
  Name,
  Nicks,
  NockchainTx,
  Note,
  Noun,
  RawTxV1,
  SeedV1,
  Signature,
  Spend1V1,
  SpendCondition,
  SpendV1,
  SpendsV1,
  TxEngineSettings,
  TxLock,
  Witness,
  InputDisplay,
} from "../types.js";
import {
  lockRootHash,
  noteDataEmpty,
  noteDataPushBlob,
  noteDataPushLock,
  noteDataPushMemo,
  noteHash,
  pkhSingle,
  spendConditionNewPkh,
} from "../hash/index.js";
import { encodeLock } from "../noun/codec.js";
import { toWire } from "../noun/types.js";
import type { OutputNoteData } from "./types.js";
import { canonicalSeedsV1, hashSpendV1SigHash, rawTxV1CalcId } from "../hash/tx.js";
import { PrivateKey } from "../crypto/privateKey.js";
import { hashPublicKey } from "../crypto/index.js";
import { cheetahPointToBase58, publicKeyFromBeBytes } from "../crypto/cheetah.js";
import { cue } from "../noun/cue.js";
import { hashNounStructural } from "../hash/structural.js";
import { noteDataFeeWords } from "../hash/note.js";
import { calcFeeFromSpends, missingUnlocksFee, spendCalcWords } from "./fee.js";
import { getDisplayInput, isV1DisplayInput } from "./display.js";
import { applyWitness, nameKey, splitWitness } from "./spends.js";
import { computeMissingUnlocks } from "./unlocks.js";
import { witnessFromLock, witnessWithHaxPreimage, witnessWithPkhSignature } from "./witness.js";

export interface SimpleSpendLockOptions {
  preimageJam?: Uint8Array;
  outputExtras?: OutputNoteData;
}

interface NoteInfo {
  name: Name;
  version: 1;
  assets: Nicks;
  hash: Digest;
}

function compareNames(a: Name, b: Name): number {
  if (a.first !== b.first) return a.first < b.first ? -1 : 1;
  if (a.last !== b.last) return a.last < b.last ? -1 : 1;
  return 0;
}

function spendConditionFromLmp(lmp: LockMerkleProof): SpendCondition {
  return lmp.spend_condition;
}

function totalGifts(spend: SpendV1): bigint {
  const seeds = spend.tag === 1 ? spend.seeds : spend.seeds;
  let total = 0n;
  for (const seed of seeds) total += BigInt(seed.gift);
  return total;
}

function noteInfoFromSpend(name: Name, spend: SpendV1): NoteInfo | null {
  if (spend.tag !== 1) return null;
  const firstSeed = spend.seeds[0];
  if (!firstSeed) return null;
  const gifts = totalGifts(spend);
  const fee = BigInt(spend.fee);
  return {
    name,
    version: 1,
    assets: String(gifts + fee) as Nicks,
    hash: firstSeed.parent_hash,
  };
}

function lockFromLockRoot(lockRoot: LockRoot): Lock | null {
  if (typeof lockRoot === "string") return null;
  if (Array.isArray(lockRoot)) return lockRoot;
  if ("tag" in lockRoot) return lockRoot as Lock;
  return null;
}

export class SpendBuilder {
  readonly noteInfo: NoteInfo;
  spend: SpendV1;
  readonly refundLock: LockRoot | null;

  constructor(noteInfo: NoteInfo, spend: SpendV1, refundLock: LockRoot | null) {
    this.noteInfo = noteInfo;
    this.spend = spend;
    this.refundLock = refundLock;
  }

  static fromSpend(name: Name, spend: SpendV1, refundLock: LockRoot | null): SpendBuilder | null {
    const info = noteInfoFromSpend(name, spend);
    if (!info) return null;
    return new SpendBuilder(info, structuredClone(spend), refundLock);
  }

  static fromSpendAndInput(
    name: Name,
    spend: SpendV1,
    input: ReturnType<typeof getDisplayInput>,
    refundLock: LockRoot | null
  ): SpendBuilder | null {
    if (spend.tag !== 1 || !isV1DisplayInput(input)) return null;
    return SpendBuilder.fromSpend(name, spend, refundLock);
  }

  missingUnlocks(): MissingUnlocks[] {
    return computeMissingUnlocks(this.spend);
  }

  static newFromWitness(
    note: Note,
    witness: Witness,
    refundLock?: LockRoot | null
  ): SpendBuilder {
    if (!("version" in note) || !("note_data" in note)) {
      throw new Error("V0 notes not supported");
    }
    const noteInfo: NoteInfo = {
      name: note.name,
      version: 1,
      assets: note.assets,
      hash: noteHash(note),
    };
    const spend: SpendV1 = {
      tag: 1,
      witness: structuredClone(witness),
      seeds: [],
      fee: "0" as Nicks,
    };
    return new SpendBuilder(noteInfo, spend, refundLock ?? null);
  }

  static new(
    note: Note,
    lock?: Lock | null,
    lockSpIndex?: number | null,
    refundLock?: LockRoot | null
  ): SpendBuilder {
    if (!("version" in note) || !("note_data" in note)) {
      throw new Error("V0 notes not supported");
    }
    if (lock == null || lockSpIndex == null) {
      throw new Error("MissingSpendCondition");
    }
    const noteInfo: NoteInfo = {
      name: note.name,
      version: 1,
      assets: note.assets,
      hash: noteHash(note),
    };
    const witness = witnessFromLock(lock, lockSpIndex);
    const spend: SpendV1 = {
      tag: 1,
      witness,
      seeds: [],
      fee: "0" as Nicks,
    };
    return new SpendBuilder(noteInfo, spend, refundLock ?? null);
  }

  buildSeed(
    lockRoot: LockRoot,
    gift: Nicks,
    includeLockData: boolean,
    outputExtras?: OutputNoteData
  ): SeedV1 {
    let note_data = noteDataEmpty();
    if (includeLockData) {
      const lock = lockFromLockRoot(lockRoot);
      if (!lock) throw new Error("include_lock_data set, but lock_root is a hash");
      note_data = noteDataPushLock(note_data, toWire(encodeLock(lock)));
    }
    if (outputExtras?.blob) {
      note_data = noteDataPushBlob(note_data, outputExtras.blob);
    }
    if (outputExtras?.memo) {
      note_data = noteDataPushMemo(note_data, outputExtras.memo);
    }
    return {
      output_source: null,
      lock_root: lockRoot,
      note_data,
      gift,
      parent_hash: this.noteInfo.hash,
    };
  }

  seed(seed: SeedV1): void {
    this.invalidateSigs();
    if (this.spend.tag !== 1) return;
    this.spend.seeds.push(seed);
  }

  fee(feePortion: Nicks): void {
    if (this.spend.tag !== 1) return;
    if (this.spend.fee !== feePortion) this.invalidateSigs();
    this.spend.fee = feePortion;
  }

  curRefund(): SeedV1 | undefined {
    if (!this.refundLock || this.spend.tag !== 1) return undefined;
    const rlh = lockRootHash(this.refundLock);
    return this.spend.seeds.find((s) => lockRootHash(s.lock_root) === rlh);
  }

  computeRefund(includeLockData: boolean): void {
    if (!this.refundLock || this.spend.tag !== 1) return;
    this.invalidateSigs();
    const rlh = lockRootHash(this.refundLock);
    this.spend.seeds = this.spend.seeds.filter((s) => lockRootHash(s.lock_root) !== rlh);

    const gifts = this.spend.seeds.reduce((acc, s) => acc + BigInt(s.gift), 0n);
    const refund = BigInt(this.noteInfo.assets) - BigInt(this.spend.fee) - gifts;
    if (refund > 0n) {
      const seed = this.buildSeed(this.refundLock, String(refund) as Nicks, includeLockData);
      this.spend.seeds.unshift(seed);
    }
  }

  isBalanced(): boolean {
    if (this.spend.tag !== 1) return false;
    let sum = 0n;
    for (const s of this.spend.seeds) sum += BigInt(s.gift);
    return this.noteInfo.assets === String(sum + BigInt(this.spend.fee));
  }

  addPreimage(preimageJam: Uint8Array): Digest | undefined {
    if (this.spend.tag !== 1) return undefined;
    const tree = cue(preimageJam);
    if (!tree) return undefined;
    // Hax preimages in locks use structural hash-noun (`hashPreimage` / node hax check).
    const digest = hashNounStructural(tree) as Digest;
    const noun = toWire(tree);
    const sc = spendConditionFromLmp(this.spend.witness.lock_merkle_proof);
    for (const prim of sc) {
      if (prim.tag === "hax") {
        const list = Array.isArray(prim.preimages) ? prim.preimages : [];
        if ((list as Digest[]).includes(digest)) {
          const hax = Array.isArray(this.spend.witness.hax_map)
            ? [...this.spend.witness.hax_map]
            : [];
          hax.push([digest, noun]);
          this.spend.witness.hax_map = hax;
          return digest;
        }
      }
    }
    return undefined;
  }

  setWitness(witness: Witness): void {
    if (this.spend.tag !== 1) return;
    this.invalidateSigs();
    this.spend.witness = structuredClone(witness);
  }

  pushPkhSignature(pkh: Digest, pubkeyBase58: string, signature: Signature): void {
    if (this.spend.tag !== 1) return;
    this.spend.witness = witnessWithPkhSignature(this.spend.witness, [
      pkh,
      [pubkeyBase58, signature],
    ]);
  }

  pushHaxPreimage(digest: Digest, preimageNoun: Noun): void {
    if (this.spend.tag !== 1) return;
    this.spend.witness = witnessWithHaxPreimage(this.spend.witness, digest, preimageNoun);
  }

  invalidateSigs(): void {
    if (this.spend.tag !== 1) return;
    this.spend.witness.pkh_signature = [];
  }

  async sign(signingKey: PrivateKey): Promise<boolean> {
    if (this.spend.tag !== 1) return false;
    const pkh = hashPublicKey(signingKey.publicKey) as Digest;
    const sc = spendConditionFromLmp(this.spend.witness.lock_merkle_proof);
    for (const prim of sc) {
      if (prim.tag !== "pkh") continue;
      const hashes = Array.isArray(prim.hashes) ? (prim.hashes as Digest[]) : [];
      if (!hashes.includes(pkh)) continue;
      const sig = signingKey.signDigest(hashSpendV1SigHash(this.spend as Spend1V1));
      const pubB58 = cheetahPointToBase58(publicKeyFromBeBytes(signingKey.publicKey));
      const entry: [Digest, [string, { c: string; s: string }]] = [pkh, [pubB58, sig]];
      const sigs = this.spend.witness.pkh_signature;
      if (Array.isArray(sigs)) {
        const idx = sigs.findIndex(([h]) => h === pkh);
        if (idx >= 0) sigs[idx] = entry;
        else sigs.push(entry);
      }
      return true;
    }
    return false;
  }
}

export class TxBuilder {
  private spends: Map<string, SpendBuilder>;
  private feePool: SpendBuilder[];
  readonly settings: TxEngineSettings;

  constructor(settings: TxEngineSettings) {
    this.settings = settings;
    this.spends = new Map();
    this.feePool = [];
  }

  static fromRawTx(tx: RawTxV1, settings: TxEngineSettings): TxBuilder {
    const builder = new TxBuilder(settings);
    const spends = tx.spends as SpendsV1;
    for (const [name, spend] of spends) {
      const sb = SpendBuilder.fromSpend(name, spend, null);
      if (!sb) throw new Error("InvalidSpendCondition");
      builder.spends.set(nameKey(name), sb);
    }
    return builder;
  }

  static fromNockchainTx(tx: NockchainTx, settings: TxEngineSettings): TxBuilder {
    const rawSpends = applyWitness(tx.spends, tx.witness_data);
    const builder = new TxBuilder(settings);
    for (const [name, spend] of rawSpends) {
      const input = getDisplayInput(tx.display.inputs, name);
      if (input === undefined) throw new Error("InvalidSpendCondition");
      const sb = SpendBuilder.fromSpendAndInput(name, spend, input, null);
      if (!sb) throw new Error("InvalidSpendCondition");
      builder.spends.set(nameKey(name), sb);
    }
    return builder;
  }

  spend(spend: SpendBuilder): SpendBuilder | undefined {
    const key = nameKey(spend.noteInfo.name);
    const prev = this.spends.get(key);
    this.spends.set(key, spend);
    return prev;
  }

  allSpends(): SpendBuilder[] {
    return [...this.spends.values()];
  }

  curFee(): Nicks {
    let total = 0n;
    for (const sb of this.spends.values()) {
      if (sb.spend.tag === 1) total += BigInt(sb.spend.fee);
    }
    return String(total) as Nicks;
  }

  calcFee(): Nicks {
    const spends = [...this.spends.values()].map((s) => s.spend);
    let fee = calcFeeFromSpends(spends, this.settings);
    for (const sb of this.spends.values()) {
      fee += missingUnlocksFee(sb.spend, this.settings);
    }
    const minFee = BigInt(this.settings.min_fee);
    return String(fee > minFee ? fee : minFee) as Nicks;
  }

  simpleSpendBase(
    notes: [Note, [Lock, number] | null][],
    recipient: Digest,
    gift: Nicks,
    refundPkh: Digest,
    includeLockData: boolean,
    outputExtras?: OutputNoteData
  ): void {
    if (BigInt(gift) === 0n) throw new Error("Cannot create a transaction with zero gift");

    const refundLock: LockRoot = spendConditionNewPkh(pkhSingle(refundPkh));
    let remainingGift = BigInt(gift);

    for (const [note, spendCondition] of notes) {
      const noteAssets = BigInt("assets" in note ? note.assets : "0");
      const giftPortion = remainingGift < noteAssets ? remainingGift : noteAssets;
      remainingGift -= giftPortion;

      const lockInput = spendCondition;
      const mutSpend = SpendBuilder.new(
        note,
        lockInput?.[0] ?? null,
        lockInput?.[1] ?? null,
        refundLock
      );

      if (giftPortion > 0n) {
        const recipientLock: LockRoot = spendConditionNewPkh(pkhSingle(recipient));
        const seed = mutSpend.buildSeed(
          recipientLock,
          String(giftPortion) as Nicks,
          includeLockData,
          outputExtras
        );
        mutSpend.seed(seed);
        mutSpend.computeRefund(includeLockData);
        this.spend(mutSpend);
      } else {
        mutSpend.computeRefund(includeLockData);
        this.feePool.push(mutSpend);
      }
    }

    if (remainingGift > 0n) {
      throw new Error("Insufficient funds to pay fee and gift");
    }
  }

  simpleSpend(
    notes: Note[],
    locks: TxLock[],
    recipient: Digest,
    gift: Nicks,
    feeOverride: Nicks | null | undefined,
    refundPkh: Digest,
    includeLockData: boolean,
    outputExtras?: OutputNoteData
  ): void {
    if (notes.length !== locks.length) {
      throw new Error("notes and locks must have the same length");
    }
    const zipped: [Note, [Lock, number] | null][] = notes.map((n, i) => [
      n,
      [mustAt(locks, i).lock, mustAt(locks, i).lock_sp_index],
    ]);
    this.simpleSpendBase(zipped, recipient, gift, refundPkh, includeLockData, outputExtras);
    this.finishSimpleSpend(feeOverride, includeLockData);
  }

  /** Spend with explicit locks and per-note spend-condition indices (HTLC / multisig / timelock). */
  simpleSpendWithLocks(
    notes: Note[],
    locks: Lock[],
    lockSpIndices: number[],
    recipient: Digest,
    gift: Nicks,
    feeOverride: Nicks | null | undefined,
    refundPkh: Digest,
    includeLockData: boolean,
    options?: SimpleSpendLockOptions
  ): void {
    if (notes.length !== locks.length || notes.length !== lockSpIndices.length) {
      throw new Error("notes, locks, and lockSpIndices must have the same length");
    }
    const zipped: [Note, [Lock, number] | null][] = notes.map((n, i) => [
      n,
      [mustAt(locks, i), mustAt(lockSpIndices, i)],
    ]);
    this.simpleSpendBase(
      zipped,
      recipient,
      gift,
      refundPkh,
      includeLockData,
      options?.outputExtras
    );
    if (options?.preimageJam) {
      const digest = this.addPreimage(options.preimageJam);
      if (!digest) {
        throw new Error("preimage does not match any spend condition hax unlock");
      }
    }
    this.finishSimpleSpend(feeOverride, includeLockData);
  }

  /**
   * Spend HTLC-locked notes. `lockSpIndex` 0 = claim (requires `preimageJam`), 1 = refund.
   */
  simpleSpendHtlc(
    notes: Note[],
    locks: Lock[],
    lockSpIndex: number,
    recipient: Digest,
    gift: Nicks,
    feeOverride: Nicks | null | undefined,
    refundPkh: Digest,
    includeLockData: boolean,
    options?: SimpleSpendLockOptions
  ): void {
    if (lockSpIndex !== 0 && lockSpIndex !== 1) {
      throw new Error("HTLC lock_sp_index must be 0 (claim) or 1 (refund)");
    }
    if (lockSpIndex === 0 && !options?.preimageJam) {
      throw new Error("HTLC claim (lock_sp_index 0) requires options.preimageJam");
    }
    this.simpleSpendWithLocks(
      notes,
      locks,
      locks.map(() => lockSpIndex),
      recipient,
      gift,
      feeOverride,
      refundPkh,
      includeLockData,
      options
    );
  }

  /** Spend m-of-n multisig locks at `lockSpIndex` (0 for single-leaf multisig from `multisigLock`). */
  simpleSpendMultisig(
    notes: Note[],
    locks: Lock[],
    lockSpIndex: number,
    recipient: Digest,
    gift: Nicks,
    feeOverride: Nicks | null | undefined,
    refundPkh: Digest,
    includeLockData: boolean,
    outputExtras?: OutputNoteData
  ): void {
    this.simpleSpendWithLocks(
      notes,
      locks,
      locks.map(() => lockSpIndex),
      recipient,
      gift,
      feeOverride,
      refundPkh,
      includeLockData,
      outputExtras != null ? { outputExtras } : undefined
    );
  }

  private finishSimpleSpend(
    feeOverride: Nicks | null | undefined,
    includeLockData: boolean
  ): void {
    if (feeOverride != null) {
      this.setFeeAndBalanceRefund(feeOverride, false, includeLockData);
    } else {
      this.recalcAndSetFee(includeLockData);
    }
  }

  recalcAndSetFee(includeLockData: boolean): void {
    const fee = this.calcFee();
    this.setFeeAndBalanceRefund(fee, true, includeLockData);
  }

  setFeeAndBalanceRefund(fee: Nicks, adjustFee: boolean, includeLockData: boolean): void {
    const bythosActive =
      this.settings.tx_engine_version === 1 && this.settings.tx_engine_patch === 1;

    const refundCounts = new Map<string, number>();
    for (const s of this.spends.values()) {
      if (!s.refundLock) continue;
      const rlh = lockRootHash(s.refundLock);
      const refunds = s.spend.tag === 1
        ? s.spend.seeds.filter((v) => lockRootHash(v.lock_root) === rlh).length
        : 0;
      refundCounts.set(rlh, (refundCounts.get(rlh) ?? 0) + refunds);
    }

    const curFee = BigInt(this.curFee());
    const targetFee = BigInt(fee);

    if (curFee === targetFee) return;

    const spends = [...this.spends.values()];

    if (curFee < targetFee) {
      let feeLeft = targetFee - curFee;

      spends.sort((a, b) => {
        const anra =
          BigInt(a.noteInfo.assets) -
          BigInt(a.curRefund()?.gift ?? "0");
        const bnra =
          BigInt(b.noteInfo.assets) -
          BigInt(b.curRefund()?.gift ?? "0");
        if (anra !== bnra) return bnra > anra ? 1 : -1;
        const af = BigInt(a.spend.tag === 1 ? a.spend.fee : "0");
        const bf = BigInt(b.spend.tag === 1 ? b.spend.fee : "0");
        if (af !== bf) return bf > af ? 1 : -1;
        return compareNames(b.noteInfo.name, a.noteInfo.name);
      });

      for (const s of spends) {
        const rs = s.curRefund();
        if (!rs) continue;
        const subRefund = BigInt(rs.gift) < feeLeft ? BigInt(rs.gift) : feeLeft;
        if (subRefund > 0n) {
          const cur = BigInt(s.spend.tag === 1 ? s.spend.fee : "0");
          s.fee(String(cur + subRefund) as Nicks);
          feeLeft -= subRefund;
          s.computeRefund(includeLockData);
          if (adjustFee && !s.curRefund()) {
            const ndWords = noteDataFeeWords(rs.note_data);
            const rebate = feeLeft < BigInt(this.settings.cost_per_word) * ndWords
              ? feeLeft
              : BigInt(this.settings.cost_per_word) * ndWords;
            feeLeft -= rebate;
          }
        }
      }

      this.feePool.sort(
        (a, b) =>
          (BigInt(a.noteInfo.assets) > BigInt(b.noteInfo.assets) ? 1 : -1)
      );

      while (feeLeft > 0n) {
        const r = this.feePool.pop();
        if (!r) break;
        r.computeRefund(includeLockData);
        const rs = r.curRefund();
        if (!rs) throw new Error("Fee pool entry must have refund");

        if (adjustFee) {
          let [sw] = spendCalcWords(r.spend);
          const rsKey = lockRootHash(rs.lock_root);
          const refunds = refundCounts.get(rsKey) ?? 0;
          if (bythosActive && refunds > 0) sw = 0n;
          refundCounts.set(rsKey, refunds + 1);
          feeLeft +=
            BigInt(this.settings.cost_per_word) * sw +
            (BigInt(this.settings.cost_per_word) * spendCalcWords(r.spend)[1]) /
            BigInt(this.settings.witness_word_div);
          feeLeft += missingUnlocksFee(r.spend, this.settings);
        }

        const subRefund = BigInt(rs.gift) < feeLeft ? BigInt(rs.gift) : feeLeft;
        if (subRefund > 0n) {
          const cur = BigInt(r.spend.tag === 1 ? r.spend.fee : "0");
          r.fee(String(cur + subRefund) as Nicks);
          feeLeft -= subRefund;
          r.computeRefund(includeLockData);
        }
        this.spend(r);
      }

      if (feeLeft > 0n) {
        throw new Error("Insufficient funds to pay fee and gift");
      }
    } else {
      let refundLeft = curFee - targetFee;

      spends.sort((a, b) => {
        const anra =
          BigInt(a.noteInfo.assets) -
          BigInt(a.curRefund()?.gift ?? "0");
        const bnra =
          BigInt(b.noteInfo.assets) -
          BigInt(b.curRefund()?.gift ?? "0");
        const aor = a.spend.tag === 1 && a.spend.seeds.length === 1 && !!a.curRefund();
        const bor = b.spend.tag === 1 && b.spend.seeds.length === 1 && !!b.curRefund();
        if (aor !== bor) return bor ? 1 : -1;
        const af = BigInt(a.spend.tag === 1 ? a.spend.fee : "0");
        const bf = BigInt(b.spend.tag === 1 ? b.spend.fee : "0");
        if (af !== bf) return af > bf ? -1 : 1;
        if (anra !== bnra) return anra > bnra ? 1 : -1;
        return compareNames(b.noteInfo.name, a.noteInfo.name);
      });

      const returnToPool: Name[] = [];

      for (const s of spends) {
        if (!s.refundLock) continue;
        const rlh = lockRootHash(s.refundLock);
        const addRefund =
          BigInt(s.spend.tag === 1 ? s.spend.fee : "0") < refundLeft
            ? BigInt(s.spend.tag === 1 ? s.spend.fee : "0")
            : refundLeft;

        if (addRefund > 0n) {
          const cur = BigInt(s.spend.tag === 1 ? s.spend.fee : "0");
          s.fee(String(cur - addRefund) as Nicks);
          refundLeft -= addRefund;
          s.computeRefund(includeLockData);
        }

        if (BigInt(s.spend.tag === 1 ? s.spend.fee : "0") === addRefund) {
          returnToPool.push(s.noteInfo.name);
          const [swInit, ww] = spendCalcWords(s.spend);
          let sw = swInit;
          const refunds = refundCounts.get(rlh) ?? 0;
          if (bythosActive && refunds > 1) sw = 0n;
          refundCounts.set(rlh, Math.max(0, refunds - 1));
          let toRefund =
            BigInt(this.settings.cost_per_word) * sw +
            (BigInt(this.settings.cost_per_word) * ww) / BigInt(this.settings.witness_word_div);
          toRefund += missingUnlocksFee(s.spend, this.settings);
          refundLeft = refundLeft > toRefund ? refundLeft - toRefund : 0n;
        }
      }

      for (const note of returnToPool) {
        const sp = this.spends.get(nameKey(note));
        if (sp) {
          this.spends.delete(nameKey(note));
          this.feePool.push(sp);
        }
      }

      if (refundLeft > 0n) {
        throw new Error("Assets in must equal gift + fee + refund");
      }
    }
  }

  addPreimage(preimageJam: Uint8Array): Digest | undefined {
    let ret: Digest | undefined;
    for (const sb of this.spends.values()) {
      const r = sb.addPreimage(preimageJam);
      if (r !== undefined) ret = r;
    }
    return ret;
  }

  async sign(signingKey: PrivateKey): Promise<void> {
    for (const sb of this.spends.values()) {
      await sb.sign(signingKey);
    }
  }

  validate(): void {
    const curFee = BigInt(this.curFee());
    const neededFee = BigInt(this.calcFee());
    if (curFee < neededFee) {
      throw new Error(`InvalidFee: need ${neededFee}, have ${curFee}`);
    }
    for (const sb of this.spends.values()) {
      if (!sb.isBalanced()) {
        throw new Error("UnbalancedSpends");
      }
    }
    const unlocks = [...this.spends.values()].flatMap((sb) => sb.missingUnlocks());
    if (unlocks.length > 0) {
      throw new Error(`MissingUnlocks: ${JSON.stringify(unlocks)}`);
    }
  }

  build(): NockchainTx {
    const mixedInputs: [Name, SpendCondition][] = [];
    const outputs: [Digest, LockMetadata][] = [];
    const fullSpends: SpendsV1 = [];

    for (const sb of this.spends.values()) {
      const spend = structuredClone(sb.spend);
      // Seeds may have been added as loose objects (e.g. omitting output_source);
      // emit them in canonical Rust `SeedsV1` shape + ZSet order so the wasm /
      // wallet / node serde accepts the tx and the id is computed over the same
      // bytes everyone else sees.
      if (spend.tag === 1) spend.seeds = canonicalSeedsV1(spend.seeds);
      fullSpends.push([sb.noteInfo.name, spend]);

      if (spend.tag === 1) {
        const sc = spendConditionFromLmp(spend.witness.lock_merkle_proof);
        mixedInputs.push([sb.noteInfo.name, sc]);
        for (const seed of spend.seeds) {
          const lock = lockFromLockRoot(seed.lock_root);
          if (lock) {
            const h = lockRootHash(seed.lock_root);
            outputs.push([h, { lock, include_data: false }]);
          }
        }
      }
    }

    const id = rawTxV1CalcId({ version: 1, id: "" as Digest, spends: fullSpends });
    const { spends, witnessData } = splitWitness(fullSpends);

    const inputs: InputDisplay = { tag: 1, inputs: mixedInputs };

    return {
      version: 1,
      id,
      spends,
      display: { inputs, outputs },
      witness_data: witnessData,
    };
  }
}