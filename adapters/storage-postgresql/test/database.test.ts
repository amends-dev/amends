import { expect } from "bun:test";
import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabase } from "../src/index.ts";

import { workspaceId, views, database, inDatabase, initialized, setup } from "./support.ts";
const { it, withDatabase } = await setup();

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
