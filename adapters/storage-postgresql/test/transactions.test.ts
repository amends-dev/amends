import { expect } from "bun:test";
import { Checkpoint, Journal, Store } from "@amends/core/journal";
import { WorkspaceInitialization } from "@amends/core/workspace";
import { Context, Deferred, Effect, Fiber, Layer, Option } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { PostgresDatabase } from "../src/index.ts";

import {
  alice,
  bob,
  workspaceId,
  otherWorkspaceId,
  journalLog,
  type Bound,
  views,
  database,
  core,
  inDatabase,
  initialized,
  setup,
} from "./support.ts";
const { it, withDatabase } = await setup();
it("initialization commits once under competing requests and never replaces ownership", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const results = yield* Effect.forEach(
          [alice.id, bob.id],
          (creator) => initialized(bound, creator).pipe(Effect.result),
          { concurrency: "unbounded" },
        );
        expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
        expect(results.filter((result) => result._tag === "Failure")).toHaveLength(1);
        const before = yield* bound.workspace.get;
        const log = yield* bound.store.read(journalLog, { limit: 10 });
        expect(yield* Effect.flip(initialized(bound, bob.id))).toMatchObject({
          _tag: "WorkspaceInitialization.AlreadyInitialized",
        });
        expect(yield* bound.workspace.get).toEqual(before);
        expect(yield* bound.store.read(journalLog, { limit: 10 })).toEqual(log);
      }),
    );
  }));

it("a failed final checkpoint rolls back workspace, membership, grants, log, and all checkpoints", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const failure = new Store.Failure({
          operation: "checkpoint.set",
          cause: "injected disk failure",
        });
        const broken: Bound = {
          ...bound,
          context: Context.add(bound.context, Checkpoint.Service, {
            ...bound.checkpoints,
            set: (key, cursor) =>
              cursor.index === 4 ? Effect.fail(failure) : bound.checkpoints.set(key, cursor),
          }),
        };
        expect(yield* Effect.flip(initialized(broken))).toBe(failure);
        expect(yield* bound.workspace.get).toEqual(Option.none());
        expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
        expect(yield* bound.store.read(journalLog, { limit: 10 })).toEqual([]);
        const sql = yield* SqlClient.SqlClient;
        for (const table of ["assignments", "checkpoints", "commits", "log_entries"]) {
          expect(yield* sql.unsafe(`SELECT COUNT(*)::int AS count FROM ${table}`)).toEqual([
            { count: 0 },
          ]);
        }
        const workspace = yield* initialized(bound);
        expect(workspace.createdBy).toBe(alice.id);
      }),
    );
  }));

it("interruption rolls back initialization and leaves the pool usable", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
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
        expect(yield* bound.store.read(journalLog, { limit: 10 })).toEqual([]);
        yield* initialized(bound);
      }),
    );
  }));

it("workspace stores reject foreign and expired transactions, including escaped native append handles", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const storage = yield* views();
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
          yield* Effect.flip(a.store.transaction(b.store.read(journalLog, { limit: 1 }))),
        ).toMatchObject({ _tag: "JournalStore.Failure" });
        const native = Context.get(expired, Store.Transaction);
        expect(
          yield* Effect.flip(
            a.store.transaction(
              native.append({ logId: journalLog, payloads: [new Uint8Array([1])] }),
            ),
          ),
        ).toMatchObject({ _tag: "JournalStore.Failure" });
        expect(yield* a.store.read(journalLog, { limit: 1 })).toEqual([]);
      }),
    );
  }));

it("a second writer waits for the workspace lock, then reports contention without retrying", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.scoped(
        Effect.gen(function* () {
          const a = yield* (yield* views()).forWorkspace(workspaceId);
          const otherContext = yield* Layer.build(database(url));
          const other = yield* views({ lockTimeout: "100 millis" }).pipe(
            Effect.provide(otherContext),
          );
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

it("commit failure reports an uncertain outcome with its commit ID and never retries the operation", async () =>
  withDatabase(async (url) => {
    await inDatabase(
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
    );
  }));
