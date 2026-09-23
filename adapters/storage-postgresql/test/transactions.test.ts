import { Suites } from "@amends/storage-conformance";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { SqlError } from "effect/unstable/sql";
import { PostgresDatabase } from "../src/index.ts";
import { harness } from "./harness.ts";
import { initialized, inDatabase, setup, views, workspaceId } from "./support.ts";

Suites.transactions(harness);

const { available, withDatabase } = setup();
describe.skipIf(!available)("PostgreSQL", () => {
  it.effect(
    "commit failure reports an uncertain outcome with its commit ID and never retries the operation",
    () =>
      withDatabase((url) =>
        inDatabase(
          url,
          Effect.gen(function* () {
            const real = yield* PostgresDatabase.Service;
            let commits = 0;
            const failing = new Proxy(real.sql, {
              get(target, key, receiver) {
                if (key === "reserve")
                  return Effect.map(
                    real.sql.reserve,
                    (connection) =>
                      new Proxy(connection, {
                        get(inner, method, innerReceiver) {
                          if (method === "executeRaw")
                            return (statement: string, params: ReadonlyArray<unknown>) =>
                              statement === "COMMIT" && commits++ === 0
                                ? Effect.fail(
                                    new SqlError.SqlError({
                                      reason: new SqlError.ConnectionError({
                                        cause: "test failure",
                                        message: "lost commit response",
                                      }),
                                    }),
                                  )
                                : connection.executeRaw(statement, params);
                          return Reflect.get(inner, method, innerReceiver);
                        },
                      }),
                  );
                return Reflect.get(target, key, receiver);
              },
            });
            const storage = yield* views().pipe(
              Effect.provideService(PostgresDatabase.Service, { db: real.db, sql: failing }),
            );
            const bound = yield* storage.forWorkspace(workspaceId);
            const failure = yield* Effect.flip(initialized(bound));
            expect(failure).toMatchObject({
              _tag: "JournalStore.CommitUncertain",
              commitId: expect.any(String),
            });
            expect(commits).toBe(1);
            expect(yield* bound.workspace.get).toEqual(Option.none());
            yield* initialized(bound);
          }),
        ),
      ),
  );
});
