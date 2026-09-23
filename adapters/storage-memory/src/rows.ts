import { Effect, Schema } from "effect";

/**
 * How one kind of record is stored: the JSON of its encoded form, keyed by ID, like the SQL
 * adapters' record columns. Stored strings never change, and every read decodes a fresh record
 * the caller may change freely.
 *
 * @category constructors
 */
export const make = <A>(codec: Schema.Codec<A, string>) => {
  const decode = Schema.decodeEffect(codec);
  return {
    encode: Schema.encodeEffect(codec),
    decode,
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
    all: (rows: ReadonlyMap<string, string>) => Effect.forEach(rows.values(), (row) => decode(row)),
  };
};

/** Order strings by their UTF-8 bytes, as the SQL adapters' binary collation does. */
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

/** A composite key for maps, unambiguous whatever its parts contain. */
export const keyOf = (...parts: ReadonlyArray<string | number>): string => JSON.stringify(parts);

export * as Rows from "./rows.ts";
