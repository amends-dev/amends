/** Fixtures the suites share: identities, bound stores, and cores and gateways over a host. */
import * as Core from "@amends/core";
import { ReadStateStore } from "@amends/core/read-state";
import {
  Assignment,
  AssignmentFacts,
  AssignmentStore,
  BuiltinRoles,
  type Role,
  RoleStore,
} from "@amends/core/authorization";
import { GroupQuery, GroupFollowStore, GroupMembershipStore, GroupStore } from "@amends/core/group";
import { type Actor, Identity, Performer } from "@amends/core/identity";
import { Checkpoint, Event, Journal, Log, Publication, Store } from "@amends/core/journal";
import { Notification, NotificationStore } from "@amends/core/notification";
import {
  type ThreadActivity,
  ThreadActivityKind,
  ThreadActivityResolvers,
  ThreadActivityStore,
  ThreadCommand,
  ThreadMessage,
  ThreadMessageActivity,
  ThreadMessageStore,
  ThreadMessageTimeline,
  ThreadParticipationStore,
  ThreadParticipationTimeline,
  ThreadQuery,
  ThreadStore,
  type Thread,
} from "@amends/core/thread";
import {
  type Invitation,
  InvitationStore,
  type Member,
  MemberFacts,
  MemberStore,
  Workspace,
  WorkspaceInitialization,
  WorkspaceStore,
} from "@amends/core/workspace";
import { ConnectionCredentialStore, ConnectionStore } from "@amends/core/connection";
import { AgentStore } from "@amends/core/agent";
import {
  ChannelBindingStore,
  ChannelStore,
  ContactStore,
  DeliveryJobs,
  DeliveryStore,
} from "@amends/core/channel";
import { TaskStore, TaskTimeline } from "@amends/core/task";
import { ChannelTransport, Integration, Integrations, type ModelCatalog } from "@amends/connection";
import {
  SessionLogStore,
  SessionStateStore,
  type Turn,
  TurnJobs,
  TurnStore,
  TurnTimeline,
} from "@amends/core/turn";
import { Harness as AgentHarness } from "@amends/harness";
import { Gateway, WorkspaceStorage } from "@amends/gateway";
import { Clock, Context, DateTime, Effect, Layer, Option, Redacted, Result, Schema } from "effect";
import type { Harness, Host, Storage } from "./harness.ts";

export const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") });
export const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") });
export const charlie = Identity.Reference.cases.Human.make({
  id: Identity.HumanId.make("charlie"),
});
export const workspaceId = Workspace.Id.make("workspace-one");
export const otherWorkspaceId = Workspace.Id.make("workspace-two");
export const journalLog = Log.Id.make("journal");

/** The key the test models integration's check accepts; any other it refuses. */
export const goodKey = "sk-good";

/** The model test models lists, which reasons with a low or high effort. */
export const testModel: ModelCatalog.Model = {
  id: "test-model",
  name: "Test model",
  protocol: "openai-chat",
  url: "https://models.example/v1",
  released: "2026-01",
  limits: { context: 100_000, output: 8_000 },
  modalities: { input: ["text"], output: ["text"] },
  tools: true,
  reasoning: { toggle: false, efforts: ["low", "high"] },
};

/**
 * The harness of an agent named `id` that no suite starts a session with: suites run turns
 * themselves, as a host's turn jobs would, through turn execution.
 */
const idleHarness = (id: string, requiresSandbox: boolean) =>
  Effect.succeed(
    AgentHarness.make({
      id,
      requiresSandbox,
      createSession: () => Effect.die("No suite starts a session"),
    }),
  );

/** A message the test channel transport posted to an external conversation. */
export interface PostedMessage {
  readonly conversation: ChannelTransport.Conversation;
  readonly outgoing: ChannelTransport.Outgoing;
  readonly messageId: ChannelTransport.ExternalId;
}

/** What the test channel transport posted and no suite has taken yet, in order. */
const postedMessages: Array<PostedMessage> = [];

/** The messages the test channel transport posted since the last take, in order. */
export const takePosted = Effect.sync(() => postedMessages.splice(0));

