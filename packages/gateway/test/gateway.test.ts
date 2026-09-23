import {
  ThreadStore,
  ThreadParticipationStore,
  ThreadMessageStore,
  ThreadActivityStore,
} from "@amends/core/thread";
import { expect, it } from "@effect/vitest";
import { AssignmentStore, Authorization, RoleStore } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { GroupFollowStore, GroupStore, GroupMembershipStore } from "@amends/core/group";
import { Checkpoint, Commit, CommittedEvents, Store } from "@amends/core/journal";
import {
  Notification,
  NotificationApplication,
  NotificationStore,
} from "@amends/core/notification";
import {
  InvitationStore,
  Member,
  MemberApplication,
  MemberStore,
  Workspace,
  WorkspaceStore,
} from "@amends/core/workspace";
import {
  Cause,
  Context,
  Crypto,
  Deferred,
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Result,
  Schema,
  Scope,
  Stream,
} from "effect";
import { GatewayErrors } from "../src/errors.ts";
import { Gateway } from "../src/gateway.ts";
import { WorkspaceStorage } from "../src/storage.ts";
import { WorkspaceEvents } from "../src/workspace-events.ts";
import { WorkspaceRuntime } from "../src/workspace-runtime.ts";

const workspaceId = Workspace.Id.make("workspace");
const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
const agent = Identity.Reference.cases.Agent.make({ id: Identity.AgentId.make("agent") });
const memberId = Member.Id.make("member");
const unexpected = () => Effect.die(new Error("Unexpected storage operation in gateway test"));
interface BindingOptions {
  readonly workspaceId?: Workspace.Id;
  readonly findActive?: MemberStore.Interface["findActive"];
  readonly read?: Store.Interface["read"];
  readonly memberWorkspaceId?: Workspace.Id;
}

/** Empty journal and explicit host contracts; unexpected writes fail instead of simulating storage. */
const bindings = (options: BindingOptions = {}): Context.Context<WorkspaceStorage.Bindings> => {
  const boundWorkspaceId = options.workspaceId ?? workspaceId;
  return Context.make(
    Store.Service,
    Store.Service.of({
      readFacts: () => Effect.succeed([]),
      getEntry: () => Effect.succeedNone,
      transaction: (program) =>
        program.pipe(
          Effect.provideService(Store.Transaction, {
            id: Commit.Id.make("replay"),
            append: unexpected,
          }),
        ),
      get: unexpected,
      read: options.read ?? (() => Effect.succeed([])),
      waitForAppend: unexpected,
      getAppend: unexpected,
    }),
  ).pipe(
    Context.add(
      Checkpoint.Service,
      Checkpoint.Service.of({ get: () => Effect.succeedNone, set: unexpected }),
    ),
    Context.add(
      WorkspaceStore.Service,
      WorkspaceStore.Service.of({
        workspaceId: boundWorkspaceId,
        get: unexpected(),
        insert: unexpected,
        transferOwnership: unexpected,
      }),
    ),
    Context.add(
      MemberStore.Service,
      MemberStore.Service.of({
        workspaceId: options.memberWorkspaceId ?? boundWorkspaceId,
        get: unexpected,
        getMany: unexpected,
        findActive:
          options.findActive ??
          ((identity) =>
            Effect.succeedSome({
              id: memberId,
              workspaceId: boundWorkspaceId,
              identity,
              status: "active",
            })),
        list: unexpected(),
        insert: unexpected,
        markRemoved: unexpected,
      }),
    ),
    Context.add(
      InvitationStore.Service,
      InvitationStore.Service.of({
        workspaceId: boundWorkspaceId,
        get: unexpected,
        list: unexpected(),
        listPendingByRecipient: unexpected,
        insert: unexpected,
        settle: unexpected,
      }),
    ),
    Context.add(
      NotificationStore.Service,
      NotificationStore.Service.of({
        discardPendingForParticipation: unexpected,
        acknowledge: unexpected,
        workspaceId: boundWorkspaceId,
        get: unexpected,
        listByRecipient: unexpected,
        listPendingByRecipient: unexpected,
        insert: unexpected,
        insertMany: unexpected,
      }),
    ),
    Context.add(ThreadStore.Service, {
      workspaceId: boundWorkspaceId,
      get: unexpected,
      listByGroup: unexpected,
      insert: unexpected,
    }),
    Context.add(ThreadParticipationStore.Service, {
      workspaceId: boundWorkspaceId,
      get: unexpected,
      getMany: unexpected,
      listByThread: unexpected,
      listByAdmission: unexpected,
      insert: unexpected,
      end: unexpected,
    }),
    Context.add(ThreadMessageStore.Service, {
      workspaceId: boundWorkspaceId,
      get: unexpected,
      getMany: unexpected,
      insert: unexpected,
    }),
    Context.add(ThreadActivityStore.Service, {
      latest: unexpected,
      workspaceId: boundWorkspaceId,
      get: unexpected,
      listByThread: unexpected,
      readPage: unexpected,
      insert: unexpected,
    }),
    Context.add(
      GroupStore.Service,
      GroupStore.Service.of({
        workspaceId: boundWorkspaceId,
        get: unexpected,
        findDirect: unexpected,
        insert: unexpected,
      }),
    ),
    Context.add(
      GroupMembershipStore.Service,
      GroupMembershipStore.Service.of({
        workspaceId: boundWorkspaceId,
        get: unexpected,
        getMany: unexpected,
        findActive: unexpected,
        listByGroup: unexpected,
        listActiveByMember: unexpected,
        insert: unexpected,
        markRemoved: unexpected,
      }),
    ),
    Context.add(
      GroupFollowStore.Service,
      GroupFollowStore.Service.of({
        workspaceId: boundWorkspaceId,
        get: unexpected,
        findActive: unexpected,
        listActiveByGroup: unexpected,
        insert: unexpected,
        end: unexpected,
      }),
    ),
    Context.add(
      RoleStore.Service,
      RoleStore.Service.of({
        workspaceId: boundWorkspaceId,
        get: unexpected,
        insert: unexpected,
        rename: unexpected,
        setPermissions: unexpected,
      }),
    ),
    Context.add(
      AssignmentStore.Service,
      AssignmentStore.Service.of({
        workspaceId: boundWorkspaceId,
        get: unexpected,
        listActiveByMember: unexpected,
        listActiveByRole: unexpected,
        insert: unexpected,
        markRevoked: unexpected,
      }),
    ),
  );
};
const host = (storage: WorkspaceStorage.Interface) =>
  Layer.mergeAll(
    WorkspaceEvents.layer(),
    Layer.succeed(WorkspaceStorage.Service, storage),
    Layer.succeed(
      Crypto.Crypto,
      Crypto.make({ randomBytes: (size) => new Uint8Array(size), digest: unexpected }),
    ),
  );
