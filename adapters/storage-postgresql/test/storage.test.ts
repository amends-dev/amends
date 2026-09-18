import { afterAll, expect, test } from "bun:test";
import * as Core from "@amends/core";
import {
  AssignmentFacts,
  AssignmentStore,
  Grant,
  Role,
  RoleFacts,
  RoleStore,
  Scope,
  Target,
} from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { Checkpoint, Journal, Log, Store } from "@amends/core/journal";
import {
  Invitation,
  InvitationApplication,
  InvitationStore,
  Member,
  MemberApplication,
  MemberPermissions,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { Gateway, WorkspaceDirectory, type WorkspaceStorage } from "@amends/gateway";
import { BunCrypto } from "@effect/platform-bun";
import {
  Context,
  DateTime,
  Deferred,
  Effect,
  Fiber,
  Layer,
  Option,
  Redacted,
  Schema,
  Stream,
} from "effect";
import { SqlClient, SqlError } from "effect/unstable/sql";
import { contracts, PostgresDatabase, PostgresStorage } from "../src/index.ts";
import { acquire, temporary } from "./postgres.ts";

const server = await acquire();
afterAll(async () => server?.stop());
const it = test.skipIf(server === undefined);
const withDatabase = (use: (url: string) => Promise<void>) => temporary(server!, use);

const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
const workspaceId = Workspace.Id.make("workspace-one");
const otherWorkspaceId = Workspace.Id.make("workspace-two");
const journalLog = Log.Id.make("journal");

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
const views = (options: PostgresStorage.Options = {}) =>
  Effect.map(PostgresStorage.make(options), (service) => ({
    forWorkspace: (workspaceId: Workspace.Id) =>
      Effect.map(service.forWorkspace(workspaceId), bind),
  }));
const database = (url: string) =>
  PostgresDatabase.layer({ url: Redacted.make(url), maxConnections: 4 });
const core = (bound: Bound) =>
  Core.layer.pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), BunCrypto.layer)),
  );
const inDatabase = <A, E>(
  url: string,
  program: Effect.Effect<A, E, PostgresDatabase.Service | SqlClient.SqlClient>,
) => Effect.runPromise(program.pipe(Effect.provide(database(url))));
const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator).pipe(Effect.provide(core(bound)));
const host = (url: string, options: PostgresStorage.Options = {}) =>
  Gateway.layer.pipe(
    Layer.provideMerge(contracts(options)),
    Layer.provideMerge(Layer.mergeAll(database(url), BunCrypto.layer)),
  );
const future = DateTime.now.pipe(Effect.map((now) => DateTime.add(now, { hours: 1 })));

