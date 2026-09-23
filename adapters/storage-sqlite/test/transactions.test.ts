import { Suites } from "@amends/storage-conformance";
import { expect, it } from "@effect/vitest";
import { Effect, Option } from "effect";
import { SqlError } from "effect/unstable/sql";
import { SqliteDatabase } from "../src/index.ts";
import { harness } from "./harness.ts";
import { initialized, inDatabase, temporary, views, workspaceId } from "./support.ts";

Suites.transactions(harness);

it.effect(
  "commit failure reports an uncertain outcome with its commit ID and never retries the operation",
  () =>
    temporary((filename) =>
      inDatabase(
        filename,
        Effect.gen(function* () {
          const database = yield* SqliteDatabase.Service;
          const { sql } = database;
          let commits = 0;
          const failCommit = new Proxy(sql, {
            get(target, key, receiver) {
              if (key === "reserve")
                return sql.reserve.pipe(
                  Effect.map((connection) => ({
                    ...connection,
                    executeUnprepared: (
                      statement: string,
                      params: ReadonlyArray<unknown>,
                      transform: Parameters<typeof connection.executeUnprepared>[2],
                    ) => {
                      if (statement === "COMMIT" && commits++ === 0)
                        return Effect.fail(
                          new SqlError.SqlError({
                            reason: new SqlError.ConnectionError({
                              cause: "test failure",
                              message: "lost commit response",
                            }),
                          }),
                        );
                      return connection.executeUnprepared(statement, params, transform);
                    },
                  })),
                );
              return Reflect.get(target, key, receiver);
            },
          });
          const storage = yield* views.pipe(
            Effect.provideService(SqliteDatabase.Service, { ...database, sql: failCommit }),
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
