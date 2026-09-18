import { expect, expectTypeOf, test } from "bun:test";
import * as Core from "@amends/core";
import {
  AssignmentFacts,
  AssignmentStore,
  Role,
  RoleFacts,
  RoleStore,
} from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Journal, Log, Store } from "@amends/core/journal";
import {
  InvitationStore,
  MemberApplication,
  MemberPermissions,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Gateway, type WorkspaceStorage } from "@amends/gateway";
import { contracts, SqliteDatabase, SqliteStorage } from "../src/index.ts";
import { BunCrypto } from "@effect/platform-bun";
import { Context, Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Operations } from "./operations.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const workspaceId = Workspace.Id.make("workspace-one");
const otherWorkspaceId = Workspace.Id.make("workspace-two");
/** The bound stores by name, for direct assertions beside the context core receives. */
const bind = (context: Context.Context<WorkspaceStorage.Bindings>) => ({
  context,
  store: Context.get(context, Store.Service),
  checkpoints: Context.get(context, Checkpoint.Service),
  workspace: Context.get(context, WorkspaceStore.Service),
  members: Context.get(context, MemberStore.Service),
  roles: Context.get(context, RoleStore.Service),
  assignments: Context.get(context, AssignmentStore.Service),
  invitations: Context.get(context, InvitationStore.Service),
});
type Bound = ReturnType<typeof bind>;
const views = Effect.map(SqliteStorage.make(), (service) => ({
  forWorkspace: (workspaceId: Workspace.Id) => Effect.map(service.forWorkspace(workspaceId), bind),
}));
const core = (bound: Bound) =>
  Core.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
const inDatabase = <A, E>(
  filename: string,
  program: Effect.Effect<A, E, SqliteDatabase.Service | SqlClient.SqlClient>,
) => Effect.runPromise(program.pipe(Effect.provide(SqliteDatabase.layer(filename))));
const host = (filename: string) =>
  Gateway.layer.pipe(
    Layer.provideMerge(contracts),
    Layer.provideMerge(Layer.mergeAll(SqliteDatabase.layer(filename), BunCrypto.layer)),
  );
const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator).pipe(Effect.provide(core(bound)));
const temporary = async (run: (filename: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "amends-sqlite-"));
  try {
    await run(join(directory, "test.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("one host creates two isolated workspaces and uses each operation's authenticated identity", async () =>
  temporary(async (filename) => {
    expectTypeOf<
      Effect.Services<ReturnType<typeof Operations.getMember>>
    >().toEqualTypeOf<Gateway.Service>();
    expectTypeOf<
      Effect.Services<ReturnType<Gateway.Interface["createWorkspace"]>>
    >().toEqualTypeOf<never>();
    const workspaces = await Effect.runPromise(
      Effect.gen(function* () {
        const a = yield* Operations.createWorkspace(alice.id);
        const b = yield* Operations.createWorkspace(bob.id);
        const requests = Array.from({ length: 20 }, (_, index) => {
          const [workspace, identity] =
            index % 2 === 0 ? ([a, alice] as const) : ([b, bob] as const);
          return Operations.getMember(workspace.id, identity, workspace.ownerMemberId).pipe(
            Effect.tap((record) => {
              expect(record.workspaceId).toBe(workspace.id);
              expect(record.identity).toEqual(identity);
              return Effect.void;
            }),
          );
        });
        yield* Effect.all(requests, { concurrency: "unbounded" });
        expect(
          yield* Effect.flip(Operations.getMember(b.id, alice, b.ownerMemberId)),
        ).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(yield* Effect.flip(Operations.getMember(a.id, bob, a.ownerMemberId))).toMatchObject({
          _tag: "Gateway.NotMember",
        });
        expect(
          yield* Effect.flip(Operations.getMember(a.id, alice, b.ownerMemberId)),
        ).toMatchObject({
          _tag: "MemberApplication.NotFound",
        });
        return [a, b];
      }).pipe(Effect.provide(host(filename))),
    );
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const storage = yield* views;
        for (const workspace of workspaces) {
          const bound = yield* storage.forWorkspace(workspace.id);
          expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
          const assignments = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
          expect(assignments.map((assignment) => assignment.source)).toEqual(
            expect.arrayContaining([
              {
                _tag: "Direct",
                grant: {
                  permission: "member.read",
                  scope: { _tag: "Workspace", workspaceId: workspace.id },
                },
              },
              {
                _tag: "Direct",
                grant: {
                  permission: "member.remove",
                  scope: { _tag: "Workspace", workspaceId: workspace.id },
                },
              },
            ]),
          );
          expect(assignments).toHaveLength(3);
          const batches = yield* bound.store.read(Log.Id.make("journal"), { limit: 10 });
          expect(batches).toHaveLength(1);
          expect(batches[0]?.entries).toHaveLength(5);
          expect(batches[0]?.commit.entryCount).toBe(5);
        }
      }),
    );
  }));

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

