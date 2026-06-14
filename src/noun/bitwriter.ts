/** LSB-first bit writer for jam encoding. */

import {mustAt} from '../core/must.js';

export class BitWriter {
  private buf: number[] = [];
  private acc = 0;
  private nbits = 0;
  private bitLenCount = 0;

  bitLen(): number {
    return this.bitLenCount;
  }

  writeBit(bit: boolean): void {
    if (bit) {
      this.acc |= 1 << this.nbits;
    }
    this.nbits++;
    this.bitLenCount++;
    if (this.nbits === 8) {
      this.flushAcc();
    }
  }

  writeZeros(count: number): void {
    let remaining = count;
    if (this.nbits !== 0) {
      const space = 8 - this.nbits;
      if (remaining < space) {
        const mask = (1 << this.nbits) - 1;
        this.acc &= mask;
        this.nbits += remaining;
        this.bitLenCount += remaining;
        return;
      }
      const mask = (1 << this.nbits) - 1;
      this.acc &= mask;
      this.nbits = 8;
      this.bitLenCount += space;
      remaining -= space;
      this.flushAcc();
    }
    const fullBytes = Math.floor(remaining / 8);
    if (fullBytes > 0) {
      for (let i = 0; i < fullBytes; i++) this.buf.push(0);
      this.bitLenCount += fullBytes * 8;
      remaining -= fullBytes * 8;
    }
    this.nbits = remaining;
    this.acc = 0;
    this.bitLenCount += remaining;
  }

  writeBitsFromValue(value: number, count: number): void {
    let v = value;
    for (let i = 0; i < count; i++) {
      this.writeBit((v & 1) === 1);
      v >>= 1;
    }
  }

  writeBitsFromLeBytes(bytes: Uint8Array, totalBits: number): void {
    if (totalBits === 0) return;

    const fullBytes = Math.floor(totalBits / 8);
    const remBits = totalBits % 8;

    if (this.nbits === 0) {
      if (fullBytes > 0) {
        for (let i = 0; i < fullBytes; i++) this.buf.push(mustAt(bytes, i));
        this.bitLenCount += fullBytes * 8;
      }
    } else if (fullBytes > 0) {
      const shift = this.nbits;
      let carry = this.acc;
      for (let i = 0; i < fullBytes; i++) {
        const byte = mustAt(bytes, i);
        const combined = carry | (byte << shift);
        this.buf.push(combined & 0xff);
        this.bitLenCount += 8;
        carry = byte >> (8 - shift);
      }
      this.acc = carry;
    }

    if (remBits > 0) {
      const srcByte = fullBytes < bytes.length ? mustAt(bytes, fullBytes) : 0;
      for (let i = 0; i < remBits; i++) {
        this.writeBit(((srcByte >> i) & 1) === 1);
      }
    }
  }

  private flushAcc(): void {
    if (this.nbits === 0) return;
    this.buf.push(this.acc & 0xff);
    this.acc = 0;
    this.nbits = 0;
  }

  intoVec(): Uint8Array {
    if (this.nbits > 0) this.flushAcc();
    return new Uint8Array(this.buf);
  }
}
