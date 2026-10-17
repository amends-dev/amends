/**
 * What every store checks of its input before its driver sees it: that the input matches its
 * schema, and that a record names the workspace the store is bound to. Core calls a store with
 * typed values, but a TypeScript type does not enforce a schema's refinements, so each store
 * decodes what it is given once, here, and its driver trusts it.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
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

/** Does the value, or any value in it, name another workspace? */
const foreign = (value: unknown, workspaceId: WorkspaceId.WorkspaceId): boolean =>
  Array.isArray(value)
    ? value.some((item) => foreign(item, workspaceId))
    : typeof value === "object" && value !== null && "workspaceId" in value && value.workspaceId !== workspaceId

/**
 * A read's inputs, checked against their schemas; a malformed one fails the read.
 *
 * @category constructors
 * @since 0.1.0
 */
export const read =
  (store: string) =>
  <S extends Schema.Top>(operation: string, schema: S, input: S["Type"]) =>
    decoder(schema)(input).pipe(Effect.mapError(StoreError.failed(store, operation)))

/**
 * A write's inputs, checked against their schemas; a malformed one is rejected. Given the store's
 * workspace, a record of another workspace is rejected too; a store whose inputs name no
 * workspace, as the checkpoint store's, gives none.
 *
 * @category constructors
 * @since 0.1.0
 */
export const write =
  (store: string, workspaceId?: WorkspaceId.WorkspaceId) =>
  <S extends Schema.Top>(operation: string, schema: S, input: S["Type"]) =>
    decoder(schema)(input).pipe(
      Effect.mapError((cause) => StoreError.rejected(store, operation, cause.message)),
      Effect.filterOrFail(
        (value) => workspaceId === undefined || !foreign(value, workspaceId),
        () => StoreError.rejected(store, operation, "Expected a record in this workspace")
      )
    )