test("a failed final checkpoint rolls back workspace, membership, grants, log, and all checkpoints", async () =>
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
              cursor.index === 4 ? Effect.fail(failure) : bound.checkpoints.set(key, cursor),
          }),
        };
        expect(yield* Effect.flip(initialized(broken))).toBe(failure);
        expect(yield* bound.workspace.get).toEqual(Option.none());
        expect(yield* bound.members.findActive(alice)).toEqual(Option.none());
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toEqual([]);
        const sql = yield* SqlClient.SqlClient;
        expect(yield* sql`SELECT COUNT(*) AS count FROM assignments`).toEqual([{ count: 0 }]);
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
              yield* WorkspaceInitialization.initialize(alice.id);
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
              native.append({ logId: Log.Id.make("journal"), payloads: [new Uint8Array([1])] }),
            ),
          ),
        ).toMatchObject({ _tag: "JournalStore.Failure" });
        expect(yield* a.store.read(Log.Id.make("journal"), { limit: 1 })).toEqual([]);
      }),
    );
  }));

test("the persistent role and assignment projections support edits and independent revocations", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        yield* Effect.gen(function* () {
          const journal = yield* Journal.Service;
          const roleId = Role.Id.make("reader");
          yield* journal.publish(RoleFacts.Created, {
            workspaceId,
            roleId,
            name: "Reader",
            permissions: [],
          });
          yield* journal.publish(RoleFacts.Renamed, { workspaceId, roleId, name: "Renamed" });
          yield* journal.publish(RoleFacts.PermissionsChanged, {
            workspaceId,
            roleId,
            permissions: [MemberPermissions.Read.name],
          });
          const grants = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
          for (const grant of grants)
            yield* journal.publish(AssignmentFacts.Revoked, {
              workspaceId,
              assignmentId: grant.id,
            });
          expect(yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).toEqual([]);
          const actor = Actor.Value.make({
            workspaceId,
            memberId: workspace.ownerMemberId,
            identity: alice,
          });
          expect(
            yield* (yield* MemberApplication.Service)
              .get(workspace.ownerMemberId)
              .pipe(Effect.provideService(Actor.Service, actor), Effect.flip),
          ).toMatchObject({ _tag: "Authorization.Denied" });
          expect(yield* bound.roles.get(roleId)).toMatchObject({
            _tag: "Some",
            value: { name: "Renamed", permissions: ["member.read"] },
          });
        }).pipe(Effect.provide(core(bound)));
      }),
    );
  }));

test("separate connections observe live appends; identical log IDs stay isolated by workspace", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.scoped(
        Effect.gen(function* () {
          const storage = yield* views;
          const a = yield* storage.forWorkspace(workspaceId);
          const b = yield* storage.forWorkspace(otherWorkspaceId);
          const otherContext = yield* Layer.build(SqliteDatabase.layer(filename));
          const otherStorage = yield* views.pipe(Effect.provide(otherContext));
          const otherA = yield* otherStorage.forWorkspace(workspaceId);
          const open = (bound: Bound) =>
            Log.Service.pipe(
              Effect.map((logs) =>
                logs.open({ id: Log.Id.make("execution"), schema: Schema.String }),
              ),
              Effect.provide(core(bound)),
            );
          const logA = yield* open(a);
          const logB = yield* open(b);
          const writer = yield* open(otherA);
          const first = yield* logA.append("a", { expectedAfter: Option.none() });
          yield* logB.append("b", { expectedAfter: Option.none() });
          expect((yield* logA.read({ limit: 10 }))[0]?.entries[0]?.payload).toBe("a");
          expect((yield* logB.read({ limit: 10 }))[0]?.entries[0]?.payload).toBe("b");
          expect(
            yield* Effect.flip(writer.append("conflict", { expectedAfter: Option.none() })),
          ).toMatchObject({ _tag: "JournalStore.Conflict" });
          const waiting = yield* Deferred.make<void>();
          const watched = {
            ...a,
            context: Context.add(a.context, Store.Service, {
              ...a.store,
              waitForAppend: (id, after) =>
                Deferred.succeed(waiting, undefined).pipe(
                  Effect.andThen(a.store.waitForAppend(id, after)),
                ),
            }),
          };
          const reader = yield* open(watched);
          const tail = yield* reader
            .tail({ after: first.position, limit: 1 })
            .pipe(Stream.take(1), Stream.runCollect, Effect.forkChild);
          yield* Deferred.await(waiting);
          yield* writer.append("from another connection", {
            expectedAfter: Option.some(first.position),
          });
          const batches = yield* Fiber.join(tail);
          expect(batches[0]?.entries[0]?.payload).toBe("from another connection");
          expect(
            yield* Effect.flip(
              a.store.transaction(a.store.waitForAppend(Log.Id.make("execution"), Option.none())),
            ),
          ).toMatchObject({ _tag: "JournalStore.Failure" });
        }),
      ),
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
                const record = yield* WorkspaceInitialization.initialize(alice.id);
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

test("replay rebuilds ownership, membership, and initial grants from persisted facts", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* (yield* views).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        const sql = yield* SqlClient.SqlClient;
        // Clear only this temporary test database's read models to exercise recovery.
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM workspaces`;
            yield* sql`DELETE FROM members`;
            yield* sql`DELETE FROM assignments`;
            yield* sql`DELETE FROM checkpoints`;
          }),
        );
        expect(yield* bound.workspace.get).toEqual(Option.none());
        yield* Effect.gen(function* () {
          yield* (yield* Journal.Service).replay;
        }).pipe(Effect.provide(core(bound)));
        expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
        expect(yield* bound.members.get(workspace.ownerMemberId)).toMatchObject({
          _tag: "Some",
          value: { identity: alice, status: "active" },
        });
        expect(yield* bound.assignments.listActiveByMember(workspace.ownerMemberId)).toHaveLength(
          3,
        );
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toHaveLength(1);
      }),
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
