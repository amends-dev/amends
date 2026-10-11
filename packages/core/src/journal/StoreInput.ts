/**
 * What every store checks of its input before its driver sees it: that the input matches its
 * schema, and that a record names the workspace the store is bound to. Core calls a store with
 * typed values, but a TypeScript type does not enforce a schema's refinements, so each store
 * decodes what it is given once, here, and its driver trusts it.
 *
 * @since 0.1.0
 */
import { Effect, Schema } from "effect";
import type { WorkspaceId } from "../workspace/id.ts";

/**
 * The decoders, compiled once per schema.
 */
const decoders = new WeakMap<
  Schema.Top,
  (input: unknown) => Effect.Effect<unknown, Schema.SchemaError>
>();
const decoder = <S extends Schema.Top>(schema: S) => {
  let decode = decoders.get(schema);
  if (decode === undefined) {
    decode = Schema.decodeUnknownEffect(Schema.toType(schema));
    decoders.set(schema, decode);
  }
  return decode as (input: S["Type"]) => Effect.Effect<S["Type"], Schema.SchemaError>;
};

/** Does the value, or any value in it, name another workspace? */
const foreign = (value: unknown, workspaceId: WorkspaceId.Id): boolean =>
  Array.isArray(value)
    ? value.some((item) => foreign(item, workspaceId))
    : typeof value === "object" &&
      value !== null &&
      "workspaceId" in value &&
      value.workspaceId !== workspaceId;

/**
 * A read's inputs, checked against their schemas; a malformed one fails the read.
 *
 * @category constructors
 * @since 0.1.0
 */
export const read =
  <F>(Failure: new (fields: { readonly operation: string; readonly cause: unknown }) => F) =>
  <S extends Schema.Top>(operation: string, schema: S, input: S["Type"]) =>
    decoder(schema)(input).pipe(Effect.mapError((cause) => new Failure({ operation, cause })));

/**
 * A write's inputs, checked against their schemas; a malformed one conflicts, and so does a
 * record of another workspace.
 *
 * @category constructors
 * @since 0.1.0
 */
export const write =
  <C>(
    Conflict: new (fields: { readonly operation: string; readonly message: string }) => C,
    workspaceId: WorkspaceId.Id,
  ) =>
  <S extends Schema.Top>(operation: string, schema: S, input: S["Type"]) =>
    decoder(schema)(input).pipe(
      Effect.mapError((cause) => new Conflict({ operation, message: cause.message })),
      Effect.filterOrFail(
        (value) => !foreign(value, workspaceId),
        () => new Conflict({ operation, message: "Expected a record in this workspace" }),
      ),
    );

export * as StoreInput from "./StoreInput.ts";