/**
 * The test channel transport, which the `test-channels` integration gives every connection: the
 * external system sends it what it received as JSON, the body being a `Received` as is, and it
 * records what it posts, naming each message `posted-N`. Its own id in the system is `bot`.
 */
const decodeReceived = Schema.decodeUnknownEffect(Schema.fromJsonString(ChannelTransport.Received));
export const testTransport: ChannelTransport.ChannelTransport = {
  self: ChannelTransport.ExternalId.make("bot"),
  receive: (inbound) =>
    decodeReceived(inbound.body).pipe(
      Effect.mapError(
        (error) =>
          new ChannelTransport.TransportError({
            reason: "rejected",
            description: "The body is not what the test system sends",
            cause: error,
          }),
      ),
    ),
  post: (conversation, outgoing) =>
    Effect.sync(() => {
      const messageId = ChannelTransport.ExternalId.make(`posted-${postedMessages.length + 1}`);
      postedMessages.push({ conversation, outgoing, messageId });
      return { messageId };
    }),
};
/**
 * The integrations the suites' hosts install: models at an endpoint a connection gives, reached
 * with a key or none, which list `testModel` and offer any other, and whose check accepts only
 * `goodKey`; tools that take no settings or key; a harness whose agent works only in a sandbox, and
 * one whose agent works in the host's process; sandboxes; and channels over `testTransport`. No
 * suite starts a session or makes a sandbox.
 */
export const testIntegrations = [
  Integration.make({
    id: "test-models",
    name: "Test models",
    docs: "https://models.example/docs",
    settings: Schema.Struct({
      endpoint: Schema.NonEmptyString.annotate({ title: "Endpoint" }),
      region: Schema.optionalKey(Schema.NonEmptyString),
    }),
    auth: ["apiKey", "none"],
    models: {
      listed: [testModel],
      unlisted: true,
      endpoint: ({ settings }, { model }) =>
        Result.succeed({
          provider: "test-models",
          model,
          protocol: "openai-chat",
          url: settings.endpoint,
        }),
    },
    check: ({ apiKey }) =>
      Effect.succeed(
        apiKey !== undefined && Redacted.value(apiKey) === goodKey
          ? { status: "healthy" as const }
          : { status: "unauthorized" as const, description: "The key was refused" },
      ),
  }),
  Integration.make({
    id: "test-tools",
    name: "Test tools",
    auth: ["none"],
    tools: () => Effect.die("No suite calls a tool"),
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-harness",
    name: "Test harness",
    auth: ["none"],
    harnesses: { requiresSandbox: true, harness: () => idleHarness("test-harness", true) },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-in-process",
    name: "Test in process",
    auth: ["none"],
    harnesses: { requiresSandbox: false, harness: () => idleHarness("test-in-process", false) },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-sandboxes",
    name: "Test sandboxes",
    auth: ["none"],
    sandboxes: () => Effect.die("No suite makes a sandbox"),
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "test-channels",
    name: "Test channels",
    auth: ["none"],
    channels: () => Effect.succeed(testTransport),
    check: () => Effect.succeed({ status: "healthy" }),
  }),
];

/** What the suites' gateways install. */
export const installed = { integrations: testIntegrations };

/** A turn job request a commit made: to run an agent's work in a thread, or to stop its turn. */
export type TurnJobRequest =
  | { readonly kind: "run"; readonly memberId: Member.Id; readonly threadId: Thread.Id }
  | {
      readonly kind: "stop";
      readonly memberId: Member.Id;
      readonly threadId: Thread.Id;
      readonly turnId: Turn.Id;
    };

/** The turn job requests each workspace's commits made and no suite has taken yet, in order. */
const requestedTurnJobs = new Map<Workspace.Id, Array<TurnJobRequest>>();
const keepOnceCommitted = (workspaceId: Workspace.Id, request: TurnJobRequest) =>
  Effect.flatMap(Store.Transaction, (storeTransaction) =>
    storeTransaction.afterCommit(
      Effect.sync(() => {
        requestedTurnJobs.set(workspaceId, [
          ...(requestedTurnJobs.get(workspaceId) ?? []),
          request,
        ]);
      }),
    ),
  );

