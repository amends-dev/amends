/**
 * How the memory stores keep records: the JSON of a record's encoded form in a map keyed by ID,
 * where the PostgreSQL adapter keeps one column per field. `make` builds the encoder, decoder, and
 * map readers for one record schema; each store module holds one per kind of row it keeps, and the
 * gateway's memory directory and sign-in storage build theirs the same way. `compareBinary` orders
 * IDs as the adapter's binary collation does, so lists agree across storage, and `keyOf` builds
 * the composite keys of the read-state and append maps.
 *
 * @since 0.1.0
 */
import { Effect, Schema } from "effect";

/**
 * How one kind of record is stored: the JSON of its encoded form, keyed by ID, one map where the
 * PostgreSQL adapter has one table. Stored strings never change, and every read decodes a fresh
 * record the caller may change freely.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = <A>(codec: Schema.Codec<A, string>) => {
  const decode = Schema.decodeEffect(codec);
  return {
    encode: Schema.encodeEffect(codec),
    decode,
    /** The record stored under `id`, if any. */
    get: (rows: ReadonlyMap<string, string>, id: string) => {
      const row = rows.get(id);
      return row === undefined ? Effect.succeedNone : Effect.asSome(decode(row));
    },
    /** Found records once each, in unspecified order; absent IDs are omitted. */
    getMany: (rows: ReadonlyMap<string, string>, ids: ReadonlyArray<string>) =>
      Effect.forEach(
        [...new Set(ids)].flatMap((id) => {
          const row = rows.get(id);
          return row === undefined ? [] : [row];
        }),
        (row) => decode(row),
      ),
    /** Every stored record, in no promised order; the stores sort what they list. */
    all: (rows: ReadonlyMap<string, string>) => Effect.forEach(rows.values(), (row) => decode(row)),
  };
};

/**
 * Order strings by their UTF-8 bytes, as the PostgreSQL adapter's binary collation does, so the
 * memory stores list IDs in the same order.
 *
 * @category utils
 * @since 0.1.0
 */
export const compareBinary = (left: string, right: string): number => {
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    const a = left.codePointAt(i) ?? 0;
    const b = right.codePointAt(j) ?? 0;
    if (a !== b) return a < b ? -1 : 1;
    i += a > 0xffff ? 2 : 1;
    j += b > 0xffff ? 2 : 1;
  }
  return i < left.length ? 1 : j < right.length ? -1 : 0;
};

/**
 * A composite key for maps, unambiguous whatever its parts contain: the read-state maps key by
 * member and thread or group, and the journal's append slices by log and idempotency key.
 *
 * @category utils
 * @since 0.1.0
 */
export const keyOf = (...parts: ReadonlyArray<string | number>): string => JSON.stringify(parts);