const run = <A, E>(
  program: (gateway: Gateway.Interface) => Effect.Effect<A, E>,
  options: BindingOptions = {},
) =>
  Effect.flatMap(Gateway.make(), program).pipe(
    Effect.scoped,
    Effect.provide(
      host({
        forWorkspace: () => Effect.succeed(bindings(options)),
      }),
    ),
  );
const defect = <A, E>(exit: Exit.Exit<A, E>): unknown => {
  if (!Exit.isFailure(exit)) throw new Error("Expected a failed exit");
  const found = Cause.findDie(exit.cause);
  if (!Result.isSuccess(found)) throw new Error("Expected a defect");
  expect(Option.isNone(Cause.findErrorOption(exit.cause))).toBe(true);
  return found.success.defect;
};
it.effect.each(["inWorkspace", "asMember"] as const)(
  "%s maps operation failures to public outcomes",
  (entry) =>
    run((gateway) =>
      Effect.gen(function* () {
        const enter = <A, E>(program: Effect.Effect<A, E>) =>
          entry === "inWorkspace"
            ? gateway.inWorkspace(workspaceId, program)
            : gateway.asMember(workspaceId, alice, program);
        const conflict = yield* Effect.flip(
          enter(
            Effect.fail(new Store.Conflict({ operation: "append", message: "Changed position" })),
          ),
        );
        expect(conflict).toMatchObject({
          _tag: "Gateway.Conflict",
          workspaceId,
          operation: "append",
          message: "Changed position",
        });
        const uncertain = yield* Effect.flip(
          enter(
            Effect.fail(
              new Store.CommitUncertain({
                commitId: Commit.Id.make("commit"),
                cause: new Error("driver detail"),
              }),
            ),
          ),
        );
        expect(yield* Schema.encodeEffect(GatewayErrors.PublicError)(uncertain)).toEqual({
          _tag: "Gateway.Uncertain",
          workspaceId,
          commitId: "commit",
        });
        const invalid = yield* Effect.flip(enter(Schema.decodeEffect(Schema.NonEmptyString)("")));
        expect(invalid).toMatchObject({ _tag: "Gateway.InvalidInput" });
        const mismatch = yield* Effect.flip(
          enter(
            Effect.fail(
              new Authorization.WorkspaceMismatch({
                expectedWorkspaceId: workspaceId,
                actualWorkspaceId: Workspace.Id.make("other"),
              }),
            ),
          ),
        );
        expect(mismatch).toMatchObject({
          _tag: "Gateway.InvalidInput",
          message: "Values must belong to workspace workspace",
        });
        const missing = new MemberApplication.NotFound({ workspaceId, memberId });
        expect(yield* Effect.flip(enter(Effect.fail(missing)))).toBe(missing);
        const missingNotification = new NotificationApplication.NotFound({
          workspaceId,
          notificationId: Notification.Id.make("missing"),
        });
        expect(yield* Effect.flip(enter(Effect.fail(missingNotification)))).toBe(
          missingNotification,
        );
      }),
    ),
);

