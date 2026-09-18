import { Effect, Schema } from "effect";
import { SchemaBinary } from "effect/unstable/encoding";
import type { Fact } from "./fact.ts";

/** The same schema-derived payload format is used by every kind of log. */
export interface Value<S extends Schema.Constraint> {
  /** Produces an independently owned byte buffer for storage. */
  readonly encode: (
    payload: S["Type"],
  ) => Effect.Effect<Uint8Array<ArrayBuffer>, Schema.SchemaError, S["EncodingServices"]>;
  /** Validates stored bytes and reconstructs the decoded domain payload. */
  readonly decode: (
    bytes: Uint8Array,
  ) => Effect.Effect<S["Type"], Schema.SchemaError, S["DecodingServices"]>;
}

export interface Interface<F extends Fact.Definition> extends Value<F["payload"]> {
  readonly fact: F;
}

/**
 * Construct a binary codec from a payload schema, preserving its encoding and decoding requirements.
 *
 * @category constructors
 */
export const makeForSchema = <S extends Schema.Constraint>(payload: S): Value<S> => {
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
export const make = <F extends Fact.Definition>(fact: F): Interface<F> => ({
  fact,
  ...makeForSchema<F["payload"]>(fact.payload),
});

export * as Codec from "./codec.ts";