/**
 * Turn jobs the suites run themselves: a commit's requests are kept once it commits, and
 * `takeTurnJobs` hands them to the suite, which runs the turns through turn execution as a host's
 * turn jobs would.
 */
export const recordedTurnJobs = TurnJobs.Service.of({
  requestRun: ({ workspaceId, memberId, threadId }) =>
    keepOnceCommitted(workspaceId, { kind: "run", memberId, threadId }),
  requestStop: ({ workspaceId, memberId, threadId, turnId }) =>
    keepOnceCommitted(workspaceId, { kind: "stop", memberId, threadId, turnId }),
});
export const layerRecordedTurnJobs = Layer.succeed(TurnJobs.Service, recordedTurnJobs);

/** The delivery job requests each workspace's commits made and no suite has taken yet, in order. */
const requestedDeliveryJobs = new Map<Workspace.Id, Array<Thread.Id>>();

/**
 * Delivery jobs the suites run themselves: a commit's requests are kept once it commits, and
 * `takeDeliveryJobs` hands the threads to the suite, which delivers through delivery execution as a
 * host's delivery jobs would.
 */
export const recordedDeliveryJobs = DeliveryJobs.Service.of({
  requestDeliver: ({ workspaceId, threadId }) =>
    Effect.flatMap(Store.Transaction, (storeTransaction) =>
      storeTransaction.afterCommit(
        Effect.sync(() => {
          const requested = requestedDeliveryJobs.get(workspaceId) ?? [];
          if (!requested.includes(threadId))
            requestedDeliveryJobs.set(workspaceId, [...requested, threadId]);
        }),
      ),
    ),
});
export const layerRecordedDeliveryJobs = Layer.succeed(DeliveryJobs.Service, recordedDeliveryJobs);

/** The threads whose delivery the workspace's commits requested since the last take, in order. */
export const takeDeliveryJobs = (id: Workspace.Id) =>
  Effect.sync(() => {
    const requested = requestedDeliveryJobs.get(id) ?? [];
    requestedDeliveryJobs.delete(id);
    return requested;
  });

/** The turn job requests the workspace's commits made since the last take, in order. */
export const takeTurnJobs = (id: Workspace.Id) =>
  Effect.sync(() => {
    const requested = requestedTurnJobs.get(id) ?? [];
    requestedTurnJobs.delete(id);
    return requested;
  });

/** The bound stores by name, for direct assertions beside the context core receives. */
export const bind = (
  context: Context.Context<
    WorkspaceStorage.Bindings | TurnJobs.Service | DeliveryJobs.Service | Integrations.Integrations
  >,
) => ({
  context,
  threads: Context.get(context, ThreadStore.Service),
  participations: Context.get(context, ThreadParticipationStore.Service),
  messages: Context.get(context, ThreadMessageStore.Service),
  activities: Context.get(context, ThreadActivityStore.Service),
  tasks: Context.get(context, TaskStore.Service),
  channels: Context.get(context, ChannelStore.Service),
  channelBindings: Context.get(context, ChannelBindingStore.Service),
  contacts: Context.get(context, ContactStore.Service),
  deliveries: Context.get(context, DeliveryStore.Service),
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
  connectionCredentials: Context.get(context, ConnectionCredentialStore.Service),
  agents: Context.get(context, AgentStore.Service),
  turns: Context.get(context, TurnStore.Service),
  sessionStates: Context.get(context, SessionStateStore.Service),
  sessionLogs: Context.get(context, SessionLogStore.Service),
});
export type Bound = ReturnType<typeof bind>;

/**
 * A recipient's notifications oldest first, as a suite reads all of them: the inbox's newest-first
 * page, reversed.
 */
export const listOldestFirst = (
  notificationStore: NotificationStore.Interface,
  recipient: Notification.Recipient,
  options: { readonly limit: number },
) =>
  Effect.map(notificationStore.listLatestByRecipient(recipient, options), (latest) =>
    latest.toReversed(),
  );