it.effect(
  "unexpected failures and malformed public errors stay defects; interruption stays interruption",
  () =>
    run((gateway) =>
      Effect.gen(function* () {
        const failure = new MemberStore.Failure({
          operation: "get",
          cause: new Error("database detail"),
        });
        expect(
          defect(yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.fail(failure)))),
        ).toBe(failure);
        const invalidNotification = new NotificationApplication.InvalidResponse({
          message: "Invalid stored notification",
        });
        expect(
          defect(
            yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.fail(invalidNotification))),
          ),
        ).toBe(invalidNotification);
        const malformed = { _tag: "MemberApplication.NotFound", workspaceId, memberId: 42 };
        expect(
          defect(yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.fail(malformed)))),
        ).toBe(malformed);
        const interrupted = yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.interrupt));
        expect(Exit.hasInterrupts(interrupted)).toBe(true);
        expect(Exit.hasDies(interrupted)).toBe(false);
      }),
    ),
);

it.effect("construction and projection replay failures are defects before the operation runs", () =>
  Effect.gen(function* () {
    let called = false;
    const operation = Effect.sync(() => {
      called = true;
    });
    const badBindings = yield* run(
      (gateway) => Effect.exit(gateway.inWorkspace(workspaceId, operation)),
      { memberWorkspaceId: Workspace.Id.make("other") },
    );
    expect(defect(badBindings)).toMatchObject({ _tag: "Authorization.WorkspaceMismatch" });
    const failure = new Store.Failure({ operation: "read", cause: new Error("unavailable") });
    const badReplay = yield* run(
      (gateway) => Effect.exit(gateway.inWorkspace(workspaceId, operation)),
      { read: () => Effect.fail(failure) },
    );
    expect(defect(badReplay)).toBe(failure);
    expect(called).toBe(false);
  }),
);

it.effect.each(["make", "layer"] as const)(
  "gateway %s binds lazily and propagates host binding defects",
  (construction) =>
    Effect.gen(function* () {
      const failure = new Error("Cannot bind workspace");
      const requested: Array<Workspace.Id> = [];
      const storage = WorkspaceStorage.Service.of({
        forWorkspace: (id) =>
          Effect.sync(() => {
            requested.push(id);
          }).pipe(Effect.andThen(Effect.die(failure))),
      });
      const program = (gateway: Gateway.Interface) =>
        Effect.gen(function* () {
          expect(requested).toEqual([]);
          const exit = yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.void));
          expect(defect(exit)).toBe(failure);
          expect(requested).toEqual([workspaceId]);
        });
      const configured =
        construction === "make"
          ? Effect.flatMap(Gateway.make(), program)
          : Effect.flatMap(Gateway.Service, program).pipe(Effect.provide(Gateway.layer));
      yield* configured.pipe(Effect.scoped, Effect.provide(host(storage)));
    }),
);

