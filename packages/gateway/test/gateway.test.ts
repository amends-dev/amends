import { ConnectionV2CredentialStore, ConnectionV2Store } from "@amends/core/connection-v2";
import { AgentV2Store } from "@amends/core/agent-v2";
import { SessionLogStore, SessionStateStore, TurnJobs, TurnStore } from "@amends/core/turn";
import {
  ThreadStore,
  ThreadParticipationStore,
  ThreadMessageStore,
  ThreadActivityStore,
} from "@amends/core/thread";
import { expect, it } from "@effect/vitest";
import { ReadStateStore } from "@amends/core/read-state";
import { SignalHub } from "@amends/core/signal";
import { AssignmentStore, Authorization, RoleStore } from "@amends/core/authorization";
import { Actor, Identity } from "@amends/core/identity";
import { GroupFollowStore, GroupStore, GroupMembershipStore } from "@amends/core/group";
import { Checkpoint, Commit, Entry, Store } from "@amends/core/journal";
import { Notification, NotificationService, NotificationStore } from "@amends/core/notification";
import {
  InvitationStore,
  Member,
  MemberService,
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
import { TestClock } from "effect/testing";
import { GatewayErrors } from "../src/errors.ts";
import { Gateway } from "../src/gateway.ts";
import { WorkspaceStorage } from "../src/storage.ts";
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
  readonly head?: Store.Interface["head"];
  readonly listLive?: Checkpoint.Interface["listLive"];
}

