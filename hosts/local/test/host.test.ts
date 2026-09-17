import { expect, expectTypeOf, test } from "bun:test";
import {
  Actor,
  AssignmentFacts,
  Checkpoint,
  Identity,
  Journal,
  Log,
  Member,
  MemberApplication,
  MemberPermissions,
  Role,
  RoleFacts,
  Store,
  Workspace,
  WorkspaceCore,
  WorkspaceInitialization,
} from "@amends/core";
import { BunCrypto } from "@effect/platform-bun";
import { Context, Deferred, Effect, Fiber, Layer, Option, Schema, Stream } from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "../src/database.ts";
import { LocalHost } from "../src/host.ts";
import { Storage } from "../src/storage.ts";

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const workspaceId = Workspace.Id.make("workspace-one");
const otherWorkspaceId = Workspace.Id.make("workspace-two");
type Bound = Effect.Success<
  ReturnType<Effect.Success<ReturnType<typeof Storage.make>>["forWorkspace"]>
>;
const core = (bound: Bound) =>
  WorkspaceCore.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
const inDatabase = <A, E>(filename: string, program: Effect.Effect<A, E, SqlClient.SqlClient>) =>
  Effect.runPromise(program.pipe(Effect.provide(Database.layer(filename))));
const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator).pipe(Effect.provide(core(bound)));
const temporary = async (run: (filename: string) => Promise<void>) => {
  const directory = await mkdtemp(join(tmpdir(), "amends-host-"));
  try {
    await run(join(directory, "test.sqlite"));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
};

test("one host creates two isolated workspaces and uses each operation's authenticated identity", async () =>
  temporary(async (filename) => {
    expectTypeOf<
      Effect.Services<ReturnType<LocalHost.Interface["getMember"]>>
    >().toEqualTypeOf<never>();
    expectTypeOf<
      Effect.Services<ReturnType<LocalHost.Interface["createWorkspace"]>>
    >().toEqualTypeOf<never>();
    const workspaces = await Effect.runPromise(
      Effect.gen(function* () {
        const host = yield* LocalHost.Service;
        const a = yield* host.createWorkspace(alice.id);
        const b = yield* host.createWorkspace(bob.id);
        const requests = Array.from({ length: 20 }, (_, index) => {
          const [workspace, identity] =
            index % 2 === 0 ? ([a, alice] as const) : ([b, bob] as const);
          return host.getMember(workspace.id, identity, workspace.ownerMemberId).pipe(
            Effect.tap((record) => {
              expect(record.workspaceId).toBe(workspace.id);
              expect(record.identity).toEqual(identity);
              return Effect.void;
            }),
          );
        });
        yield* Effect.all(requests, { concurrency: "unbounded" });
        expect(yield* Effect.flip(host.getMember(b.id, alice, b.ownerMemberId))).toMatchObject({
          _tag: "LocalHost.NotMember",
        });
        expect(yield* Effect.flip(host.getMember(a.id, bob, a.ownerMemberId))).toMatchObject({
          _tag: "LocalHost.NotMember",
        });
        expect(yield* Effect.flip(host.getMember(a.id, alice, b.ownerMemberId))).toMatchObject({
          _tag: "MemberApplication.NotFound",
        });
        return [a, b];
      }).pipe(Effect.provide(LocalHost.layer(filename))),
    );
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const storage = yield* Storage.make();
        for (const workspace of workspaces) {
          const bound = yield* storage.forWorkspace(workspace.id);
          expect(yield* bound.workspace.get()).toEqual(Option.some(workspace));
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
        const storage = yield* Storage.make();
        const bound = yield* storage.forWorkspace(workspaceId);
        const results = yield* Effect.forEach(
          [alice.id, bob.id],
          (creator) => initialized(bound, creator).pipe(Effect.result),
          { concurrency: "unbounded" },
        );
        expect(results.filter((result) => result._tag === "Success")).toHaveLength(1);
        expect(results.filter((result) => result._tag === "Failure")).toHaveLength(1);
        const before = yield* bound.workspace.get();
        const log = yield* bound.store.read(Log.Id.make("journal"), { limit: 10 });
        expect(yield* Effect.flip(initialized(bound, bob.id))).toMatchObject({
          _tag: "WorkspaceInitialization.AlreadyInitialized",
        });
        expect(yield* bound.workspace.get()).toEqual(before);
        expect(yield* bound.store.read(Log.Id.make("journal"), { limit: 10 })).toEqual(log);
      }),
    );
  }));

