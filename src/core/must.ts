/** Narrow `T | null | undefined` after an invariant the type system cannot see. */
export const must = <T>(value: T | null | undefined, message?: string): T => {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'expected value');
  }
  return value;
};

/** Indexed access when length/range was checked separately. */
export const mustAt = <T>(
  arr: ArrayLike<T>,
  index: number,
  message?: string,
): T => {
  const value = arr[index];
  if (value === undefined) {
    throw new Error(message ?? `expected element at index ${index}`);
  }
  return value;
};
