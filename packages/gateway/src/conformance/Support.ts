/**
 * What the conformance suites share, exported for an adapter's own tests and the gateway's: the
 * identities and workspaces tests use, a workspace's bound stores by name, cores and gateways over
 * a host, and fixture writes that no operation makes.
 *
 * @since 0.1.0
 */

import { Integrations } from "@amends-dev/connection"
import * as Core from "@amends-dev/core"
import { AgentStore } from "@amends-dev/core/agent"
import {
  Assignment,
  AssignmentFacts,
  AssignmentStore,
  BuiltinRoles,
  type Role,
  RoleStore
} from "@amends-dev/core/authorization"
import { ChannelBindingStore, ChannelStore, ContactStore, DeliveryJobs, DeliveryStore } from "@amends-dev/core/channel"
import { ConnectionCredentialStore, ConnectionStore } from "@amends-dev/core/connection"
import { GroupQuery, GroupFollowStore, GroupMembershipStore, GroupStore } from "@amends-dev/core/group"
import { type Actor, Identity, Performer } from "@amends-dev/core/identity"
import { Checkpoint, Entry, Event, Journal, Publication, Store, type StoreError } from "@amends-dev/core/journal"
import { type Notification, NotificationStore } from "@amends-dev/core/notification"
import { ReadStateStore } from "@amends-dev/core/read-state"
import { TaskStore, TaskTimeline } from "@amends-dev/core/task"
import {
  type ThreadActivity,
  ThreadActivityKind,
  ThreadActivityResolvers,
  ThreadActivityStore,
  ThreadCommand,
  type ThreadMessage,
  ThreadMessageActivity,
  ThreadMessageStore,
  ThreadMessageTimeline,
  ThreadParticipationStore,
  ThreadParticipationTimeline,
  ThreadQuery,
  ThreadStore
} from "@amends-dev/core/thread"
import { SessionLogStore, SessionStateStore, TurnJobs, TurnStore, TurnTimeline } from "@amends-dev/core/turn"
import {
  type Invitation,
  InvitationStore,
  Member,
  MemberFacts,
  MemberStore,
  WorkspaceInitialization,
  WorkspaceStore,
  WorkspaceId
} from "@amends-dev/core/workspace"
import * as Clock from "effect/Clock"
import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as DateTime from "effect/DateTime"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as Gateway from "../Gateway.ts"
import * as WorkspaceStorage from "../WorkspaceStorage.ts"
import type * as Fixture from "./Fixture.ts"

/**
 * The human who creates the suites' workspaces, unless a test names another creator.
 *
 * @category utils
 * @since 0.1.0
 */
export const alice = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("alice") })
/**
 * A second human, whom `request` invites unless a test names another recipient.
 *
 * @category utils
 * @since 0.1.0
 */
export const bob = Identity.Reference.cases.Human.make({ id: Identity.HumanId.make("bob") })
/**
 * A third human, for tests that need someone besides `alice` and `bob`.
 *
 * @category utils
 * @since 0.1.0
 */
export const charlie = Identity.Reference.cases.Human.make({
  id: Identity.HumanId.make("charlie")
})
/**
 * The workspace the suites write to, and the one `testProvenance` attributes writes to.
 *
 * @category utils
 * @since 0.1.0
 */
export const workspaceId = WorkspaceId.WorkspaceId.make("workspace-one")
/**
 * A second workspace, for tests that one workspace's storage never shows another's.
 *
 * @category utils
 * @since 0.1.0
 */
export const otherWorkspaceId = WorkspaceId.WorkspaceId.make("workspace-two")
/**
 * The journal's log ID, which core's `journalLog` also names, for reading its head directly.
 *
 * @category utils
 * @since 0.1.0
 */
export const journalLog = Entry.LogId.make("journal")

/**
 * The bound stores by name, for direct assertions beside the context core receives.
 *
 * @category utils
 * @since 0.1.0
 */