it("the gateway runs the membership workflow over two isolated workspaces", async () =>
  withDatabase(async (url) => {
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const entry = yield* Gateway.Service;
        const a = yield* entry.createWorkspace(alice.id);
        const b = yield* entry.createWorkspace(bob.id);
        const getMember = (workspace: Workspace.Record, identity: Identity.Reference) =>
          entry.asMember(
            workspace.id,
            identity,
            Effect.flatMap(MemberApplication.Service, (members) =>
              members.get(workspace.ownerMemberId),
            ),
          );
        yield* Effect.all(
          Array.from({ length: 20 }, (_, index) =>
            index % 2 === 0 ? getMember(a, alice) : getMember(b, bob),
          ),
          { concurrency: "unbounded" },
        );
        const crossed = yield* Effect.flip(getMember(b, alice));
        const grants = [
          Grant.make(
            MemberPermissions.Read,
            Scope.Value.cases.Workspace.make({ workspaceId: a.id }),
          ),
          Grant.make(
            MemberPermissions.Remove,
            Scope.Value.cases.Target.make({
              target: Target.Reference.cases.Member.make({
                workspaceId: a.id,
                memberId: a.ownerMemberId,
              }),
            }),
          ),
        ];
        const expiresAt = yield* future;
        const invitation = yield* entry.asMember(
          a.id,
          alice,
          Effect.flatMap(InvitationApplication.Service, (invitations) =>
            invitations.issue({ recipientId: bob.id, expiresAt, grants }),
          ),
        );
        const listing = yield* (yield* WorkspaceDirectory.Service).list(bob);
        const joined = yield* entry.inWorkspace(
          a.id,
          Effect.flatMap(InvitationApplication.Service, (invitations) =>
            invitations.accept(invitation.details.id, bob.id),
          ),
        );
        const afterJoin = yield* (yield* WorkspaceDirectory.Service).list(bob);
        const stored = yield* entry.asMember(
          a.id,
          alice,
          Effect.flatMap(InvitationApplication.Service, (invitations) => invitations.list),
        );
        const removed = yield* entry.asMember(
          a.id,
          alice,
          Effect.flatMap(MemberApplication.Service, (members) => members.remove(joined.id)),
        );
        const members = yield* entry.asMember(
          a.id,
          alice,
          Effect.flatMap(MemberApplication.Service, (members) => members.list),
        );
        return { a, b, crossed, invitation, listing, joined, afterJoin, stored, removed, members };
      }).pipe(Effect.provide(host(url))),
    );
    expect(outcome.crossed).toMatchObject({ _tag: "Gateway.NotMember" });
    expect(outcome.listing.memberships.map((m) => m.workspace.id)).toEqual([outcome.b.id]);
    expect(outcome.listing.invitations).toEqual([outcome.invitation]);
    expect(outcome.joined).toMatchObject({ identity: bob, status: "active" });
    expect(outcome.afterJoin.invitations).toEqual([]);
    const people = new Map(outcome.afterJoin.memberships.map((m) => [m.workspace.id, m.people]));
    expect(people).toEqual(
      new Map([
        [outcome.a.id, 2],
        [outcome.b.id, 1],
      ]),
    );
    // Grants come back in their issued order, with their exact scopes and instants.
    expect(outcome.stored).toEqual([
      {
        details: outcome.invitation.details,
        state: { _tag: "Accepted", memberId: outcome.joined.id, acceptedAt: expect.anything() },
      },
    ]);
    expect(outcome.removed).toMatchObject({ id: outcome.joined.id, status: "removed" });
    expect(outcome.members.map((m) => m.status).sort()).toEqual(["active", "removed"]);
    await inDatabase(
      url,
      Effect.gen(function* () {
        const storage = yield* views();
        for (const workspace of [outcome.a, outcome.b]) {
          const bound = yield* storage.forWorkspace(workspace.id);
          expect(yield* bound.workspace.get).toEqual(Option.some(workspace));
          const assignments = yield* bound.assignments.listActiveByMember(workspace.ownerMemberId);
          expect(assignments).toHaveLength(3);
          expect(assignments.map((assignment) => assignment.source)).toEqual(
            expect.arrayContaining([
              {
                _tag: "Direct",
                grant: {
                  permission: "member.read",
                  scope: { _tag: "Workspace", workspaceId: workspace.id },
                },
              },
            ]),
          );
        }
        const bound = yield* storage.forWorkspace(outcome.a.id);
        const batches = yield* bound.store.read(journalLog, { limit: 10 });
        expect(batches.map((batch) => Number(batch.position))).toEqual([0, 1, 2, 3]);
        expect(batches[0]?.entries).toHaveLength(5);
        expect(batches[0]?.commit.entryCount).toBe(5);
        expect(yield* bound.store.get(journalLog, batches[1]!.commit.id)).toEqual(
          Option.some(batches[1]!),
        );
        const accepted = yield* bound.assignments.listActiveByMember(outcome.joined.id);
        expect(accepted.map((assignment) => assignment.source)).toEqual(
          expect.arrayContaining(
            outcome.invitation.details.grants.map((grant) => ({ _tag: "Direct", grant })),
          ),
        );
        expect(accepted).toHaveLength(2);
      }),
    );
  }));

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

it("the persistent role and assignment projections support edits and independent revocations", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
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
          expect(yield* bound.assignments.get(grants[0]!.id)).toMatchObject({
            _tag: "Some",
            value: { status: "revoked", source: grants[0]!.source },
          });
        }).pipe(Effect.provide(core(bound)));
      }),
    );
  }));

