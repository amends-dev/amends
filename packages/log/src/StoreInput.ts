/**
 * What every store checks of its input before its driver sees it: that the input matches its
 * schema, and whatever else the store requires of a write, such as that a record belongs to the
 * space the store is bound to. A caller passes typed values, but a TypeScript type does not enforce
 * a schema's refinements, so each store decodes what it is given once, here, and its driver trusts
 * it.
 *
 * @since 0.2.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as StoreError from "./StoreError.ts"

/**
 * The decoders, compiled once per schema.
 */
const decoders = new WeakMap<Schema.Top, (input: unknown) => Effect.Effect<unknown, Schema.SchemaError>>()
const decoder = <S extends Schema.Top>(schema: S) => {
  let decode = decoders.get(schema)
  if (decode === undefined) {
    decode = Schema.decodeUnknownEffect(Schema.toType(schema))
    decoders.set(schema, decode)
  }
  return decode as (input: S["Type"]) => Effect.Effect<S["Type"], Schema.SchemaError>
}

/**
 * A read's inputs, checked against their schemas; a malformed one fails the read.
 *
 * @category constructors
 * @since 0.2.0
 */
export const read =
  (store: string) =>
  <S extends Schema.Top>(operation: string, schema: S, input: S["Type"]) =>
    decoder(schema)(input).pipe(Effect.mapError(StoreError.failed(store, operation)))

/**
 * A write's inputs, checked against their schemas; a malformed one is rejected. `reject` says
 * why a well-formed input is still refused, such as a record of another space, or nothing to
 * accept it.
 *
 * @category constructors
 * @since 0.2.0
 */
export const write =
  (store: string, reject?: (value: unknown) => string | undefined) =>
  <S extends Schema.Top>(operation: string, schema: S, input: S["Type"]) =>
    decoder(schema)(input).pipe(
      Effect.mapError((cause) => StoreError.rejected(store, operation, cause.message)),
      Effect.filterOrFail(
        (value) => reject === undefined || reject(value) === undefined,
        (value) => StoreError.rejected(store, operation, reject?.(value) ?? "Rejected")
      )
    )
