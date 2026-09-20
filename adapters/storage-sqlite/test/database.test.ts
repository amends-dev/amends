import { expect, test } from "bun:test";
import { SqliteDatabase } from "../src/index.ts";
import { SqliteClient, SqliteMigrator } from "@effect/sql-sqlite-bun";
import { Cause, Effect, Exit, Option } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { Migrations } from "../src/migrations.ts";

import { workspaceId, views, inDatabase, initialized, temporary } from "./support.ts";

test("the notification migration upgrades existing storage without changing workspace data", async () =>
  temporary(async (filename) => {
    const record = JSON.stringify({
      id: workspaceId,
      name: "Before notifications",
      createdBy: "existing-human",
      ownerMemberId: "existing-owner",
    });
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* SqliteMigrator.run({
          loader: Migrations.loader.pipe(
            Effect.map((migrations) => migrations.filter(([id]) => id === 1)),
          ),
        });
        const sql = yield* SqlClient.SqlClient;
        yield* sql`INSERT INTO workspaces (workspace_id, record) VALUES (${workspaceId}, ${record})`;
      }).pipe(Effect.provide(SqliteClient.layer({ filename, busyTimeout: 0 }))),
    );
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        expect(
          yield* sql`SELECT record FROM workspaces WHERE workspace_id = ${workspaceId}`,
        ).toEqual([{ record }]);
        expect(yield* sql`SELECT COUNT(*) AS count FROM notifications`).toEqual([{ count: 0 }]);
        expect(
          yield* sql`SELECT migration_id FROM effect_sql_migrations ORDER BY migration_id`,
        ).toEqual([{ migration_id: 1 }, { migration_id: 2 }, { migration_id: 3 }]);
      }),
    );
  }));

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

test("database construction fails and rolls back an incomplete migration before retry", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const sql = yield* SqlClient.SqlClient;
      yield* sql`CREATE TABLE members (unexpected TEXT)`;
      const exit = yield* Effect.exit(SqliteDatabase.make());
      if (!Exit.isFailure(exit)) throw new Error("Expected migration failure");
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