/**
 * A created workspace whose projections replay from an empty page, with explicit host contracts;
 * unexpected writes fail instead of simulating storage.
 */
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
            afterCommit: unexpected,
          }),
        ),
      get: unexpected,
      read: options.read ?? (() => Effect.succeed([])),
      head: options.head ?? (() => Effect.succeedSome(Entry.Position.make(0))),
      workspaceId: boundWorkspaceId,
      waitForAppend: unexpected,
      getAppend: unexpected,
      append: unexpected,
    }),
  )
    .pipe(
      Context.add(
        Checkpoint.Service,
        Checkpoint.Service.of({
          get: () => Effect.succeedNone,
          set: unexpected,
          listLive: options.listLive ?? (() => Effect.succeed([])),
          setLive: () => Effect.void,
        }),
      ),
      Context.add(
        WorkspaceStore.Service,
        WorkspaceStore.Service.of({
          // Booting checks the built-in roles of an initialized workspace; these boot none.
          get: Effect.succeedNone,
          insert: unexpected,
          rename: () => Effect.die("Unexpected workspace rename"),
          transferOwnership: unexpected,
        }),
      ),
      Context.add(
        MemberStore.Service,
        MemberStore.Service.of({
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
          rename: unexpected,
        }),
      ),
      Context.add(
        InvitationStore.Service,
        InvitationStore.Service.of({
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
          discardPendingForGroup: unexpected,
          markSeen: unexpected,
          accept: unexpected,
          get: unexpected,
          listPendingByRecipient: unexpected,
          listLatestByRecipient: unexpected,
          listLatestPendingByRecipient: unexpected,
          listPendingByThread: unexpected,
          countPendingByRecipient: unexpected,
          countPendingByGroup: unexpected,
          insert: unexpected,
          insertMany: unexpected,
        }),
      ),
      Context.add(ThreadStore.Service, {
        get: unexpected,
        listByGroup: unexpected,
        listByLatest: unexpected,
        listByStart: unexpected,
        insert: unexpected,
        getLatest: unexpected,
        recordLatest: unexpected,
      }),
      Context.add(ThreadParticipationStore.Service, {
        get: unexpected,
        getMany: unexpected,
        listByThread: unexpected,
        pageActiveByThread: unexpected,
        findActive: unexpected,
        endByAdmission: unexpected,
        insert: unexpected,
        end: unexpected,
      }),
      Context.add(ThreadMessageStore.Service, {
        get: unexpected,
        getMany: unexpected,
        insert: unexpected,
      }),
      Context.add(ThreadActivityStore.Service, {
        latest: unexpected,
        get: unexpected,
        listByThread: unexpected,
        getFirst: unexpected,
        countByKind: unexpected,
        readPage: unexpected,
        insert: unexpected,
      }),
      Context.add(
        GroupStore.Service,
        GroupStore.Service.of({
          get: unexpected,
          getMany: unexpected,
          findDirect: unexpected,
          pagePublic: unexpected,
          insert: unexpected,
          rename: unexpected,
          getLatest: unexpected,
          recordLatest: unexpected,
        }),
      ),
      Context.add(
        GroupMembershipStore.Service,
        GroupMembershipStore.Service.of({
          get: unexpected,
          getMany: unexpected,
          findActive: unexpected,
          listByGroup: unexpected,
          findActiveMany: unexpected,
          summarize: unexpected,
          pageActiveByGroup: unexpected,
          pageActiveByMember: unexpected,
          listActiveByMember: unexpected,
          insert: unexpected,
          markRemoved: unexpected,
        }),
      ),
      Context.add(
        ReadStateStore.Service,
        ReadStateStore.Service.of({
          getThreadPositions: unexpected,
          advanceThread: unexpected,
          getGroupReads: unexpected,
          advanceGroup: unexpected,
        }),
      ),
      Context.add(
        GroupFollowStore.Service,
        GroupFollowStore.Service.of({
          get: unexpected,
          findActive: unexpected,
          findActiveMany: unexpected,
          listActiveByGroup: unexpected,
          insert: unexpected,
          end: unexpected,
        }),
      ),
      Context.add(
        TurnStore.Service,
        TurnStore.Service.of({
          get: unexpected,
          findActive: unexpected,
          findLatest: unexpected,
          listActive: unexpected,
          listActiveByMember: unexpected,
          insert: unexpected,
          update: unexpected,
        }),
      ),
      Context.add(
        RoleStore.Service,
        RoleStore.Service.of({
          get: unexpected,
          insert: unexpected,
          rename: unexpected,
          setPermissions: unexpected,
          builtinRevision: unexpected(),
          recordBuiltinRevision: unexpected,
        }),
      ),
      Context.add(
        AssignmentStore.Service,
        AssignmentStore.Service.of({
          get: unexpected,
          listActiveByMember: unexpected,
          listActiveByRole: unexpected,
          insert: unexpected,
          markRevoked: unexpected,
        }),
      ),
    )
    .pipe(
      Context.add(
        SessionStateStore.Service,
        SessionStateStore.Service.of({ get: unexpected, set: unexpected }),
      ),
      Context.add(
        SessionLogStore.Service,
        SessionLogStore.Service.of({
          head: unexpected,
          append: unexpected,
          read: unexpected,
          waitForAppend: unexpected,
        }),
      ),
      Context.add(
        ConnectionV2Store.Service,
        ConnectionV2Store.Service.of({
          get: unexpected,
          listActive: unexpected(),
          insert: unexpected,
          update: unexpected,
        }),
      ),
      Context.add(
        ConnectionV2CredentialStore.Service,
        ConnectionV2CredentialStore.Service.of({
          set: unexpected,
          get: unexpected,
          remove: unexpected,
        }),
      ),
      Context.add(
        AgentV2Store.Service,
        AgentV2Store.Service.of({
          get: unexpected,
          list: unexpected(),
          insert: unexpected,
          update: unexpected,
        }),
      ),
      // Signals no test here observes: published into nothing, and no subscriber ever hears one.
      Context.add(
        SignalHub.Service,
        SignalHub.Service.of({
          publish: () => Effect.void,
          subscribe: Effect.succeed(Stream.never),
        }),
      ),
    );
};
const host = (storage: WorkspaceStorage.Interface) =>
  Layer.mergeAll(
    Layer.succeed(WorkspaceStorage.Service, storage),
    TurnJobs.layerNoRunner,
    Layer.succeed(
      Crypto.Crypto,
      Crypto.make({ randomBytes: (size) => new Uint8Array(size), digest: unexpected }),
    ),
  );
const run = <A, E>(
  program: (gateway: Gateway.Interface) => Effect.Effect<A, E, Scope.Scope>,
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
        const enter = <A, E>(
          program: Effect.Effect<A, E>,
        ): Effect.Effect<
          A,
          | GatewayErrors.PublicErrorOf<E>
          | GatewayErrors.NotMember
          | GatewayErrors.WorkspaceNotFound,
          Scope.Scope
        > =>
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
        const missing = new MemberService.NotFound({ workspaceId, memberId });
        expect(yield* Effect.flip(enter(Effect.fail(missing)))).toBe(missing);
        const missingNotification = new NotificationService.NotFound({
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
        const malformed = { _tag: "MemberService.NotFound", workspaceId, memberId: 42 };
        expect(
          defect(yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.fail(malformed)))),
        ).toBe(malformed);
        const interrupted = yield* Effect.exit(gateway.inWorkspace(workspaceId, Effect.interrupt));
        expect(Exit.hasInterrupts(interrupted)).toBe(true);
        expect(Exit.hasDies(interrupted)).toBe(false);
      }),
    ),
);

