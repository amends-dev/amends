/** Fixtures the suites share: identities, bound stores, and cores and gateways over a host. */
import * as Core from "@amends/core";
import { ReadStateStore } from "@amends/core/attention";
import {
  Assignment,
  AssignmentFacts,
  AssignmentStore,
  BuiltinRoles,
  type Role,
  RoleStore,
} from "@amends/core/authorization";
import { GroupFollowStore, GroupMembershipStore, GroupStore } from "@amends/core/group";
import { type Actor, Identity, Performer } from "@amends/core/identity";
import { Checkpoint, Event, Journal, Log, Publication, Store } from "@amends/core/journal";
import { NotificationStore } from "@amends/core/notification";
import {
  type ThreadActivity,
  ThreadActivityKind,
  ThreadActivityStore,
  ThreadMessageActivity,
  ThreadMessageStore,
  ThreadParticipationStore,
  ThreadStore,
} from "@amends/core/thread";
import {
  type Invitation,
  InvitationStore,
  MemberFacts,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { BackgroundWakes } from "@amends/core/background";
import {
  ConnectionCatalog,
  ConnectionCredentialStore,
  ConnectionStore,
} from "@amends/core/connection";
import { ConnectionImplementation } from "@amends/connection";
import { AgentStore } from "@amends/core/agent";
import { EnvironmentCatalog, EnvironmentStore } from "@amends/core/environment";
import { Harness as HarnessContract, HarnessImplementation } from "@amends/harness";
import { SandboxImplementation } from "@amends/sandbox";
import { Gateway, SignalHub, WorkspaceStorage, WorkspaceWakes } from "@amends/gateway";
import { Signals } from "@amends/core/signal";
import { Clock, Context, DateTime, Effect, Layer, type Option, Schema } from "effect";
import type { Harness, Host, Storage } from "./harness.ts";

export const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
export const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
export const charlie = Identity.Reference.cases.Human.make({
  id: Identity.HumanId.make("charlie"),
});
export const workspaceId = Workspace.Id.make("workspace-one");
export const otherWorkspaceId = Workspace.Id.make("workspace-two");
export const journalLog = Log.Id.make("journal");

/**
 * The connection implementation the suites' hosts install: model inference behind a required
 * endpoint, authenticated by an API key or not at all.
 */
export const testImplementation = ConnectionImplementation.Declaration.make({
  id: ConnectionImplementation.Id.make("test-models"),
  name: "Test models",
  description: "A model provider for conformance tests.",
  capabilities: { modelInference: { interface: "test-messages" } },
  settings: [
    { key: "endpoint", label: "Endpoint", kind: "url", required: true },
    { key: "region", label: "Region", kind: "text", required: false },
  ],
  authentication: [{ _tag: "ApiKey", label: "API key" }, { _tag: "None" }],
});
/** A connection implementation for an account at the suites' hosted sandbox provider. */
export const testSandboxAccount = ConnectionImplementation.Declaration.make({
  id: ConnectionImplementation.Id.make("test-cloud"),
  name: "Test cloud",
  description: "An account at a sandbox provider for conformance tests.",
  capabilities: { sandbox: { provider: "test-cloud" } },
  settings: [],
  authentication: [{ _tag: "ApiKey", label: "API key" }],
});
export const catalog = ConnectionCatalog.make([testImplementation, testSandboxAccount]);

/**
 * The harnesses the suites' hosts install: amends's own, in process over any model connection,
 * and one that runs only inside a sandbox, speaking the test models' interface.
 */
export const testHarnesses = [
  HarnessImplementation.Declaration.make({
    id: HarnessContract.Name.make("amends"),
    name: "Amends",
    description: "An in-process harness for conformance tests.",
    placement: ["in-process"],
    models: { _tag: "LanguageModel" },
  }),
  HarnessImplementation.Declaration.make({
    id: HarnessContract.Name.make("boxed"),
    name: "Boxed",
    description: "A harness that runs inside a sandbox.",
    placement: ["in-sandbox"],
    models: { _tag: "Interfaces", interfaces: ["test-messages"] },
    reasoning: ["low", "high"],
  }),
];
/** A local provider that takes no account, and a hosted one that runs under an account. */
export const testSandboxes = [
  SandboxImplementation.Declaration.make({
    id: SandboxImplementation.Id.make("test-local"),
    name: "Test local",
    description: "A sandbox provider without an account.",
    capabilities: { stdin: true, snapshots: "none", isolated: false },
    account: false,
  }),
  SandboxImplementation.Declaration.make({
    id: SandboxImplementation.Id.make("test-cloud"),
    name: "Test cloud",
    description: "A sandbox provider that runs under an account.",
    capabilities: { stdin: false, snapshots: "filesystem", isolated: true },
    account: true,
    template: { label: "Image" },
  }),
];
export const environmentCatalog = EnvironmentCatalog.make({
  harnesses: testHarnesses,
  sandboxes: testSandboxes,
});
/** What the suites' gateways install. */
export const installed = {
  connections: [testImplementation, testSandboxAccount],
  harnesses: testHarnesses,
  sandboxes: testSandboxes,
};

/** The bound stores by name, for direct assertions beside the context core receives. */
export const bind = (
  context: Context.Context<
    | WorkspaceStorage.Bindings
    | Signals.Service
    | BackgroundWakes.Service
    | ConnectionCatalog.Service
    | EnvironmentCatalog.Service
  >,
) => ({
  context,
  threads: Context.get(context, ThreadStore.Service),
  participations: Context.get(context, ThreadParticipationStore.Service),
  messages: Context.get(context, ThreadMessageStore.Service),
  activities: Context.get(context, ThreadActivityStore.Service),
  store: Context.get(context, Store.Service),
  checkpoints: Context.get(context, Checkpoint.Service),
  workspace: Context.get(context, WorkspaceStore.Service),
  members: Context.get(context, MemberStore.Service),
  roles: Context.get(context, RoleStore.Service),
  assignments: Context.get(context, AssignmentStore.Service),
  invitations: Context.get(context, InvitationStore.Service),
  notifications: Context.get(context, NotificationStore.Service),
  groups: Context.get(context, GroupStore.Service),
  groupMemberships: Context.get(context, GroupMembershipStore.Service),
  groupFollows: Context.get(context, GroupFollowStore.Service),
  readStates: Context.get(context, ReadStateStore.Service),
  connections: Context.get(context, ConnectionStore.Service),
  credentials: Context.get(context, ConnectionCredentialStore.Service),
  environments: Context.get(context, EnvironmentStore.Service),
  agents: Context.get(context, AgentStore.Service),
});
export type Bound = ReturnType<typeof bind>;

/**
 * A workspace's stores with its signals from the host, and wakes that no suite asks for: no
 * background process is registered, so a commit asking for one would fail.
 */
const withHostServices = (
  context: Context.Context<WorkspaceStorage.Bindings>,
  hub: SignalHub.Interface,
  id: Workspace.Id,
) =>
  bind(
    Context.add(
      Context.add(
        Context.add(context, Signals.Service, hub.forWorkspace(id)),
        BackgroundWakes.Service,
        WorkspaceWakes.unavailable.forWorkspace(id),
      ),
      ConnectionCatalog.Service,
      catalog,
    ).pipe(Context.add(EnvironmentCatalog.Service, environmentCatalog)),
  );

/** One workspace's stores and signals on a host. */
export const forWorkspace = (host: Context.Context<Host>, id: Workspace.Id) =>
  Effect.map(Context.get(host, WorkspaceStorage.Service).forWorkspace(id), (context) =>
    withHostServices(context, Context.get(host, SignalHub.Service), id),
  );

/** One workspace's stores and signals on the host in context, as a gateway's caller has it. */
export const boundTo = (id: Workspace.Id) =>
  Effect.flatMap(Effect.context<WorkspaceStorage.Service | SignalHub.Service>(), (host) =>
    Effect.map(Context.get(host, WorkspaceStorage.Service).forWorkspace(id), (context) =>
      withHostServices(context, Context.get(host, SignalHub.Service), id),
    ),
  );

/**
 * The bound stores with each commit failing after its program completes, before it commits: a
 * failure after every projection has written, as a late write in the commit would cause.
 */
export const failingLate = (bound: Bound, failure: Store.Failure): Bound =>
  Object.assign({}, bound, {
    context: Context.add(
      bound.context,
      Store.Service,
      Store.Service.of(
        Object.assign({}, bound.store, {
          transaction: <A, E, R>(program: Effect.Effect<A, E, R>) =>
            bound.store.transaction(Effect.andThen(program, Effect.fail(failure))),
        }),
      ),
    ),
  });

/** Run a program on a new host over the storage, which stays open for the enclosing scope. */
export const runHost = <A, E, R>(storage: Storage, program: Effect.Effect<A, E, R>) =>
  Effect.flatMap(storage.connect(), (host) => Effect.provide(program, host));

/** Cores and gateways over the harness's hosts. */
export const make = (harness: Harness) => {
  const core = (bound: Bound) =>
    Core.layer.pipe(
      Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(bound.context), harness.crypto)),
    );
  /** A gateway over a host. */
  const gateway = (host: Context.Context<Host>) =>
    Gateway.layer(installed).pipe(
      Layer.provideMerge(
        Layer.mergeAll(Layer.succeedContext(host), harness.crypto, WorkspaceWakes.layerUnavailable),
      ),
    );
  return {
    core,
    gateway,
    /** Initialize the bound workspace for its creator, as the gateway's bootstrap does. */
    initialized: (bound: Bound, creator = alice.id) =>
      WorkspaceInitialization.initialize(creator, { name: "Test workspace" }).pipe(
        Effect.provide(core(bound)),
      ),
    /** Add members, giving some the viewer role, as invitation acceptance would. */
    seed: (
      bound: Bound,
      members: ReadonlyArray<Actor.Value>,
      viewers: ReadonlyArray<Actor.Value>,
    ) =>
      Effect.flatMap(Journal.Service, (journal) =>
        journal.commit(
          Effect.gen(function* () {
            for (const member of members)
              yield* journal.publish(MemberFacts.Added, {
                workspaceId: bound.workspace.workspaceId,
                memberId: member.memberId,
                identity: member.identity,
              });
            for (const viewer of viewers)
              yield* journal.publish(AssignmentFacts.Created, {
                workspaceId: bound.workspace.workspaceId,
                assignmentId: Assignment.Id.make(`viewer:${viewer.memberId}`),
                memberId: viewer.memberId,
                source: {
                  _tag: "Role",
                  roleId: BuiltinRoles.MemberId,
                  scope: { _tag: "Workspace", workspaceId: bound.workspace.workspaceId },
                },
              });
          }),
        ),
      ).pipe(
        Effect.provideService(Publication.Service, testProvenance(bound.workspace.workspaceId)),
        Effect.provide(core(bound)),
      ),
    /** Run a program on a gateway over a new host, which stays open for the enclosing scope. */
    runGateway: <A, E, R>(storage: Storage, program: Effect.Effect<A, E, R>) =>
      Effect.flatMap(storage.connect(), (host) => program.pipe(Effect.provide(gateway(host)))),
  };
};