test("a failed final checkpoint rolls back workspace, membership, grants, log, and all checkpoints", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const storage = yield* Storage.make();
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
        expect(yield* bound.workspace.get()).toEqual(Option.none());
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
        const bound = yield* (yield* Storage.make()).forWorkspace(workspaceId);
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
        expect(yield* bound.workspace.get()).toEqual(Option.none());
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
        const storage = yield* Storage.make();
        const a = yield* storage.forWorkspace(workspaceId);
        const b = yield* storage.forWorkspace(otherWorkspaceId);
        const expired = yield* a.store.transaction(Effect.context<Store.Transaction>());
        expect(
          yield* Effect.flip(a.members.findActive(alice).pipe(Effect.provide(expired))),
        ).toMatchObject({ _tag: "MemberStore.Failure" });
        expect(yield* Effect.flip(a.store.transaction(b.workspace.get()))).toMatchObject({
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
        const bound = yield* (yield* Storage.make()).forWorkspace(workspaceId);
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

test("a new process can read persisted memberships, and another identity is denied", async () =>
  temporary(async (filename) => {
    const invoke = async (...args: string[]) => {
      const child = Bun.spawn([process.execPath, "hosts/local/src/index.ts", ...args], {
        cwd: join(import.meta.dir, "../../.."),
        env: { ...process.env, AMENDS_DATABASE: filename },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [exit, output, error] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
      ]);
      return { exit, output, error };
    };
    const created = await invoke("create", alice.id);
    expect(created.exit).toBe(0);
    const workspace = Schema.decodeSync(Schema.fromJsonString(Workspace.Record))(
      created.output.trim(),
    );
    const reopened = await invoke("get", workspace.id, alice.id, workspace.ownerMemberId);
    expect(reopened.exit).toBe(0);
    const member = Schema.decodeSync(Schema.fromJsonString(Member.Record))(reopened.output.trim());
    expect(member.identity).toEqual(alice);
    const denied = await invoke("get", workspace.id, bob.id, workspace.ownerMemberId);
    expect(denied.exit).toBe(1);
    expect(denied.output + denied.error).toContain("LocalHost.NotMember");
  }));

test("separate connections observe live appends; identical log IDs stay isolated by workspace", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.scoped(
        Effect.gen(function* () {
          const storage = yield* Storage.make();
          const a = yield* storage.forWorkspace(workspaceId);
          const b = yield* storage.forWorkspace(otherWorkspaceId);
          const otherContext = yield* Layer.build(Database.layer(filename));
          const otherStorage = yield* Storage.make().pipe(Effect.provide(otherContext));
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
          const a = yield* (yield* Storage.make()).forWorkspace(workspaceId);
          const otherContext = yield* Layer.build(Database.layer(filename));
          const other = yield* Storage.make().pipe(Effect.provide(otherContext));
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
          expect(yield* b.workspace.get()).toEqual(Option.some(workspace));
        }),
      ),
    );
  }));

test("replay rebuilds ownership, membership, and initial grants from persisted facts", async () =>
  temporary(async (filename) => {
    await inDatabase(
      filename,
      Effect.gen(function* () {
        const bound = yield* (yield* Storage.make()).forWorkspace(workspaceId);
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
        expect(yield* bound.workspace.get()).toEqual(Option.none());
        yield* Effect.gen(function* () {
          yield* (yield* Journal.Service).replay;
        }).pipe(Effect.provide(core(bound)));
        expect(yield* bound.workspace.get()).toEqual(Option.some(workspace));
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
        const sql = yield* SqlClient.SqlClient;
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
        const storage = yield* Storage.make().pipe(
          Effect.provideService(SqlClient.SqlClient, failCommit),
        );
        const bound = yield* storage.forWorkspace(workspaceId);
        const failure = yield* Effect.flip(initialized(bound));
        expect(failure).toMatchObject({
          _tag: "JournalStore.CommitUncertain",
          commitId: expect.any(String),
        });
        expect(commits).toBe(1);
        expect(yield* bound.workspace.get()).toEqual(Option.none());
        yield* initialized(bound);
      }),
    );
  }));