it.effect("projection replay failures are defects before the operation runs", () =>
  Effect.gen(function* () {
    let called = false;
    const operation = Effect.sync(() => {
      called = true;
    });
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
          : Effect.flatMap(Gateway.Service, program).pipe(Effect.provide(Gateway.layer()));
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
          expect(executed).toBe(0);
          yield* Deferred.succeed(resume, undefined);
          yield* Fiber.join(requests);
          expect(executed).toBe(20);
          expect(reads).toBe(1); // One boot, which reads the log once to find it empty.
          const views = bound;
          yield* gateway.asMember(workspaceId, alice, operation);
          yield* gateway.inWorkspace(workspaceId, operation);
          // Later requests reuse the booted workspace, with no admission check or view of their own.
          expect(bound).toBe(views);
          expect(reads).toBe(1);
          expect(executed).toBe(22);
        }).pipe(Effect.provide(host(storage)));
      }),
    );
  }),
);

/** Admission against one workspace's stores, counting boots by their replay's read. */
const admitting = Effect.fnUntraced(function* (
  options: BindingOptions & {
    readonly setLive?: Checkpoint.Interface["setLive"];
    /** Runs as a boot replays, as a rebuild would restore the read models. */
    readonly onBoot?: () => void;
  },
) {
  const boots = { reads: 0 };
  const gateway = yield* Gateway.make().pipe(
    Effect.provideService(WorkspaceStorage.Service, {
      forWorkspace: () =>
        Effect.succeed(
          Context.add(
            bindings(
              Object.assign({}, options, {
                read: () =>
                  Effect.sync(() => {
                    boots.reads += 1;
                    options.onBoot?.();
                    return [];
                  }),
              }),
            ),
            Checkpoint.Service,
            Checkpoint.Service.of({
              get: () => Effect.succeedNone,
              set: unexpected,
              listLive: options.listLive ?? (() => Effect.succeed([])),
              setLive: options.setLive ?? unexpected,
            }),
          ),
        ),
    }),
  );
  return { gateway, boots };
});
const liveVersion: Checkpoint.LiveVersion = { name: "members", version: 1 };

it.effect("a workspace that was never created is refused without being prepared", () =>
  Effect.gen(function* () {
    const { gateway, boots } = yield* admitting({
      head: () => Effect.succeedNone,
      findActive: () => Effect.succeedNone,
    });
    expect(yield* Effect.flip(gateway.asMember(workspaceId, alice, Effect.void))).toEqual(
      new GatewayErrors.NotMember({ workspaceId }),
    );
    expect(yield* Effect.flip(gateway.inWorkspace(workspaceId, Effect.void))).toEqual(
      new GatewayErrors.WorkspaceNotFound({ workspaceId }),
    );
    // Nothing was booted, and nothing was written: setLive would have failed the request.
    expect(boots.reads).toBe(0);
  }).pipe(Effect.scoped, Effect.provide(host({ forWorkspace: unexpected }))),
);

it.effect("a non-member of a created workspace is refused without preparing it", () =>
  Effect.gen(function* () {
    let called = false;
    const { gateway, boots } = yield* admitting({
      findActive: () => Effect.succeedNone,
      listLive: () => Effect.succeed([liveVersion]),
    });
    const refused = yield* Effect.flip(
      gateway.asMember(
        workspaceId,
        alice,
        Effect.sync(() => {
          called = true;
        }),
      ),
    );
    expect(refused).toEqual(new GatewayErrors.NotMember({ workspaceId }));
    expect(called).toBe(false);
    expect(boots.reads).toBe(0);
  }).pipe(Effect.scoped, Effect.provide(host({ forWorkspace: unexpected }))),
);

