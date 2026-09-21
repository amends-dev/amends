import { describe, it, expect } from "@effect/vitest";
import { PgClient } from "@effect/sql-pg";
import { Effect, Option, Redacted } from "effect";
import { SqlClient } from "effect/unstable/sql";
import { PostgresDatabase } from "../src/index.ts";
import { workspaceId, views, database, inDatabase, initialized, setup } from "./support.ts";

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  for (const construction of ["make", "layer"] as const)
    it.effect(
      `database ${construction} initializes every store and preserves data when reopened`,
      () =>
        withDatabase((url) =>
          Effect.gen(function* () {
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
                  ).pipe(
                    Effect.provide(PgClient.layer({ url: Redacted.make(url), maxConnections: 4 })),
                  )
                : program.pipe(Effect.provide(database(url)));
            const record = yield* configured;
            yield* inDatabase(
              url,
              Effect.gen(function* () {
                const bound = yield* (yield* views()).forWorkspace(workspaceId);
                expect(yield* bound.workspace.get).toEqual(Option.some(record));
                expect(yield* bound.members.list).toHaveLength(1);
                expect(yield* bound.invitations.list).toEqual([]);
              }),
            );
          }),
        ),
    );
});