it("separate pools observe live appends; identical log IDs stay isolated by workspace", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.scoped(
        Effect.gen(function* () {
          const storage = yield* views({ pollInterval: "20 millis" });
          const a = yield* storage.forWorkspace(workspaceId);
          const b = yield* storage.forWorkspace(otherWorkspaceId);
          const otherContext = yield* Layer.build(database(url));
          const otherStorage = yield* views().pipe(Effect.provide(otherContext));
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
          yield* writer.append("from another pool", {
            expectedAfter: Option.some(first.position),
          });
          const batches = yield* Fiber.join(tail);
          expect(batches[0]?.entries[0]?.payload).toBe("from another pool");
          expect(
            yield* Effect.flip(
              a.store.transaction(a.store.waitForAppend(Log.Id.make("execution"), Option.none())),
            ),
          ).toMatchObject({ _tag: "JournalStore.Failure" });
        }),
      ),
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

it("replay rebuilds ownership, membership, and initial grants from persisted facts", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        const sql = yield* SqlClient.SqlClient;
        // Clear the read models; the workspace row cascades to its memberships and grants.
        yield* sql.withTransaction(
          Effect.gen(function* () {
            yield* sql`DELETE FROM workspaces`;
            yield* sql`DELETE FROM checkpoints`;
          }),
        );
        expect(yield* bound.workspace.get).toEqual(Option.none());
        expect(yield* bound.members.list).toEqual([]);
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
        expect(yield* bound.store.read(journalLog, { limit: 10 })).toHaveLength(1);
      }),
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

it("invitations keep their grants, instants, and terminal states across settlement", async () =>
  withDatabase(async (url) => {
    await inDatabase(
      url,
      Effect.gen(function* () {
        const bound = yield* (yield* views()).forWorkspace(workspaceId);
        const workspace = yield* initialized(bound);
        const issuedAt = yield* DateTime.now;
        const grants = [
          Grant.make(MemberPermissions.Read, Scope.Value.cases.Workspace.make({ workspaceId })),
          Grant.make(
            MemberPermissions.Remove,
            Scope.Value.cases.Target.make({
              target: Target.Reference.cases.Member.make({
                workspaceId,
                memberId: workspace.ownerMemberId,
              }),
            }),
          ),
        ];
        const details = (id: string, granted = grants): Invitation.Details => ({
          id: Invitation.Id.make(id),
          workspaceId,
          recipientId: bob.id,
          inviterMemberId: workspace.ownerMemberId,
          issuedAt,
          expiresAt: DateTime.add(issuedAt, { hours: 1 }),
          grants: granted,
        });
        const memberId = Member.Id.make("joined");
        const settledAt = DateTime.add(issuedAt, { minutes: 5 });
        const pending = (id: string, granted = grants): Invitation.Record => ({
          details: details(id, granted),
          state: { _tag: "Pending" },
        });
        yield* bound.store.transaction(
          Effect.gen(function* () {
            yield* bound.invitations.insert(pending("first"));
            yield* bound.invitations.insert(pending("second", []));
            yield* bound.invitations.settle(Invitation.Id.make("first"), {
              _tag: "Accepted",
              memberId,
              acceptedAt: settledAt,
            });
          }),
        );
        // A settled invitation stays settled, and a duplicate is refused by the database.
        expect(
          yield* Effect.flip(
            bound.store.transaction(
              bound.invitations.settle(Invitation.Id.make("first"), {
                _tag: "Revoked",
                revokedBy: memberId,
                revokedAt: settledAt,
              }),
            ),
          ),
        ).toMatchObject({ _tag: "InvitationStore.Conflict", operation: "settle" });
        expect(
          yield* Effect.flip(bound.store.transaction(bound.invitations.insert(pending("first")))),
        ).toMatchObject({ _tag: "InvitationStore.Conflict", operation: "insert" });
        // A refused statement aborts the PostgreSQL transaction. A program that
        // swallows the refusal and carries on must not see its commit succeed.
        expect(
          yield* Effect.flip(
            bound.store.transaction(
              Effect.gen(function* () {
                yield* Effect.ignore(bound.invitations.insert(pending("first")));
                yield* bound.invitations.insert(pending("third")).pipe(Effect.ignore);
              }),
            ),
          ),
        ).toMatchObject({ _tag: "JournalStore.Failure", operation: "commit" });
        expect(yield* bound.invitations.get(Invitation.Id.make("third"))).toEqual(Option.none());
        const first = yield* bound.invitations.get(Invitation.Id.make("first"));
        expect(first).toEqual(
          Option.some({
            details: details("first"),
            state: { _tag: "Accepted", memberId, acceptedAt: settledAt },
          }),
        );
        expect((yield* bound.invitations.list).map((record) => String(record.details.id))).toEqual([
          "first",
          "second",
        ]);
        expect(
          (yield* bound.invitations.listPendingByRecipient(bob.id)).map((record) =>
            String(record.details.id),
          ),
        ).toEqual(["second"]);
      }),
    );
  }));
