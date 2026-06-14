import {badd, bmul, bneg, bsub, binv, type Belt} from '../core/belt.js';
import {mustAt} from '../core/must.js';

const MAX_POLY_SIZE = 7;

const bdiv = (a: Belt, b: Belt): Belt => bmul(a, binv(b));

const degree = (data: Belt[]): number => {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i] !== 0n) return i;
  }
  return 0;
};

const isZero = (data: Belt[]): boolean => data.every(x => x === 0n);

const bpsub = (a: Belt[], b: Belt[], res: Belt[]): void => {
  const resLen = Math.max(a.length, b.length);
  for (let i = 0; i < resLen; i++) {
    if (i < a.length && i < b.length) {
      res[i] = bsub(mustAt(a, i), mustAt(b, i));
    } else if (i < a.length) {
      res[i] = mustAt(a, i);
    } else {
      res[i] = bneg(mustAt(b, i));
    }
  }
};

const bpmul = (a: Belt[], b: Belt[], res: Belt[]): void => {
  res.fill(0n);
  if (isZero(a) || isZero(b)) return;
  for (let i = 0; i < a.length; i++) {
    if (a[i] === 0n) continue;
    for (let j = 0; j < b.length; j++) {
      res[i + j] = badd(res[i + j] ?? 0n, bmul(mustAt(a, i), mustAt(b, j)));
    }
  }
};

const bpdvr = (a: Belt[], b: Belt[], q: Belt[], res: Belt[]): void => {
  if (isZero(a)) {
    q.fill(0n);
    res.fill(0n);
    return;
  }
  if (isZero(b)) throw new Error('divide by zero');

  q.fill(0n);
  res.fill(0n);

  const aEnd = degree(a);
  const r = [...a.slice(0, aEnd + 1)];
  const degB = degree(b);
  let i = aEnd;
  const endB = degB;
  let degR = degree(r);
  let qIndex = degR - degB;

  while (degR >= degB) {
    const coeff = bdiv(mustAt(r, i), mustAt(b, endB));
    q[qIndex] = coeff;
    for (let k = 0; k <= degB; k++) {
      const index = k;
      if (k <= aEnd && k < b.length && k <= i) {
        r[i - index] = bsub(
          mustAt(r, i - index),
          bmul(coeff, mustAt(b, endB - index)),
        );
      }
    }
    degR = Math.max(0, degR - 1);
    qIndex = Math.max(0, qIndex - 1);
    if (degR === 0 && r[0] === 0n) break;
    i -= 1;
  }

  const rLen = degR + 1;
  for (let j = 0; j < rLen; j++) res[j] = mustAt(r, j);
};

export const bpegcd = (
  a: Belt[],
  b: Belt[],
  d: Belt[],
  u: Belt[],
  v: Belt[],
): void => {
  let m1u: Belt[] = [0n];
  let m2u: Belt[] = [1n];
  let m1v: Belt[] = [1n];
  let m2v: Belt[] = [0n];

  d.fill(0n);
  u.fill(0n);
  v.fill(0n);

  let aa = [...a];
  let bb = [...b];

  while (!isZero(bb)) {
    const degA = degree(aa);
    const degB = degree(bb);
    const lenQ = degA - degB + 1;
    const lenR = degB + 1;
    const q = new Array<Belt>(MAX_POLY_SIZE).fill(0n);
    const r = new Array<Belt>(MAX_POLY_SIZE).fill(0n);

    bpdvr(aa, bb, q, r);

    const newA = bb.slice(0, lenR);
    const newB = r.slice(0, lenR);

    const res1 = new Array<Belt>(MAX_POLY_SIZE).fill(0n);
    bpmul(q.slice(0, lenQ), m1u, res1);

    const res2 = new Array<Belt>(MAX_POLY_SIZE).fill(0n);
    bpsub(m2u, res1, res2);
    m2u = [...m1u];
    m1u = [...res2];

    bpmul(q.slice(0, lenQ), m1v, res1);
    const res3 = new Array<Belt>(MAX_POLY_SIZE).fill(0n);
    bpsub(m2v, res1, res3);
    m2v = [...m1v];
    m1v = [...res3];

    aa = newA;
    bb = newB;
  }

  const aLen = degree(aa) + 1;
  for (let i = 0; i < aLen; i++) d[i] = mustAt(aa, i);

  for (let i = 0; i < m2u.length && i < u.length; i++) u[i] = mustAt(m2u, i);
  for (let i = 0; i < m2v.length && i < v.length; i++) v[i] = mustAt(m2v, i);
};