export const bind = (
  context: Context.Context<
    | WorkspaceStorage.Bindings
    | TurnJobs.TurnJobs
    | DeliveryJobs.DeliveryJobs
    | Integrations.Integrations
    | Crypto.Crypto
  >
) => ({
  context,
  threads: Context.get(context, ThreadStore.ThreadStore),
  participations: Context.get(context, ThreadParticipationStore.ThreadParticipationStore),
  messages: Context.get(context, ThreadMessageStore.ThreadMessageStore),
  activities: Context.get(context, ThreadActivityStore.ThreadActivityStore),
  tasks: Context.get(context, TaskStore.TaskStore),
  channels: Context.get(context, ChannelStore.ChannelStore),
  channelBindings: Context.get(context, ChannelBindingStore.ChannelBindingStore),
  contacts: Context.get(context, ContactStore.ContactStore),
  deliveries: Context.get(context, DeliveryStore.DeliveryStore),
  store: Context.get(context, Store.Store),
  checkpoints: Context.get(context, Checkpoint.Checkpoint),
  workspace: Context.get(context, WorkspaceStore.WorkspaceStore),
  members: Context.get(context, MemberStore.MemberStore),
  roles: Context.get(context, RoleStore.RoleStore),
  assignments: Context.get(context, AssignmentStore.AssignmentStore),
  invitations: Context.get(context, InvitationStore.InvitationStore),
  notifications: Context.get(context, NotificationStore.NotificationStore),
  groups: Context.get(context, GroupStore.GroupStore),
  groupMemberships: Context.get(context, GroupMembershipStore.GroupMembershipStore),
  groupFollows: Context.get(context, GroupFollowStore.GroupFollowStore),
  readStates: Context.get(context, ReadStateStore.ReadStateStore),
  connections: Context.get(context, ConnectionStore.ConnectionStore),
  connectionCredentials: Context.get(context, ConnectionCredentialStore.ConnectionCredentialStore),
  agents: Context.get(context, AgentStore.AgentStore),
  turns: Context.get(context, TurnStore.TurnStore),
  sessionStates: Context.get(context, SessionStateStore.SessionStateStore),
  sessionLogs: Context.get(context, SessionLogStore.SessionLogStore)
})
/**
 * A workspace's bound stores by name, with the context core receives, as `bind` returns them.
 *
 * @category models
 * @since 0.1.0
 */
export type Bound = ReturnType<typeof bind>

/**
 * A recipient's notifications oldest first, as a suite reads all of them: the inbox's newest-first
 * page, reversed.
 *
 * @category utils
 * @since 0.1.0
 */
export const listOldestFirst = (
  notificationStore: NotificationStore.NotificationStore["Service"],
  recipient: Notification.Recipient,
  options: { readonly limit: number }
) => Effect.map(notificationStore.listLatestByRecipient(recipient, options), (latest) => latest.toReversed())

/**
 * A workspace's stores and signal hub, with the host's cryptography, no integrations, and jobs
 * that accept requests and run nothing: the suites run turns themselves when they need to.
 */
const withHostServices = (context: Context.Context<WorkspaceStorage.Bindings>, crypto: Crypto.Crypto) =>
  Effect.map(Integrations.make([]), (integrations) =>
    bind(
      context.pipe(
        Context.add(Crypto.Crypto, crypto),
        Context.add(TurnJobs.TurnJobs, TurnJobs.noRunner),
        Context.add(DeliveryJobs.DeliveryJobs, DeliveryJobs.noRunner),
        Context.add(Integrations.Integrations, integrations)
      )
    )
  )

/**
 * One workspace's bound stores and signal hub on a host, with the host's cryptography, no
 * integrations, and jobs that accept requests and run nothing.
 *
 * @category utils
 * @since 0.1.0
 */
export const forWorkspace = (host: Context.Context<Fixture.Host>, id: WorkspaceId.WorkspaceId) =>
  Effect.flatMap(Context.get(host, WorkspaceStorage.WorkspaceStorage).forWorkspace(id), (context) =>
    withHostServices(context, Context.get(host, Crypto.Crypto))
  )

/**
 * One workspace's stores and signals on the host in context, as a gateway's caller has it.
 *
 * @category utils
 * @since 0.1.0
 */
