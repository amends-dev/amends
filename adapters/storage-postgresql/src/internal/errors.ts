import { EffectDrizzleQueryError } from "drizzle-orm/effect-core";
import { Cause, Option } from "effect";
import { SqlError } from "effect/sql";
import { StoreError } from "@amends-dev/core/journal";

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
  return (
    reason === "LockTimeoutError" || reason === "SerializationError" || reason === "DeadlockError"
  );
};

/**
 * Report a write's failure as the store's: a row the database refused is rejected, anything else
 * failed. Pass the store's name and the operation straight to Effect.mapError.
 */
export const storeError =
  (store: string, operation: string) =>
  (cause: unknown): StoreError.StoreError =>
    isConstraintViolation(cause)
      ? StoreError.rejected(
          store,
          operation,
          cause instanceof Error ? cause.message : String(cause),
        )
      : StoreError.failed(store, operation)(cause);

/**
 * Report a write's failure where a row the database refused is one another writer stored first, as
 * a log's batches and receipts and a projection's checkpoints are: contention, which asking again
 * gets past. Anything else failed.
 */
export const raceError =
  (store: string, operation: string) =>
  (cause: unknown): StoreError.StoreError =>
    isConstraintViolation(cause)
      ? StoreError.contended(
          store,
          operation,
          cause instanceof Error ? cause.message : String(cause),
        )
      : StoreError.failed(store, operation)(cause);