it.effect(
  "a member's first request prepares the workspace, and the admission check answers it",
  () =>
    Effect.gen(function* () {
      const lookups: Array<Identity.MemberReference> = [];
      const { gateway, boots } = yield* admitting({
        findActive: (identity) =>
          Effect.sync(() => {
            lookups.push(identity);
            return Option.some({ id: memberId, workspaceId, identity, status: "active" as const });
          }),
      });
      expect(yield* gateway.asMember(workspaceId, alice, Actor.Service)).toEqual({
        workspaceId,
        memberId,
        identity: alice,
      });
      expect(boots.reads).toBe(1);
      expect(lookups).toEqual([alice]);
      // A prepared workspace resolves each later caller inside it, without another admission view.
      yield* gateway.asMember(workspaceId, agent, Actor.Service);
      expect(lookups).toEqual([alice, agent]);
      expect(boots.reads).toBe(1);
    }).pipe(Effect.scoped, Effect.provide(host({ forWorkspace: unexpected }))),
);

it.effect("read models awaiting a rebuild are prepared first, then resolve membership", () =>
  Effect.gen(function* () {
    // Before boot rebuilds them, the read models know no one and nothing is live; the created
    // workspace's history is what lets the request prepare it.
    let rebuilt = false;
    const { gateway, boots } = yield* admitting({
      findActive: (identity) =>
        Effect.sync(() =>
          rebuilt && identity.id === alice.id
            ? Option.some({ id: memberId, workspaceId, identity, status: "active" as const })
            : Option.none(),
        ),
      onBoot: () => {
        rebuilt = true;
      },
    });
    expect((yield* gateway.asMember(workspaceId, alice, Actor.Service)).identity).toEqual(alice);
    expect(boots.reads).toBe(1);
    // The rebuilt read models still refuse someone who is not a member.
    expect(yield* Effect.flip(gateway.asMember(workspaceId, agent, Effect.void))).toEqual(
      new GatewayErrors.NotMember({ workspaceId }),
    );
  }).pipe(Effect.scoped, Effect.provide(host({ forWorkspace: unexpected }))),
);

/** A gateway whose workspace boots are counted by their replay's read, for runtime lifetime tests. */
const counted = Effect.fnUntraced(function* (options: Gateway.Options) {
  const boots = { bound: 0, reads: 0 };
  const gateway = yield* Gateway.make(options).pipe(
    Effect.provideService(WorkspaceStorage.Service, {
      forWorkspace: () =>
        Effect.sync(() => {
          boots.bound += 1;
          return bindings({
            read: () =>
              Effect.sync(() => {
                boots.reads += 1;
                return [];
              }),
          });
        }),
    }),
  );
  return { gateway, boots };
});

it.effect("an idle workspace is released after its time-to-live and boots again from storage", () =>
  Effect.gen(function* () {
    const { gateway, boots } = yield* counted({ idleTimeToLive: "1 minute" });
    // Each request's lease closes with its scope, as an HTTP response's does once it is sent.
    yield* Effect.scoped(gateway.inWorkspace(workspaceId, Effect.void));
    expect(boots.reads).toBe(1);
    // Each request restarts the idle time from its release.
    yield* TestClock.adjust("59 seconds");
    yield* Effect.scoped(gateway.asMember(workspaceId, alice, Effect.void));
    yield* TestClock.adjust("59 seconds");
    yield* Effect.scoped(gateway.inWorkspace(workspaceId, Effect.void));
    expect(boots.reads).toBe(1);
    yield* TestClock.adjust("1 minute");
    yield* Effect.scoped(gateway.asMember(workspaceId, alice, Effect.void));
    expect(boots.reads).toBe(2);
  }).pipe(Effect.scoped, Effect.provide(host({ forWorkspace: unexpected }))),
);

it.effect("an open lease keeps its workspace prepared past the time-to-live", () =>
  Effect.gen(function* () {
    const { gateway, boots } = yield* counted({ idleTimeToLive: "1 minute" });
    // A response stream holds its lease the same way until the client disconnects.
    const stream = yield* Scope.make();
    yield* gateway.asMember(workspaceId, alice, Effect.void).pipe(Scope.provide(stream));
    yield* TestClock.adjust("10 minutes");
    yield* Effect.scoped(gateway.inWorkspace(workspaceId, Effect.void));
    expect(boots.reads).toBe(1);
    yield* Scope.close(stream, Exit.void);
    yield* TestClock.adjust("59 seconds");
    yield* Effect.scoped(gateway.inWorkspace(workspaceId, Effect.void));
    expect(boots.reads).toBe(1);
    yield* TestClock.adjust("1 minute");
    yield* Effect.scoped(gateway.inWorkspace(workspaceId, Effect.void));
    expect(boots.reads).toBe(2);
  }).pipe(Effect.scoped, Effect.provide(host({ forWorkspace: unexpected }))),
);

