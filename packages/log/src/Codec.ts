/**
 * How log values become stored bytes and back. Every payload is encoded in the binary format
 * `SchemaBinary.toCodec` derives from its schema, a persistence contract: stored bytes must stay
 * readable when dependencies change. An ordinary log stores its whole value through
 * `makeEntryCodec`; a log whose entries carry a name or subject beside the payload, which storage
 * indexes, gives `Log.open` an entry codec of its own over `makeForSchema`.
 *
 * @since 0.2.0
 */

import * as Effect from "effect/Effect"
import * as SchemaBinary from "effect/encoding/SchemaBinary"
import * as Schema from "effect/Schema"
import type * as Store from "./Store.ts"

/**
 * How one log's values map to the `Store.Content` storage keeps, and back, with the services its
 * schema needs to encode and decode. `Log.open` takes one, and defaults to `makeEntryCodec`.
 *
 * @category models
 * @since 0.2.0
 */
export interface EntryCodec<S extends Schema.Constraint> {
  readonly encode: (value: S["Type"]) => Effect.Effect<Store.Content, Schema.SchemaError, S["EncodingServices"]>
  readonly decode: (entry: Store.Content) => Effect.Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]>
}

/**
 * The entry codec of an ordinary log: the whole value is the payload, encoded with
 * `makeForSchema`, and an entry has neither name nor subject. Decoding an entry that has either
 * fails, so a log whose entries carry them is never misread through this codec.
 *
 * @category constructors
 * @since 0.2.0
 */
export const makeEntryCodec = <S extends Schema.Constraint>(schema: S): EntryCodec<S> => {
  const codec = makeForSchema(schema)
  const unnamed = Schema.decodeUnknownEffect(Schema.Undefined)
  return {
    encode: (value) => Effect.map(codec.encode(value), (payload) => ({ payload })),
    decode: Effect.fn("Codec.decodeEntry")(function* (entry) {
      yield* unnamed(entry.name ?? entry.subject)
      return yield* codec.decode(entry.payload)
    })
  }
}

/**
 * Encodes one schema's values to bytes and decodes them back, in the binary format every log's
 * payloads share.
 *
 * @category models
 * @since 0.2.0
 */
export interface PayloadCodec<S extends Schema.Constraint> {
  /** Produces an independently owned byte buffer for storage. */
  readonly encode: (
    payload: S["Type"]
  ) => Effect.Effect<Uint8Array<ArrayBuffer>, Schema.SchemaError, S["EncodingServices"]>
  /** Validates stored bytes and reconstructs the decoded value. */
  readonly decode: (bytes: Uint8Array) => Effect.Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]>
}

/**
 * The binary payload codec of `payload`, from `SchemaBinary.toCodec`, keeping the services the
 * schema needs to encode and decode. Encoding returns a copy, so stored bytes never share the
 * encoder's buffer.
 *
 * @category constructors
 * @since 0.2.0
 */
export const makeForSchema = <S extends Schema.Constraint>(payload: S): PayloadCodec<S> => {
  const schema = SchemaBinary.toCodec(payload)
  const encode = Schema.encodeEffect(schema)
  const decode = Schema.decodeUnknownEffect(schema)

  return {
    encode: Effect.fn("Codec.encode")(function* (payload: S["Type"]) {
      const bytes = yield* encode(payload)
      // SchemaBinary can return a view into a shared encoding arena.
      return bytes.slice()
    }),
    decode: Effect.fn("Codec.decode")(function* (bytes: Uint8Array) {
      return yield* decode(bytes)
    })
  }
}