export const boundTo = Effect.fnUntraced(function* (id: WorkspaceId.WorkspaceId) {
  const workspaceStorage = yield* WorkspaceStorage.WorkspaceStorage
  const crypto = yield* Crypto.Crypto
  return yield* withHostServices(yield* workspaceStorage.forWorkspace(id), crypto)
})

/**
 * The bound stores with each commit failing after its program completes, before it commits: a
 * failure after every projection has written, as a late write in the commit would cause.
 *
 * @category utils
 * @since 0.1.0
 */
export const failingLate = (bound: Bound, failure: StoreError.StoreError): Bound =>
  Object.assign({}, bound, {
    context: Context.add(
      bound.context,
      Store.Store,
      Store.Store.of(
        Object.assign({}, bound.store, {
          transaction: <A, E, R>(program: Effect.Effect<A, E, R>) =>
            bound.store.transaction(Effect.andThen(program, Effect.fail(failure)))
        })
      )
    )
  })

/**
 * Run a program on a new host over the storage, which stays open for the enclosing scope.
 *
 * @category utils
 * @since 0.1.0
 */
export const runHost = <A, E, R>(storage: Fixture.Storage, program: Effect.Effect<A, E, R>) =>
  Effect.flatMap(storage.connect(), (host) => Effect.provide(program, host))

/**
 * Core over one workspace's bound stores, with the host's cryptography, as a host runs it.
 *
 * @category utils
 * @since 0.1.0
 */
export const core = (bound: Bound) => Core.layer.pipe(Layer.provideMerge(Layer.succeedContext(bound.context)))

/**
 * A gateway over a host, installing what `options` say, and running no jobs.
 *
 * @category utils
 * @since 0.1.0
 */
export const gateway = (host: Context.Context<Fixture.Host>, options: Gateway.Options = {}) =>
  Gateway.layer(options).pipe(
    Layer.provideMerge(Layer.mergeAll(Layer.succeedContext(host), TurnJobs.layerNoRunner, DeliveryJobs.layerNoRunner))
  )

/**
 * Initialize the bound workspace for its creator, as the gateway's bootstrap does.
 *
 * @category utils
 * @since 0.1.0
 */
export const initialized = (bound: Bound, creator = alice.id) =>
  WorkspaceInitialization.initialize(creator, {
    name: "Test workspace",
    memberName: Member.Name.make(creator)
  }).pipe(Effect.provide(core(bound)))

/**
 * Add `members` without roles, and give each of `viewers` the built-in member role, in one commit
 * as invitation acceptance would.
 *
 * @category utils
 * @since 0.1.0
 */
export const seed = (
  bound: Bound,
  members: ReadonlyArray<Actor.Actor["Service"]>,
  viewers: ReadonlyArray<Actor.Actor["Service"]>
) =>
  Effect.flatMap(Journal.Journal, (journal) =>
    journal.commit(
      Effect.gen(function* () {
        for (const member of members)
          yield* journal.publish(MemberFacts.Added, {
            workspaceId: bound.store.workspaceId,
            memberId: member.memberId,
            identity: member.identity,
            name: Member.Name.make(member.identity.id)
          })
        for (const viewer of viewers)
          yield* journal.publish(AssignmentFacts.Created, {
            workspaceId: bound.store.workspaceId,
            assignmentId: Assignment.AssignmentId.make(`viewer:${viewer.memberId}`),
            memberId: viewer.memberId,
            source: {
              _tag: "Role",
              roleId: BuiltinRoles.MemberId,
              scope: { _tag: "Workspace", workspaceId: bound.store.workspaceId }
            }
          })
      })
    )
  ).pipe(
    Effect.provideService(Publication.Publication, testProvenance(bound.store.workspaceId)),
    Effect.provide(core(bound))
  )

/**
 * Run a program on a gateway over a new host, which stays open for the enclosing scope.
 *
 * @category utils
 * @since 0.1.0
 */
export const runGateway = <A, E, R>(storage: Fixture.Storage, program: Effect.Effect<A, E, R>) =>
  Effect.flatMap(storage.connect(), (host) => program.pipe(Effect.provide(gateway(host))))

