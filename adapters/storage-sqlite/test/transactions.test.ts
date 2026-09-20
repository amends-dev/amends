import { expect, test } from "bun:test";
import { Checkpoint, Journal, Log, Store } from "@amends/core/journal";
import { WorkspaceInitialization } from "@amends/core/workspace";
import { SqliteDatabase } from "../src/index.ts";
import { Context, Deferred, Effect, Fiber, Layer, Option } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";

import {
  alice,
  bob,
  workspaceId,
  otherWorkspaceId,
  type Bound,
  views,
  core,
  inDatabase,
  initialized,
  temporary,
} from "./support.ts";
test("initialization commits once under competing requests and never replaces ownership", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const storage = yield* views;
        const bound = yield* storage.forWorkspace(workspaceId);
        const results = yield* Effect.forEach(
          [alice.id, bob.id],
          (creator) => initialized(bound, creator).pipe(Effect.result),
          { concurrency: "unbounded" },
        );
        expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
        expect(results.filter((result) => result._tag === "Failure")).toHaveLength(1);
        const before = yield* bound.workspace.get;
        const log = yield* bound.store.read(Log.Id.make("journal"), { limit: 10 });
        expect(yield* Effect.flip(initialized(bound, bob.id))).toMatchObject({
          _tag: "WorkspaceInitialization.AlreadyInitialized",
        });
        expect(yield* bound.workspace.get).toEqual(before);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toEqual(log);
      }),
    );
  }));

test("a failed final checkpoint rolls back workspace, membership, roles, assignments, log, and all checkpoints", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const storage = yield* views;
        const bound = yield* storage.forWorkspace(workspaceId);
        const failure = new Store.Failure({
          operation: "checkpoint.set",
          cause: "injected disk failure",
        });
        const broken: Bound = {
          ...bound,
          context: Context.add(bound.context, Checkpoint.Service, {
            ...bound.checkpoints,
            set: (key, cursor) =>
              cursor.index === 5 ? Effect.fail(failure) : bound.checkpoints.set(key, cursor),
          }),
        };
        expect(yield* Effect.flip(initialized(broken))).toBe(failure);
        expect(yield* bound.workspace.get).toEqual(Option.none());
        expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toEqual([]);
        const sql = yield* SqlClient.SqlClient;
        expect(yield* sql`SELECT COUNT(*) AS count FROM assignments`).toEqual([{ count: 0 }]);
        expect(yield* sql`SELECT COUNT(*) AS count FROM roles`).toEqual([{ count: 0 }]);
        expect(yield* sql`SELECT COUNT(*) AS count FROM checkpoints`).toEqual([{ count: 0 }]);
        expect(yield* sql`SELECT COUNT(*) AS count FROM commits`).toEqual([{ count: 0 }]);
        const workspace = yield* initialized(bound);
        expect(workspace.createdBy).toBe(alice.id);
      }),
    );
  }));

test("interruption rolls back initialization and leaves the connection usable", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const ready = yield* Deferred.make<void>();
        const program = Effect.gen(function* () {
          const journal = yield* Journal.Service;
          return yield* journal.commit(
            Effect.gen(function* () {
              yield* WorkspaceInitialization.initialize(alice.id, { name: "Test workspace" });
              yield* Deferred.succeed(ready, undefined);
              return yield* Effect.never;
            }),
          );
        }).pipe(Effect.provide(core(bound)));
        const fiber = yield* program.pipe(Effect.forkChild);
        yield* Deferred.await(ready);
        yield* Fiber.interrupt(fiber);
        expect(yield* bound.workspace.get).toEqual(Option.none());
        expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toEqual([]);
        yield* initialized(bound);
      }),
    );
  }));

test("workspace stores reject foreign and expired transactions, including escaped native append handles", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const storage = yield* views;
        const a = yield* storage.forWorkspace(workspaceId);
        const b = yield* storage.forWorkspace(otherWorkspaceId);
        const expired = yield* a.store.transaction(Effect.context<Store.Transaction>());
        expect(
          yield* Effect.flip(a.members.findActive(alice).pipe(Effect.provide(expired))),
        ).toMatchObject({ _tag: "MemberStore.Failure" });
        expect(yield* Effect.flip(a.store.transaction(b.workspace.get))).toMatchObject({
          _tag: "WorkspaceStore.Failure",
        });
        expect(
          yield* Effect.flip(
            a.store.transaction(b.store.read(Log.Id.make("journal"), { limit: 1 })),
          ),
        ).toMatchObject({ _tag: "JournalStore.Failure" });
        const native = Context.get(expired, Store.Transaction);
        expect(
          yield* Effect.flip(
            a.store.transaction(
              native.append({
                logId: Log.Id.make("journal"),
                entries: [{ payload: new Uint8Array([1]) }],
              }),
            ),
          ),
        ).toMatchObject({ _tag: "JournalStore.Failure" });
        expect(yield* a.store.read(Log.Id.make("journal"), { limit: 1 })).toEqual([]);
      }),
    );
  }));

test("independent hosts report a busy transaction without retrying and preserve the first owner", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.scoped(
        Effect.gen(function* () {
          const a = yield* (yield* views).forWorkspace(workspaceId);
          const otherContext = yield* Layer.build(SqliteDatabase.layer(filename));
          const other = yield* views.pipe(Effect.provide(otherContext));
          const b = yield* other.forWorkspace(workspaceId);
          const ready = yield* Deferred.make<void>();
          const release = yield* Deferred.make<void>();
          const owner = yield* Effect.gen(function* () {
            const journal = yield* Journal.Service;
            return yield* journal.commit(
              Effect.gen(function* () {
                const record = yield* WorkspaceInitialization.initialize(alice.id, {
                  name: "Test workspace",
                });
                yield* Deferred.succeed(ready, undefined);
                yield* Deferred.await(release);
                return record;
              }),
            );
          }).pipe(Effect.provide(core(a)), Effect.forkChild);
          yield* Deferred.await(ready);
          expect(yield* Effect.flip(initialized(b, bob.id))).toMatchObject({
            _tag: "JournalStore.Conflict",
          });
          yield* Deferred.succeed(release, undefined);
          const workspace = yield* Fiber.join(owner);
          expect(yield* Effect.flip(initialized(b, bob.id))).toMatchObject({
            _tag: "WorkspaceInitialization.AlreadyInitialized",
          });
          expect(yield* b.workspace.get).toEqual(Option.some(workspace));
        }),
      ),
    );
  }));

test("commit failure reports an uncertain outcome with its commit ID and never retries the operation", async () =>
  temporary(async (filename) => {
    await inDatabase(
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
    );
  }));