/** The message a timeline activity publishes, when it is a message publication. */
export const publishedMessage = (activity: ThreadActivity.Record) =>
  ThreadActivityKind.is(ThreadMessageActivity.Published)(activity)
    ? Schema.decodeUnknownSync(ThreadMessageActivity.Published.details)(activity.details).messageId
    : undefined;

/** Attribution for low-level fixture writes outside application operations. */
export const testProvenance = (id = workspaceId): Event.Provenance => ({
  workspaceId: id,
  performedBy: { _tag: "System", id: Performer.SystemId.make("test-fixture") },
  causedBy: null,
  correlationId: Event.CorrelationId.make("test-operation"),
  occurredAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z"),
});

export const future = DateTime.now.pipe(Effect.map((now) => DateTime.add(now, { hours: 1 })));

/** Run a program with the clock reading a fixed time; sleeping still uses the real clock. */
export const at = <A, E, R>(time: DateTime.Utc, program: Effect.Effect<A, E, R>) =>
  Effect.clockWith((clock) =>
    program.pipe(
      Effect.provideService(Clock.Clock, {
        currentTimeMillis: Effect.succeed(DateTime.toEpochMillis(time)),
        currentTimeMillisUnsafe: () => DateTime.toEpochMillis(time),
        currentTimeNanos: Effect.succeed(BigInt(DateTime.toEpochMillis(time)) * 1_000_000n),
        currentTimeNanosUnsafe: () => BigInt(DateTime.toEpochMillis(time)) * 1_000_000n,
        monotonicTimeNanos: clock.monotonicTimeNanos,
        monotonicTimeNanosUnsafe: () => clock.monotonicTimeNanosUnsafe(),
        sleep: (duration) => clock.sleep(duration),
      }),
    ),
  );

export const request = (
  expiresAt: DateTime.Utc,
  recipientId = bob.id,
  roleId: Role.Id = BuiltinRoles.MemberId,
): Invitation.IssueInput => ({ recipientId, expiresAt, roleId });

/**
 * Replace what a store's by-ID reads return for one ID, in both single and batch reads;
 * `Option.none()` hides the record. Other IDs read through to the store.
 */
export const replacing = <Id, A, E>(
  store: {
    readonly get: (id: Id) => Effect.Effect<Option.Option<A>, E>;
    readonly getMany: (ids: ReadonlyArray<Id>) => Effect.Effect<ReadonlyArray<A>, E>;
  },
  id: Id,
  replacement: Option.Option<A>,
) => ({
  get: (requested: Id) => (requested === id ? Effect.succeed(replacement) : store.get(requested)),
  getMany: (ids: ReadonlyArray<Id>) =>
    Effect.map(store.getMany(ids.filter((requested) => requested !== id)), (rows) =>
      ids.includes(id)
        ? [...rows, ...(replacement._tag === "Some" ? [replacement.value] : [])]
        : rows,
    ),
});

export * as Support from "./support.ts";
