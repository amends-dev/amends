import type { Schema } from "effect";

/** Every core store declares this pair; the constructors take the same fields. */
export interface StoreErrors<C, F> {
  readonly Conflict: new (fields: { readonly operation: string; readonly message: string }) => C;
  readonly Failure: new (fields: { readonly operation: string; readonly cause: unknown }) => F;
}

/** Reject invalid write input before any state changes. */
export const storeConflict =
  <C>(errors: Pick<StoreErrors<C, never>, "Conflict">, operation: string) =>
  (cause: Schema.SchemaError): C =>
    new errors.Conflict({ operation, message: cause.message });

/** Report a read's failure, or a write's unexpected one, as the store's own failure. */
export const storeFailure =
  <F>(errors: Pick<StoreErrors<never, F>, "Failure">, operation: string) =>
  (cause: unknown): F =>
    new errors.Failure({ operation, cause });
