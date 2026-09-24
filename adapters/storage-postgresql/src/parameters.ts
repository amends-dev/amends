import { getColumns, type Table } from "drizzle-orm";
import { Array, Effect } from "effect";

/**
 * The most parameters one statement can bind. `@effect/sql-pg` encodes their count as a signed
 * 16-bit integer, below the protocol's own limit of 65535.
 */
export const maxParameters = 32767;

/**
 * Insert rows in as few statements as stay within maxParameters, at most one per column and row,
 * and within `limit` rows each. Lists of IDs in a condition bind as one array instead: `inIds`.
 */
export const insertChunked = <Row, E, R>(
  table: Table,
  rows: ReadonlyArray<Row>,
  insert: (chunk: Array.NonEmptyArray<Row>) => Effect.Effect<unknown, E, R>,
  limit = Infinity,
) =>
  Effect.forEach(
    Array.chunksOf(
      rows,
      Math.min(limit, Math.floor(maxParameters / Object.keys(getColumns(table)).length)),
    ),
    insert,
    { discard: true },
  );
