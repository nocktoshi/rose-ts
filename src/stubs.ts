/** Thrown by unimplemented exports until parity tests go green. */
export class NotImplementedError extends Error {
  readonly feature: string;

  constructor(feature: string) {
    super(`@nockchain/rose-ts: not implemented — ${feature}`);
    this.name = 'NotImplementedError';
    this.feature = feature;
  }
}

export const notImplemented = (feature: string): never => {
  throw new NotImplementedError(feature);
};
