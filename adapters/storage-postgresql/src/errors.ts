import type { Schema } from "effect";
import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Cause, Option } from "effect";
import { SqlError } from "effect/unstable/sql";

/** The client's classification of a failed statement, whether Drizzle or the client raised it. */
export const sqlError = (error: unknown): SqlError.SqlError | undefined => {
  if (error instanceof SqlError.SqlError) return error;
  if (error instanceof EffectDrizzleQueryError) {
    const failure = Cause.isCause(error.cause) ? Cause.findErrorOption(error.cause) : Option.none();
    return Option.isSome(failure) ? sqlError(failure.value) : undefined;
  }
  return undefined;
};

/** A row the database refused: a duplicate key, a foreign key, or a check. */
export const isConstraintViolation = (error: unknown): boolean => {
  const reason = sqlError(error)?.reason._tag;
  return reason === "UniqueViolation" || reason === "ConstraintError";
};

/** Another writer holds what this transaction needs; the operation did not apply. */
export const isContention = (error: unknown): boolean => {
  const reason = sqlError(error)?.reason._tag;
  return reason === "LockTimeoutError" || reason === "SerializationError";
};

/** Every core store declares this pair; the constructors take the same fields. */
export interface StoreErrors<C, F> {
  readonly Conflict: new (fields: { readonly operation: string; readonly message: string }) => C;
  readonly Failure: new (fields: { readonly operation: string; readonly cause: unknown }) => F;
}

/** Reject invalid write input before any statement changes stored state. */
export const storeConflict =
  <C>(errors: Pick<StoreErrors<C, never>, "Conflict">, operation: string) =>
  (cause: Schema.SchemaError): C =>
    new errors.Conflict({ operation, message: cause.message });

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
