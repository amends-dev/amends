import { sql, type AnyColumn } from "drizzle-orm"

/**
 * `= ANY` over IDs bound as one array parameter. Every list length shares one prepared statement,
 * where an expanded `IN ($1, $2, …)` would prepare one per length.
 */
export const inIds = (column: AnyColumn, ids: ReadonlyArray<string>) => sql`${column} = any(${sql.param(ids)})`
