import { SqlError } from "effect/unstable/sql";

/** A row the database refused: a duplicate key or a check. */
export const isConstraintViolation = (error: unknown): boolean =>
  error instanceof SqlError.SqlError &&
  (error.reason._tag === "UniqueViolation" || error.reason._tag === "ConstraintError");

/** Another writer holds the database; the operation did not apply. */
export const isContention = (error: unknown): boolean =>
  error instanceof SqlError.SqlError &&
  (error.reason._tag === "LockTimeoutError" || error.reason._tag === "SerializationError");

/** Every core store declares this pair; the constructors take the same fields. */
export interface StoreErrors<C, F> {
  readonly Conflict: new (fields: { readonly operation: string; readonly message: string }) => C;
  readonly Failure: new (fields: { readonly operation: string; readonly cause: unknown }) => F;
}

/** Report a read's failure as the store's own failure; reads never conflict. */
export const storeFailure =
  <F>(errors: Pick<StoreErrors<never, F>, "Failure">, operation: string) =>
  (cause: unknown): F =>
    new errors.Failure({ operation, cause });

/**
 * Report a write's failure as the store's own error: a row the database
 * refused is a conflict the caller can act on, anything else is a failure.
 * Pass the store's module and the operation straight to Effect.mapError.
 */
export const storeError =
  <C, F>(errors: StoreErrors<C, F>, operation: string) =>
  (cause: unknown): C | F =>
    isConstraintViolation(cause)
      ? new errors.Conflict({
          operation,
          message: cause instanceof Error ? cause.message : String(cause),
        })
      : new errors.Failure({ operation, cause });
