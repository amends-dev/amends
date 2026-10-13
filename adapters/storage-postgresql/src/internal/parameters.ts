import { getColumns, type Table } from "drizzle-orm"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"

/**
 * The most parameters one statement can bind. `@effect/sql-pg` encodes their count as a signed
 * 16-bit integer, below the protocol's own limit of 65535.
 */
export const maxParameters = 32767

/**
 * Insert rows in as few statements as stay within maxParameters: one per column and row, plus
 * `extra` per row that values computed in SQL bind, and within `limit` rows each. Lists of IDs in
 * a condition bind as one array instead: `inIds`.
 */
export const insertChunked = <Row, E, R>(
  table: Table,
  rows: ReadonlyArray<Row>,
  insert: (chunk: Array.NonEmptyArray<Row>) => Effect.Effect<unknown, E, R>,
  options: { readonly limit?: number; readonly extra?: number } = {}
) =>
  Effect.forEach(
    Array.chunksOf(
      rows,
      Math.min(
        options.limit ?? Infinity,
        Math.floor(maxParameters / (Object.keys(getColumns(table)).length + (options.extra ?? 0)))
      )
    ),
    insert,
    { discard: true }
  )
