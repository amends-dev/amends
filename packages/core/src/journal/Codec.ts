/**
 * How log values become stored bytes and back. Every payload is encoded in the binary format
 * `SchemaBinary.toCodec` derives from its schema, a persistence contract: stored bytes must stay
 * readable when dependencies change. An ordinary log stores its whole value through
 * `makeEntryCodec`; the journal stores a fact's header beside its payload through
 * `Event.storageCodec`, and encodes the payload alone with `make`.
 *
 * @since 0.1.0
 */
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as SchemaBinary from "effect/encoding/SchemaBinary";
import type * as Fact from "./Fact.ts";
import type * as Store from "./Store.ts";

/**
 * How one log's values map to the `Store.Content` storage keeps, and back, with the services its
 * schema needs to encode and decode. `Log.open` takes one, and defaults to `makeEntryCodec`.
 *
 * @category models
 * @since 0.1.0
 */
export interface EntryCodec<S extends Schema.Constraint> {
  readonly encode: (
    value: S["Type"],
  ) => Effect.Effect<Store.Content, Schema.SchemaError, S["EncodingServices"]>;
  readonly decode: (
    entry: Store.Content,
  ) => Effect.Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]>;
}

/**
 * The entry codec of an ordinary log: the whole value is the payload, encoded with
 * `makeForSchema`, and an entry has no fact header. Decoding an entry that has one fails, so a fact
 * log opened with this codec is never misread.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeEntryCodec = <S extends Schema.Constraint>(schema: S): EntryCodec<S> => {
  const codec = makeForSchema(schema);
  return {
    encode: (value) => Effect.map(codec.encode(value), (payload) => ({ payload })),
    decode: Effect.fn("Codec.decodeEntry")(function* (entry) {
      yield* Schema.decodeUnknownEffect(Schema.Undefined)(entry.fact);
      return yield* codec.decode(entry.payload);
    }),
  };
};

/**
 * Encodes one schema's values to bytes and decodes them back, in the binary format every log's
 * payloads share.
 *
 * @category models
 * @since 0.1.0
 */
export interface PayloadCodec<S extends Schema.Constraint> {
  /** Produces an independently owned byte buffer for storage. */
  readonly encode: (
    payload: S["Type"],
  ) => Effect.Effect<Uint8Array<ArrayBuffer>, Schema.SchemaError, S["EncodingServices"]>;
  /** Validates stored bytes and reconstructs the decoded domain payload. */
  readonly decode: (
    bytes: Uint8Array,
  ) => Effect.Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]>;
}

/**
 * A payload codec paired with the fact definition it encodes.
 *
 * @category models
 * @since 0.1.0
 */
export interface FactCodec<F extends Fact.Definition> extends PayloadCodec<F["payload"]> {
  readonly fact: F;
}

/**
 * The binary payload codec of `payload`, from `SchemaBinary.toCodec`, keeping the services the
 * schema needs to encode and decode. Encoding returns a copy, so stored bytes never share the
 * encoder's buffer.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeForSchema = <S extends Schema.Constraint>(payload: S): PayloadCodec<S> => {
  const schema = SchemaBinary.toCodec(payload);
  const encode = Schema.encodeEffect(schema);
  const decode = Schema.decodeUnknownEffect(schema);

  return {
    encode: Effect.fn("Codec.encode")(function* (payload: S["Type"]) {
      const bytes = yield* encode(payload);
      // SchemaBinary can return a view into a shared encoding arena.
      return bytes.slice();
    }),
    decode: Effect.fn("Codec.decode")(function* (bytes: Uint8Array) {
      return yield* decode(bytes);
    }),
  };
};

/**
 * The codec of a fact's payload, in the binary format every log's payloads share.
 * `Journal.publish` encodes with it, and `Event.decode` decodes with it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = <F extends Fact.Definition>(fact: F): FactCodec<F> => ({
  fact,
  ...makeForSchema<F["payload"]>(fact.payload),
});