it.effect("one gateway resolves each caller's current membership and stops after revocation", () =>
  Effect.gen(function* () {
    let active = true;
    const seen: Array<Identity.MemberReference> = [];
    yield* run(
      (gateway) =>
        Effect.gen(function* () {
          const first = yield* gateway.asMember(workspaceId, alice, Actor.Service);
          const second = yield* gateway.asMember(workspaceId, agent, Actor.Service);
          expect(first).toEqual({ workspaceId, memberId, identity: alice });
          expect(second).toEqual({ workspaceId, memberId, identity: agent });
          active = false;
          let called = false;
          const rejected = yield* Effect.flip(
            gateway.asMember(
              workspaceId,
              alice,
              Effect.sync(() => {
                called = true;
              }),
            ),
          );
          expect(rejected).toMatchObject({ _tag: "Gateway.NotMember", workspaceId });
          expect(called).toBe(false);
          expect(seen).toEqual([alice, agent, alice]);
        }),
      {
        findActive: (identity) =>
          Effect.sync(() => {
            seen.push(identity);
            return active
              ? Option.some({ id: memberId, workspaceId, identity, status: "active" })
              : Option.none();
          }),
      },
    );
  }),
);

it.effect("concurrent requests share boot and later requests do not replay or rebind", () =>
  Effect.gen(function* () {
    let bound = 0;
    let reads = 0;
    let executed = 0;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        const storage = WorkspaceStorage.Service.of({
          forWorkspace: () =>
            Effect.sync(() => {
              bound += 1;
              return bindings({
                read: () =>
                  Effect.gen(function* () {
                    reads += 1;
                    yield* Deferred.succeed(entered, undefined);
                    yield* Deferred.await(resume);
                    return [];
                  }),
              });
            }),
        });
        yield* Effect.gen(function* () {
          const gateway = yield* Gateway.make();
          const operation = Effect.sync(() => {
            executed += 1;
          });
          const requests = yield* Effect.forEach(
            Array.from({ length: 20 }),
            () => gateway.inWorkspace(workspaceId, operation),
            { concurrency: "unbounded" },
          ).pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(entered);
          expect(bound).toBe(1);
          expect(executed).toBe(0);
          yield* Deferred.succeed(resume, undefined);
          yield* Fiber.join(requests);
          expect(executed).toBe(20);
          expect(reads).toBe(13); // One replay read per registered projection.
          yield* gateway.asMember(workspaceId, alice, operation);
          yield* gateway.inWorkspace(workspaceId, operation);
          expect(bound).toBe(1);
          expect(reads).toBe(13); // One replay read per registered projection.
          expect(executed).toBe(22);
        }).pipe(Effect.provide(host(storage)));
      }),
    );
  }),
);

it.effect("failed boot releases its bus and a later acquisition retries once", () =>
  Effect.gen(function* () {
    const failure = new Store.Failure({ operation: "read", cause: "boot failed" });
    let bound = 0;
    let executed = 0;
    const buses: Array<CommittedEvents.Interface> = [];
    yield* Effect.scoped(
      Effect.gen(function* () {
        const events = yield* WorkspaceEvents.Service;
        const gateway = yield* Gateway.make().pipe(
          Effect.provideService(WorkspaceEvents.Service, {
            forWorkspace: (id) =>
              events.forWorkspace(id).pipe(
                Effect.tap((bus) =>
                  Effect.sync(() => {
                    buses.push(bus);
                  }),
                ),
              ),
          }),
        );
        const operation = Effect.sync(() => {
          executed += 1;
        });
        expect(defect(yield* Effect.exit(gateway.inWorkspace(workspaceId, operation)))).toBe(
          failure,
        );
        expect(executed).toBe(0);
        const failedBus = buses[0];
        if (failedBus === undefined) throw new Error("Expected the failed boot's bus");
        expect(yield* Effect.flip(failedBus.subscribe)).toMatchObject({
          _tag: "CommittedEvents.Closed",
        });
        yield* gateway.inWorkspace(workspaceId, operation);
        yield* gateway.inWorkspace(workspaceId, operation);
        expect(executed).toBe(2);
        expect(bound).toBe(2);
        expect(buses).toHaveLength(2);
        expect(buses[1]).not.toBe(failedBus);
      }),
    ).pipe(
      Effect.provide(
        host({
          forWorkspace: () =>
            Effect.sync(() => {
              bound += 1;
              return bindings(bound === 1 ? { read: () => Effect.fail(failure) } : {});
            }),
        }),
      ),
    );
  }),
);