it.effect("a failed boot is discarded and a later acquisition retries once", () =>
  Effect.gen(function* () {
    const failure = new Store.Failure({ operation: "read", cause: "boot failed" });
    let reads = 0;
    let executed = 0;
    yield* Effect.scoped(
      Effect.gen(function* () {
        const gateway = yield* Gateway.make();
        const operation = Effect.sync(() => {
          executed += 1;
        });
        expect(defect(yield* Effect.exit(gateway.inWorkspace(workspaceId, operation)))).toBe(
          failure,
        );
        expect(executed).toBe(0);
        yield* gateway.inWorkspace(workspaceId, operation);
        yield* gateway.inWorkspace(workspaceId, operation);
        expect(executed).toBe(2);
        expect(reads).toBe(2); // The failed boot and its one retry.
      }),
    ).pipe(
      Effect.provide(
        host({
          forWorkspace: () =>
            Effect.succeed(
              bindings({
                read: () =>
                  Effect.suspend(() => {
                    reads += 1;
                    return reads === 1 ? Effect.fail(failure) : Effect.succeed([]);
                  }),
              }),
            ),
        }),
      ),
    );
  }),
);

it.effect("interrupting a caller leaves shared boot available to the next request", () =>
  Effect.gen(function* () {
    let boots = 0;
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
          expect(boots).toBe(1);
        }).pipe(
          Effect.provide(
            host({
              // Boot pauses in its replay, after the first caller's admission check.
              forWorkspace: () =>
                Effect.succeed(
                  bindings({
                    read: () =>
                      Effect.gen(function* () {
                        boots += 1;
                        yield* Deferred.succeed(entered, undefined);
                        yield* Deferred.await(resume);
                        return [];
                      }),
                  }),
                ),
            }),
          ),
        );
      }),
    );
  }),
);

it.effect("workspace runtimes are isolated and a new host boots from storage again", () =>
  Effect.gen(function* () {
    const booted: Array<Workspace.Id> = [];
    const storage = {
      forWorkspace: (id: Workspace.Id) =>
        Effect.succeed(
          bindings({
            workspaceId: id,
            read: () =>
              Effect.sync(() => {
                booted.push(id);
                return [];
              }),
          }),
        ),
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
    expect(booted).toEqual([workspaceId, other, workspaceId, other]);
  }),
);

it.effect(
  "boot uses the host context and does not capture the first request's actor or transaction",
  () =>
    Effect.scoped(
      Effect.gen(function* () {
        const gateway = yield* Gateway.make();
        const inRequest = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
          effect.pipe(
            Effect.provideService(Actor.Service, { workspaceId, memberId, identity: alice }),
            Effect.provideService(Store.Transaction, {
              id: Commit.Id.make("request"),
              append: unexpected,
              afterCommit: unexpected,
            }),
          );
        yield* inRequest(gateway.inWorkspace(workspaceId, Effect.void));
        // A member's admission check reads another cold workspace's stores as the host, too.
        yield* inRequest(gateway.asMember(Workspace.Id.make("cold"), alice, Effect.void));
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
          forWorkspace: (id) =>
            Effect.gen(function* () {
              expect(Option.isNone(yield* Effect.serviceOption(Actor.Service))).toBe(true);
              expect(Option.isNone(yield* Effect.serviceOption(Store.Transaction))).toBe(true);
              return bindings({ workspaceId: id });
            }),
        }),
      ),
    ),
);

it.effect("host shutdown closes runtimes even with an outstanding request lease", () =>
  Effect.scoped(
    Effect.gen(function* () {
      const owner = yield* Scope.fork(yield* Scope.Scope);
      const runtimes = yield* WorkspaceRuntime.make().pipe(Scope.provide(owner));
      yield* runtimes.lease(workspaceId);
      yield* Scope.close(owner, Exit.void);
      expect(Exit.hasInterrupts(yield* Effect.exit(runtimes.lease(workspaceId)))).toBe(true);
    }),
  ).pipe(Effect.provide(host({ forWorkspace: () => Effect.succeed(bindings()) }))),
);