/**
 * The ID of the message a timeline activity publishes, or `undefined` for activity of another kind.
 *
 * @category utils
 * @since 0.1.0
 */
export const publishedMessage = (activity: ThreadActivity.ThreadActivity) =>
  ThreadActivityKind.is(ThreadMessageActivity.Published)(activity)
    ? Schema.decodeUnknownSync(ThreadMessageActivity.Published.details)(activity.details).messageId
    : undefined

/**
 * A post's result with the timeline activity that placed its message, read back from the store:
 * starts and replies return what they created, not where it landed in the timeline.
 *
 * @category utils
 * @since 0.1.0
 */
export const placed = Effect.fnUntraced(function* <A extends { readonly message: ThreadMessage.ThreadMessage }>(
  result: A
) {
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore
  const found = (yield* threadActivityStore.listByThread(result.message.threadId)).find(
    (activity) => publishedMessage(activity) === result.message.id
  )
  if (found === undefined) return yield* Effect.die(new Error("A posted message has no activity"))
  const activity = yield* Effect.orDie(ThreadActivityKind.decode(ThreadMessageActivity.Published, found))
  return Object.assign({}, result, { activity })
})

/**
 * `placed`, reading a workspace binding's store, for a post made through the gateway.
 *
 * @category utils
 * @since 0.1.0
 */
export const placedIn =
  (bound: Bound) =>
  <A extends { readonly message: ThreadMessage.ThreadMessage }>(result: A) =>
    placed(result).pipe(Effect.provideService(ThreadActivityStore.ThreadActivityStore, bound.activities))

/**
 * Core's internal thread reads and writes, for fixtures that write what no operation does. Provide
 * it over a workspace's core; timelines resolve as core registers them.
 *
 * @category utils
 * @since 0.1.0
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
        TaskTimeline.resolver
      ])
    )
  )
)

/**
 * Attribution for low-level fixture writes outside application operations.
 *
 * @category utils
 * @since 0.1.0
 */
export const testProvenance = (id = workspaceId): Event.Provenance => ({
  workspaceId: id,
  performedBy: { _tag: "System", id: Performer.SystemId.make("test-fixture") },
  causedBy: null,
  correlationId: Event.CorrelationId.make("test-operation"),
  occurredAt: DateTime.makeUnsafe("2026-09-20T12:00:00.000Z")
})

/**
 * An hour from now, for an invitation's expiry that a test has not reached yet.
 *
 * @category utils
 * @since 0.1.0
 */
export const future = DateTime.now.pipe(Effect.map((now) => DateTime.add(now, { hours: 1 })))

/**
 * Run a program with the clock reading a fixed time; sleeping still uses the real clock.
 *
 * @category utils
 * @since 0.1.0
 */
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
        sleep: (duration) => clock.sleep(duration)
      })
    )
  )

/**
 * What issuing an invitation takes: one that expires at `expiresAt`, to `bob` with the
 * built-in member role unless a test names another recipient or role.
 *
 * @category utils
 * @since 0.1.0
 */
export const request = (
  expiresAt: DateTime.Utc,
  recipientId = bob.id,
  roleId: Role.RoleId = BuiltinRoles.MemberId
): Invitation.IssueInput => ({ recipientId, expiresAt, roleId })

/**
 * Replace what a store's by-ID reads return for one ID, in both single and batch reads;
 * `Option.none()` hides the record. Other IDs read through to the store.
 *
 * @category utils
 * @since 0.1.0
 */
export const replacing = <Id, A, E>(
  store: {
    readonly get: (id: Id) => Effect.Effect<Option.Option<A>, E>
    readonly getMany: (ids: ReadonlyArray<Id>) => Effect.Effect<ReadonlyArray<A>, E>
  },
  id: Id,
  replacement: Option.Option<A>
) => ({
  get: (requested: Id) => (requested === id ? Effect.succeed(replacement) : store.get(requested)),
  getMany: (ids: ReadonlyArray<Id>) =>
    Effect.map(store.getMany(ids.filter((requested) => requested !== id)), (rows) =>
      ids.includes(id) ? [...rows, ...(Option.isSome(replacement) ? [replacement.value] : [])] : rows
    )
})