it.effect("interrupting a caller leaves shared boot available to the next request", () =>
  Effect.gen(function* () {
    let bound = 0;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>();
        const resume = yield* Deferred.make<void>();
        yield* Effect.gen(function* () {
          const gateway = yield* Gateway.make();
          const first = yield* gateway
            .inWorkspace(workspaceId, Effect.void)
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.await(entered);
          yield* Fiber.interrupt(first);
          expect(Exit.hasInterrupts(yield* Fiber.await(first))).toBe(true);
          const second = yield* gateway
            .asMember(workspaceId, alice, Actor.Service)
            .pipe(Effect.forkChild({ startImmediately: true }));
          yield* Deferred.succeed(resume, undefined);
          expect((yield* Fiber.join(second)).identity).toEqual(alice);
          expect(bound).toBe(1);
        }).pipe(
          Effect.provide(
            host({
              forWorkspace: () =>
                Effect.gen(function* () {
                  bound += 1;
                  yield* Deferred.succeed(entered, undefined);
                  yield* Deferred.await(resume);
                  return bindings();
                }),
            }),
          ),
        );
      }),
    );
  }),
);

it.effect("workspace runtimes are isolated and a new host boots from storage again", () =>
  Effect.gen(function* () {
    const requested: Array<Workspace.Id> = [];
    const storage = {
      forWorkspace: (id: Workspace.Id) =>
        Effect.sync(() => {
          requested.push(id);
          return bindings({ workspaceId: id });
        }),
    };
    const other = Workspace.Id.make("other");
    for (let restart = 0; restart < 2; restart += 1) {
      yield* Effect.scoped(
        Effect.gen(function* () {
          const gateway = yield* Gateway.make();
          expect((yield* gateway.asMember(workspaceId, alice, Actor.Service)).workspaceId).toBe(
            workspaceId,
          );
          expect((yield* gateway.asMember(other, agent, Actor.Service)).workspaceId).toBe(other);
          yield* gateway.inWorkspace(workspaceId, Effect.void);
        }),
      ).pipe(Effect.provide(host(storage)));
    }
    expect(requested).toEqual([workspaceId, other, workspaceId, other]);
  }),
);

it.effect(
  "boot uses the host context and does not capture the first request's actor or transaction",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const gateway = yield* Gateway.make();
        yield* gateway.inWorkspace(workspaceId, Effect.void).pipe(
          Effect.provideService(Actor.Service, { workspaceId, memberId, identity: alice }),
          Effect.provideService(Store.Transaction, {
            id: Commit.Id.make("request"),
            append: unexpected,
          }),
        );
        yield* gateway.inWorkspace(
          workspaceId,
          Effect.gen(function* () {
            expect(Option.isNone(yield* Effect.serviceOption(Actor.Service))).toBe(true);
            expect(Option.isNone(yield* Effect.serviceOption(Store.Transaction))).toBe(true);
          }),
        );
      }),
    ).pipe(
      Effect.provide(
        host({
          forWorkspace: () =>
            Effect.gen(function* () {
              expect(Option.isNone(yield* Effect.serviceOption(Actor.Service))).toBe(true);
              expect(Option.isNone(yield* Effect.serviceOption(Store.Transaction))).toBe(true);
              return bindings();
            }),
        }),
      ),
    ),
);

it.effect(
  "host shutdown closes runtime buses and readers even with an outstanding request lease",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const owner = yield* Scope.fork(yield* Scope.Scope);
        const runtimes = yield* WorkspaceRuntime.make().pipe(Scope.provide(owner));
        const context = yield* runtimes.forWorkspace(workspaceId);
        const bus = Context.get(context, CommittedEvents.Service);
        const stream = yield* bus.subscribe;
        const reader = yield* Stream.runDrain(stream).pipe(
          Effect.forkChild({ startImmediately: true }),
        );
        yield* Scope.close(owner, Exit.void);
        expect(Exit.hasInterrupts(yield* Fiber.await(reader))).toBe(true);
        expect(yield* Effect.flip(bus.subscribe)).toMatchObject({ _tag: "CommittedEvents.Closed" });
        expect(Exit.hasInterrupts(yield* Effect.exit(runtimes.forWorkspace(workspaceId)))).toBe(
          true,
        );
      }),
    ).pipe(Effect.provide(host({ forWorkspace: () => Effect.succeed(bindings()) }))),
);
