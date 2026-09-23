import type { Harness } from "@amends/storage-conformance";
import { BunCrypto } from "@effect/platform-bun";
import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { layer, SqliteDatabase } from "../src/index.ts";
import { inDatabase, temporary } from "./support.ts";

/** Projection tables, children before the tables they reference. */
const projections = [
  "thread_activities",
  "thread_messages",
  "thread_participations",
  "threads",
  "group_follows",
  "group_memberships",
  "groups",
  "notifications",
  "invitations",
  "assignments",
  "roles",
  "members",
  "workspaces",
  "checkpoints",
  "live_projections",
];

/** A temporary database file for each test; each connection is another host over it. */
export const harness: Harness = {
  name: "SQLite",
  available: true,
  crypto: BunCrypto.layer,
  withStorage: (use) =>
    temporary((filename) => {
      const maintain = <A>(program: Effect.Effect<A, unknown, SqlClient.SqlClient>) =>
        inDatabase(filename, program).pipe(Effect.orDie);
      return use({
        connect: () =>
          Layer.build(layer.pipe(Layer.provideMerge(SqliteDatabase.layer(filename)))).pipe(
            Effect.orDie,
          ),
        discardProjections: maintain(
          Effect.flatMap(SqlClient.SqlClient, (sql) =>
            sql.withTransaction(
              Effect.forEach(projections, (table) => sql.unsafe(`DELETE FROM ${table}`), {
                discard: true,
              }),
            ),
          ),
        ),
        footprint: maintain(
          Effect.gen(function* () {
            const sql = yield* SqlClient.SqlClient;
            const tables = yield* sql<{
              readonly name: string;
            }>`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'effect_sql_migrations'`;
            let total = 0;
            for (const { name } of tables) {
              const [row] = yield* sql.unsafe<{ readonly count: number }>(
                `SELECT COUNT(*) AS count FROM "${name}"`,
              );
              total += row?.count ?? 0;
            }
            return total;
          }),
        ),
      });
    }),
};
