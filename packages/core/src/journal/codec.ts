import { Effect, Schema } from "effect";
import { SchemaBinary } from "effect/encoding";
import type { Fact } from "./fact.ts";
import type { Store } from "./store.ts";

/** Maps a log's values to structured storage content, retaining schema requirements. */
export interface EntryCodec<S extends Schema.Constraint> {
  readonly encode: (
    value: S["Type"],
  ) => Effect.Effect<Store.Content, Schema.SchemaError, S["EncodingServices"]>;
  readonly decode: (
    entry: Store.Content,
  ) => Effect.Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]>;
}

/** Ordinary logs encode their entire value and have no fact metadata. */
export const makeEntryCodec = <S extends Schema.Constraint>(schema: S): EntryCodec<S> => {
  const codec = makeForSchema(schema);
  return {
    encode: (value) => Effect.map(codec.encode(value), (payload) => ({ payload })),
    decode: Effect.fn("LogCodec.decodeEntry")(function* (entry) {
      yield* Schema.decodeUnknownEffect(Schema.Undefined)(entry.fact);
      return yield* codec.decode(entry.payload);
    }),
  };
};

/** The same schema-derived payload format is used by every kind of log. */
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

/** A payload codec paired with the fact definition it encodes. */
export interface FactCodec<F extends Fact.Definition> extends PayloadCodec<F["payload"]> {
  readonly fact: F;
}

/**
 * Construct a binary codec from a payload schema, preserving its encoding and decoding requirements.
 *
 * @category constructors
 */
export const makeForSchema = <S extends Schema.Constraint>(payload: S): PayloadCodec<S> => {
  const schema = SchemaBinary.toCodec(payload);
  const encode = Schema.encodeEffect(schema);
  const decode = Schema.decodeUnknownEffect(schema);

  return {
    encode: Effect.fn("LogCodec.encode")(function* (payload: S["Type"]) {
      const bytes = yield* encode(payload);
      // SchemaBinary can return a view into a shared encoding arena.
      return bytes.slice();
    }),
    decode: Effect.fn("LogCodec.decode")(function* (bytes: Uint8Array) {
      return yield* decode(bytes);
    }),
  };
};

/**
 * Construct a fact codec using the same binary format as other log payloads.
 *
 * @category constructors
 */
export const make = <F extends Fact.Definition>(fact: F): FactCodec<F> => ({
  fact,
  ...makeForSchema<F["payload"]>(fact.payload),
});

export * as Codec from "./codec.ts";