/**
 * A workspace's stores and signal hub, with turn jobs the suites run themselves: a suite takes the
 * requests its commits made, and runs the turns it expects, as a host's turn jobs would.
 */
const withHostServices = (context: Context.Context<WorkspaceStorage.Bindings>) =>
  Effect.map(Integrations.make(testIntegrations), (integrations) =>
    bind(
      context.pipe(
        Context.add(TurnJobs.Service, recordedTurnJobs),
        Context.add(DeliveryJobs.Service, recordedDeliveryJobs),
        Context.add(Integrations.Integrations, integrations),
      ),
    ),
  );

/** One workspace's stores and signals on a host. */
export const forWorkspace = (host: Context.Context<Host>, id: Workspace.Id) =>
  Effect.flatMap(Context.get(host, WorkspaceStorage.Service).forWorkspace(id), withHostServices);

/** One workspace's stores and signals on the host in context, as a gateway's caller has it. */
export const boundTo = (id: Workspace.Id) =>
  Effect.flatMap(WorkspaceStorage.Service, (workspaceStorage) =>
    Effect.flatMap(workspaceStorage.forWorkspace(id), withHostServices),
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
  /** A gateway over a host, which installs what the suites' hosts do, or what `options` say. */
  const gateway = (host: Context.Context<Host>, options: Gateway.Options = installed) =>
    Gateway.layer(options).pipe(
      Layer.provideMerge(
        Layer.mergeAll(
          Layer.succeedContext(host),
          harness.crypto,
          layerRecordedTurnJobs,
          layerRecordedDeliveryJobs,
        ),
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
                workspaceId: bound.store.workspaceId,
                memberId: member.memberId,
                identity: member.identity,
              });
            for (const viewer of viewers)
              yield* journal.publish(AssignmentFacts.Created, {
                workspaceId: bound.store.workspaceId,
                assignmentId: Assignment.Id.make(`viewer:${viewer.memberId}`),
                memberId: viewer.memberId,
                source: {
                  _tag: "Role",
                  roleId: BuiltinRoles.MemberId,
                  scope: { _tag: "Workspace", workspaceId: bound.store.workspaceId },
                },
              });
          }),
        ),
      ).pipe(
        Effect.provideService(Publication.Service, testProvenance(bound.store.workspaceId)),
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

/**
 * A post's result with the timeline activity that placed its message, read back from the store:
 * starts and replies return what they created, not where it landed in the timeline.
 */
export const placed = Effect.fnUntraced(function* <
  A extends { readonly message: ThreadMessage.Record },
>(result: A) {
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const found = (yield* threadActivityStore.listByThread(result.message.threadId)).find(
    (activity) => publishedMessage(activity) === result.message.id,
  );
  if (found === undefined) return yield* Effect.die(new Error("A posted message has no activity"));
  const activity = yield* Effect.orDie(
    ThreadActivityKind.decode(ThreadMessageActivity.Published, found),
  );
  return Object.assign({}, result, { activity });
});

/** `placed`, reading a workspace binding's store, for a post made through the gateway. */
export const placedIn =
  (bound: Bound) =>
  <A extends { readonly message: ThreadMessage.Record }>(result: A) =>
    placed(result).pipe(Effect.provideService(ThreadActivityStore.Service, bound.activities));

/**
 * Core's internal thread reads and writes, for fixtures that write what no operation does. Provide
 * it over a workspace's core; timelines resolve as core registers them.
 */
export const threadInternals = ThreadCommand.layer.pipe(
  Layer.provideMerge(ThreadQuery.layer),
  Layer.provide(
    Layer.mergeAll(
      GroupQuery.layer,
      ThreadActivityResolvers.layer([
        ThreadMessageTimeline.resolver,
        ThreadParticipationTimeline.resolver,
        TurnTimeline.resolver,
        TaskTimeline.resolver,
      ]),
    ),
  ),
);

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
        ? [...rows, ...(Option.isSome(replacement) ? [replacement.value] : [])]
        : rows,
    ),
});

export * as Support from "./support.ts";
