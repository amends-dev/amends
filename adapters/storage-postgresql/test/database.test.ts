import { expect } from "bun:test";
import { PgClient } from "@effect/sql-pg";
import * as PgDrizzle from "drizzle-orm/effect-postgres";
import { migrate } from "drizzle-orm/effect-postgres/migrator";
import { Effect, Option, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabase } from "../src/index.ts";
import { migrationsFolder } from "../src/database.ts";
import { cp, mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { workspaceId, views, database, inDatabase, initialized, setup } from "./support.ts";
const { it, withDatabase } = await setup();

it("the notification migration upgrades existing storage without changing workspace data", async () =>
  withDatabase(async (url) => {
    const priorMigrations = await mkdtemp(join(tmpdir(), "amends-pg-migrations-"));
    try {
      for (const name of await readdir(migrationsFolder)) {
        if (name < "20260919184324_notifications")
          await cp(join(migrationsFolder, name), join(priorMigrations, name), { recursive: true });
      }
      await Effect.runPromise(
        Effect.gen(function* () {
          const db = yield* PgDrizzle.makeWithDefaults();
          yield* migrate(db, { migrationsFolder: priorMigrations });
          const sql = yield* SqlClient.SqlClient;
          yield* sql`INSERT INTO workspaces (workspace_id, name, created_by, owner_member_id) VALUES (${workspaceId}, 'Before notifications', 'existing-human', 'existing-owner')`;
        }).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 4 }))),
      );
      await inDatabase(
        url,
        Effect.gen(function* () {
          const sql = yield* SqlClient.SqlClient;
          expect(
            yield* sql`SELECT name FROM workspaces WHERE workspace_id = ${workspaceId}`,
          ).toEqual([{ name: "Before notifications" }]);
          expect(yield* sql`SELECT COUNT(*)::int AS count FROM notifications`).toEqual([
            { count: 0 },
          ]);
        }),
      );
    } finally {
      await rm(priorMigrations, { recursive: true, force: true });
    }
  }));

it.each(["make", "layer"] as const)(
  "database %s initializes every store and preserves data when reopened",
  async (construction) =>
    withDatabase(async (url) => {
      const program = Effect.gen(function* () {
        const database = yield* PostgresDatabase.Service;
        expect(database.sql).toBe(yield* SqlClient.SqlClient);
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const record = yield* initialized(bound);
        expect(yield* bound.invitations.list).toEqual([]);
        return record;
      });
      const configured =
        construction === "make"
          ? Effect.flatMap(PostgresDatabase.make(), (database) =>
              program.pipe(Effect.provideService(PostgresDatabase.Service, database)),
            ).pipe(Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 4 })))
          : program.pipe(Effect.provide(database(url)));
      const record = await Effect.runPromise(configured);
      await inDatabase(
        url,
        Effect.gen(function* () {
          const bound = yield* (yield* views()).forWorkspace(workspaceId);
          expect(yield* bound.workspace.get).toEqual(Option.some(record));
          expect(yield* bound.members.list).toHaveLength(1);
          expect(yield* bound.invitations.list).toEqual([]);
        }),
      );
    }),
);
