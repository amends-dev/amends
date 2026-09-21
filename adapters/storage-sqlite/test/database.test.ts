import { expect, test } from "bun:test";
import { SqliteDatabase } from "../src/index.ts";
import { SqliteClient } from "@effect/sql-sqlite-bun";
import { Cause, Effect, Exit, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";

import { workspaceId, views, inDatabase, initialized, temporary } from "./support.ts";

test.each(["make", "layer"] as const)(
  "database %s initializes every store and preserves data when reopened",
  async (construction) =>
    temporary(async (filename) => {
      const program = Effect.gen(function* () {
        const database = yield* SqliteDatabase.Service;
        expect(database.sql).toBe(yield* SqlClient.SqlClient);
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const record = yield* initialized(bound);
        expect(yield* bound.invitations.list).toEqual([]);
        return record;
      });
      const configured =
        construction === "make"
          ? Effect.flatMap(SqliteDatabase.make(), (database) =>
              program.pipe(Effect.provideService(SqliteDatabase.Service, database)),
            ).pipe(Effect.provide(SqliteClient.layer({ filename, busyTimeout: 0 })))
          : program.pipe(Effect.provide(SqliteDatabase.layer(filename)));
      const record = await Effect.runPromise(configured);
      await inDatabase(
        filename,
        Effect.gen(function* () {
          const bound = yield* (yield* views).forWorkspace(workspaceId);
          expect(yield* bound.workspace.get).toEqual(Option.some(record));
          expect(yield* bound.members.list).toHaveLength(1);
          expect(yield* bound.invitations.list).toEqual([]);
        }),
      );
    }),
);

test("database construction fails and rolls back incomplete schema initialization before retry", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE members (unexpected TEXT)`;
      const exit = yield* Effect.exit(SqliteDatabase.make());
      if (!Exit.isFailure(exit)) throw new Error("Expected initialization failure");
      expect(Cause.hasDies(exit.cause)).toBe(true);
      expect(yield* sql`SELECT migration_id FROM effect_sql_migrations`).toEqual([]);
      expect(
        yield* sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('workspaces', 'invitations')`,
      ).toEqual([]);

      yield* sql`DROP TABLE members`;
      const database = yield* SqliteDatabase.make();
      expect(yield* database.sql`SELECT COUNT(*) AS count FROM invitations`).toEqual([
        { count: 0 },
      ]);
    }).pipe(Effect.provide(SqliteClient.layer({ filename: ":memory:", busyTimeout: 0 }))),
  );
});

test("commit entry lookups seek within one batch and return index order without sorting", async () =>
  temporary(async (filename) =>
    inDatabase(
      filename,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        // Complete checkpoint batches and keyed append slices use the same access path.
        for (const range of [sql``, sql`AND entry_index >= ${1} AND entry_index < ${3}`]) {
          const plan = yield* sql<{
            detail: string;
          }>`EXPLAIN QUERY PLAN SELECT id, log_id, position, commit_id, entry_index, recorded_at, payload, subject, fact_name, fact_version, provenance FROM log_entries WHERE workspace_id = ${workspaceId} AND log_id = ${"journal"} AND commit_id = ${"commit"} ${range} ORDER BY entry_index`;
          const details = plan.map((row) => row.detail);
          expect(
            details.some((detail) =>
              detail.includes("workspace_id=? AND log_id=? AND commit_id=?"),
            ),
          ).toBe(true);
          expect(details.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
        }
      }),
    ),
  ));
