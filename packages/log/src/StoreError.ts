/**
 * How every storage contract fails: one `StoreError` naming the store and the operation, whose
 * `reason` says what happened. Storage that failed is `Failed`, with its cause; a write that
 * disagrees with what is stored, such as a malformed or foreign record, a reused ID, or an
 * idempotency key recorded with other content, is `Rejected`; and storage another writer held or
 * changed meanwhile, which asking again may get past, is `Contended`. A caller answers contention
 * by asking again, or by telling its own caller that storage is busy, and treats the rest as
 * defects.
 *
 * @since 0.2.0
 */

import * as Schema from "effect/Schema"

/**
 * Storage failed while reading or writing, for the `cause` given.
 *
 * @category errors
 * @since 0.2.0
 */
export class Failed extends Schema.TaggedError<Failed>()("Failed", {
  cause: Schema.Defect()
}) {
  override get message(): string {
    return this.cause instanceof Error ? this.cause.message : String(this.cause)
  }
}

/**
 * The write disagrees with what is stored or with the workspace, as `description` says: a
 * malformed or foreign input, a reused ID, a missing record, or an idempotency key recorded with
 * other content. Nothing was written.
 *
 * @category errors
 * @since 0.2.0
 */
export class Rejected extends Schema.TaggedError<Rejected>()("Rejected", {
  description: Schema.String
}) {
  override get message(): string {
    return this.description
  }
}

/**
 * Another writer held storage, or changed what the write expected, meanwhile, as `description`
 * says. Nothing was written, and asking again may get past it.
 *
 * @category errors
 * @since 0.2.0
 */
export class Contended extends Schema.TaggedError<Contended>()("Contended", {
  description: Schema.String
}) {
  override get message(): string {
    return this.description
  }
}

/**
 * Why a store's operation failed: one of the reasons above.
 *
 * @category schemas
 * @since 0.2.0
 */
export const Reason = Schema.Union([Failed, Rejected, Contended]).pipe(Schema.toTaggedUnion("_tag"))

/**
 * @category schemas
 * @since 0.2.0
 */
export type Reason = typeof Reason.Type

/**
 * A store's operation failed, for the `reason` given. `store` and `operation` name where, as
 * `ThreadStore` and `insert`.
 *
 * @category errors
 * @since 0.2.0
 */
export class StoreError extends Schema.TaggedError<StoreError>()("StoreError", {
  store: Schema.String,
  operation: Schema.String,
  reason: Reason
}) {
  override get message(): string {
    return `${this.store}.${this.operation}: ${this.reason.message}`
  }
}

/**
 * Whether `u` is a store's error.
 *
 * @category guards
 * @since 0.2.0
 */
export const isStoreError: (u: unknown) => u is StoreError = Schema.is(StoreError)

/**
 * Report a cause as the store's failed operation, for `Effect.mapError`. A cause that is already a
 * store's error, such as the workspace binding's, keeps its reason, so contention stays contention.
 *
 * @category constructors
 * @since 0.2.0
 */
export const failed =
  (store: string, operation: string) =>
  (cause: unknown): StoreError =>
    new StoreError({
      store,
      operation,
      reason: isStoreError(cause) ? cause.reason : new Failed({ cause })
    })

/**
 * The store's operation refused a write, as `description` says.
 *
 * @category constructors
 * @since 0.2.0
 */
export const rejected = (store: string, operation: string, description: string): StoreError =>
  new StoreError({ store, operation, reason: new Rejected({ description }) })

/**
 * Another writer held or changed what the store's operation needed, as `description` says.
 *
 * @category constructors
 * @since 0.2.0
 */
export const contended = (store: string, operation: string, description: string): StoreError =>
  new StoreError({ store, operation, reason: new Contended({ description }) })
