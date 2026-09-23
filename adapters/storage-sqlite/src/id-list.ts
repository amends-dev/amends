import type { SqlClient } from "effect/unstable/sql";

/**
 * `IN` over IDs bound as one JSON array parameter. Every list length shares one statement,
 * and so its cached preparation, where an expanded `IN (?, ?, …)` would compile one per length.
 */
export const inIds = (sql: SqlClient.SqlClient, ids: ReadonlyArray<string>) =>
  sql`IN (SELECT value FROM json_each(${JSON.stringify(ids)}))`;
