/**
 * Report a memory store's failure, a read's or a write's unexpected one, as the store's own
 * failure: every store contract declares a `Failure` taking the operation and its cause.
 */
export const storeFailure =
  <F>(
    Failure: new (fields: { readonly operation: string; readonly cause: unknown }) => F,
    operation: string,
  ) =>
  (cause: unknown): F =>
    new Failure({ operation, cause });
