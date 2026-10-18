/**
 * Which facts the change feed tells readers of, and what each tells them: a registry of fact
 * versions with the audience each reaches, the read permission a reader also needs, the reads it
 * makes stale, whose access it changes, and the notifications it created. `ChangeFeedSource`
 * prepares each committed entry with `prepare`, and `ChangeFeedService` filters what it prepared
 * for each reader. A fact not registered here stays within the host.
 *
 * @since 0.1.0
 */

import type { Connection as ConnectionContract } from "@amends-dev/connection"
import type * as Log from "@amends-dev/log/Log"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as AgentFacts from "../agent/AgentFacts.ts"
import * as AgentPermissions from "../agent/AgentPermissions.ts"
import * as AssignmentFacts from "../authorization/AssignmentFacts.ts"
import * as AssignmentPermissions from "../authorization/AssignmentPermissions.ts"
import * as Requirement from "../authorization/Requirement.ts"
import * as RoleFacts from "../authorization/RoleFacts.ts"
import * as Target from "../authorization/Target.ts"
import * as ChannelFacts from "../channel/ChannelFacts.ts"
import type * as ChannelId from "../channel/ChannelId.ts"
import * as ChannelPermissions from "../channel/ChannelPermissions.ts"
import * as DeliveryFacts from "../channel/DeliveryFacts.ts"
import * as ConnectionFacts from "../connection/ConnectionFacts.ts"
import * as ConnectionPermissions from "../connection/ConnectionPermissions.ts"
import * as GroupFacts from "../group/GroupFacts.ts"
import * as GroupFollowFacts from "../group/GroupFollowFacts.ts"
import type * as GroupId from "../group/GroupId.ts"
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts"
import * as GroupPermissions from "../group/GroupPermissions.ts"
import type * as Audience from "../journal/Audience.ts"
import * as Event from "../journal/Event.ts"
import * as Fact from "../journal/Fact.ts"
import * as Notification from "../notification/Notification.ts"
import * as TaskFacts from "../task/TaskFacts.ts"
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts"
import * as ThreadFacts from "../thread/ThreadFacts.ts"
import type * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadMessageFacts from "../thread/ThreadMessageFacts.ts"
import * as ThreadParticipationFacts from "../thread/ThreadParticipationFacts.ts"
import * as ThreadPermissions from "../thread/ThreadPermissions.ts"
import * as TurnFacts from "../turn/TurnFacts.ts"
import * as InvitationFacts from "../workspace/InvitationFacts.ts"
import * as InvitationPermissions from "../workspace/InvitationPermissions.ts"
import * as Member from "../workspace/Member.ts"
import * as MemberFacts from "../workspace/MemberFacts.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as MemberPermissions from "../workspace/MemberPermissions.ts"
import * as WorkspaceFacts from "../workspace/WorkspaceFacts.ts"
import type * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as ChangeFeed from "./ChangeFeed.ts"

/**
 * How a fact changes what one reader may see: their group admissions, their grants (or anyone's,
 * without a member), or their workspace membership ending.
 *
 * @category models
 * @since 0.1.0
 */
export type Access = Data.TaggedEnum<{
  Groups: { readonly memberId: MemberId.MemberId }
  Grants: { readonly memberId: MemberId.MemberId | undefined }
  Removed: { readonly memberId: MemberId.MemberId }
}>
/**
 * @category models
 * @since 0.1.0
 */
export const Access = Data.taggedEnum<Access>()

/**
 * A notification the event created, for the reader holding its recipient's scope.
 *
 * @category models
 * @since 0.1.0
 */
export interface Addressed {
  readonly scope: Audience.Scope
  readonly record: Notification.Notification
}

/**
 * One decoded event, ready to filter for each reader.
 *
 * @category models
 * @since 0.1.0
 */
export interface Prepared {
  /** The fact's name and decoded payload, for those inside the host following commits, such as a turn's log. */
  readonly name: string
  readonly payload: unknown
  /** The reads it makes stale for the readers it reaches. */
  readonly stale: ReadonlyArray<ChangeFeed.Stale>
  readonly audience: Audience.Audience
  /** The read permission a reader also needs, beyond holding one of the audience's scopes. */
  readonly requirement: Requirement.Requirement | undefined
  /** A scope whose holder needs no read permission: the member the fact is about. */
  readonly exempt: Audience.Scope | undefined
  readonly access: Access | undefined
  readonly notifications: ReadonlyArray<Addressed>
}

/**
 * A published fact's name recorded with a version this host does not know.
 *
 * @category errors
 * @since 0.1.0
 */
export class UnknownVersion extends Schema.TaggedError<UnknownVersion>()("ChangeFeedEvents.UnknownVersion", {
  name: Schema.String,
  version: Schema.Finite
}) {}

interface Registered {
  readonly name: string
  readonly version: number
  readonly prepare: (
    entry: Log.Entry<Event.Envelope>
  ) => Effect.Effect<Prepared, Schema.SchemaError | Event.FactMismatch>
}

/** A fact whose payload schema needs no services, as every domain fact's does. */
type Standalone = Fact.Definition & {
  readonly payload: { readonly DecodingServices: never; readonly EncodingServices: never }
}

/** Tell one fact version's audience of it: the reads it makes stale, and the rest it carries. */
const registerFact = <F extends Standalone>(
  fact: F,
  options: {
    readonly requirement?: (payload: Fact.Payload<F>, workspaceId: WorkspaceId.WorkspaceId) => Requirement.Requirement
    /** The reads the fact makes stale; the change feed delivers the rest of what it changed. */
    readonly stale?: (payload: Fact.Payload<F>) => ReadonlyArray<ChangeFeed.Stale>
    readonly access?: (payload: Fact.Payload<F>) => Access | undefined
    /** The member the fact is about, who sees it without the read permission. */
    readonly concerns?: (payload: Fact.Payload<F>) => MemberId.MemberId
    /** The notifications the fact's projection creates, as their recipients' inboxes list them. */
    readonly notifications?: (event: Event.Metadata & { readonly payload: Fact.Payload<F> }) => ReadonlyArray<Addressed>
  } = {}
): Registered => ({
  name: fact.name,
  version: fact.version,
  prepare: Effect.fnUntraced(function* (entry: Log.Entry<Event.Envelope>) {
    const event = yield* Event.decode(fact, entry)
    const payload = event.payload as Fact.Payload<F>
    const workspaceId = event.provenance.workspaceId
    return {
      name: event.name,
      payload,
      stale: options.stale?.(payload) ?? [],
      audience: yield* Fact.makeAudience(fact, payload),
      requirement: options.requirement?.(payload, workspaceId),
      exempt: options.concerns === undefined ? undefined : Member.audienceOf(options.concerns(payload)),
      access: options.access?.(payload),
      notifications: options.notifications?.(Object.assign({}, event, { payload })) ?? []
    }
  })
})

/** Stale reads: of the workspace, of one group, thread, or turn, or of every one of a kind. */
const reads = (...names: ReadonlyArray<ChangeFeed.Read>): ReadonlyArray<ChangeFeed.Stale> =>
  names.map((read) => ({ read }))
const readOf = (read: ChangeFeed.Read, id: string): ChangeFeed.Stale => ({ read, id })
/**
 * Grants decide what the reader may do and see, from another member's access to which threads,
 * rosters, and turns they may read, and which notification sources they can still read.
 */
const grantsChanged = reads(
  "settings",
  "ownership",
  "members",
  "groups",
  "inbox",
  "pending",
  "permissions",
  "connections",
  "agents",
  "active-turns",
  "streams",
  "rosters",
  "threads",
  "timelines",
  "participants",
  "turns"
)
/**
 * Who belongs to a group decides who is listed there and which of its threads the reader may see.
 * A fact names its group but not its threads, so every timeline and participant list checks its
 * access again.
 */
const membershipChanged = ({ groupId }: { readonly groupId: GroupId.GroupId }) => [
  ...reads("groups", "public-groups", "inbox", "pending", "active-turns", "timelines", "participants"),
  readOf("streams", groupId),
  readOf("rosters", groupId)
]

const readThreadRequirement = (threadId: ThreadId.ThreadId, workspaceId: WorkspaceId.WorkspaceId) =>
  Requirement.make(ThreadPermissions.Read, Target.Reference.cases.Thread.make({ workspaceId, threadId }))
const readGroupRequirement = (groupId: GroupId.GroupId, workspaceId: WorkspaceId.WorkspaceId) =>
  Requirement.make(GroupPermissions.Read, Target.Reference.cases.Group.make({ workspaceId, groupId }))
const readMemberRequirement = (memberId: MemberId.MemberId, workspaceId: WorkspaceId.WorkspaceId) =>
  Requirement.make(MemberPermissions.Read, Target.Reference.cases.Member.make({ workspaceId, memberId }))
const readAccessRequirement = (memberId: MemberId.MemberId, workspaceId: WorkspaceId.WorkspaceId) =>
  Requirement.make(AssignmentPermissions.Read, Target.Reference.cases.Member.make({ workspaceId, memberId }))
const readConnectionRequirement = (
  connectionId: ConnectionContract.ConnectionId,
  workspaceId: WorkspaceId.WorkspaceId
) => Requirement.make(ConnectionPermissions.Read, Target.Reference.cases.Connection.make({ workspaceId, connectionId }))
const readAgentRequirement = (memberId: MemberId.MemberId, workspaceId: WorkspaceId.WorkspaceId) =>
  Requirement.make(AgentPermissions.Read, Target.Reference.cases.Member.make({ workspaceId, memberId }))
const readChannelRequirement = (channelId: ChannelId.ChannelId, workspaceId: WorkspaceId.WorkspaceId) =>
  Requirement.make(ChannelPermissions.Read, Target.Reference.cases.Channel.make({ workspaceId, channelId }))
const manageInvitationsRequirement = (_: unknown, workspaceId: WorkspaceId.WorkspaceId) =>
  Requirement.make(InvitationPermissions.Manage, Target.Reference.cases.Workspace.make({ workspaceId }))

/**
 * Every fact the feed may deliver, each version registered separately. Readers see an event
 * when they hold a scope in its audience and any read permission it names, the same permission
 * the matching read requires. Facts absent from this list are internal.
 */
const registry: ReadonlyArray<Registered> = [
  // A workspace's name and owner show in its settings and the reader's directory; its owner
  // decides who may manage members, connections, and agents.
  registerFact(WorkspaceFacts.Initialized, { stale: () => reads("settings", "ownership", "directory") }),
  registerFact(WorkspaceFacts.Renamed, { stale: () => reads("settings", "ownership", "directory") }),
  registerFact(WorkspaceFacts.OwnershipTransferred, {
    stale: () => reads("settings", "ownership", "members", "permissions", "connections", "agents", "directory")
  }),
  // Membership and access changes reach those who may read them, and always the member concerned.
  // An agent is a member: its name, and whether it is still in the workspace, show with it, and
  // rosters list active members only.
  registerFact(MemberFacts.Added, {
    requirement: ({ memberId }, workspaceId) => readMemberRequirement(memberId, workspaceId),
    stale: () => reads("members", "ownership", "agents", "directory", "rosters"),
    concerns: ({ memberId }) => memberId
  }),
  registerFact(MemberFacts.Removed, {
    requirement: ({ memberId }, workspaceId) => readMemberRequirement(memberId, workspaceId),
    stale: () => reads("members", "ownership", "agents", "directory", "rosters"),
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => Access.Removed({ memberId })
  }),
  // A member's name shows wherever members are named, and in the directory's memberships.
  registerFact(MemberFacts.Renamed, {
    requirement: ({ memberId }, workspaceId) => readMemberRequirement(memberId, workspaceId),
    stale: () => reads("members", "agents", "directory"),
    concerns: ({ memberId }) => memberId
  }),
  // Invitations name their recipient and role, which only invitation managers may list.
  registerFact(InvitationFacts.Issued, {
    requirement: manageInvitationsRequirement,
    stale: () => reads("invitations")
  }),
  registerFact(InvitationFacts.Accepted, {
    requirement: manageInvitationsRequirement,
    stale: () => reads("invitations", "members", "ownership", "directory"),
    concerns: ({ memberId }) => memberId
  }),
  registerFact(InvitationFacts.Revoked, {
    requirement: manageInvitationsRequirement,
    stale: () => reads("invitations")
  }),
  // Roles show in the settings and beside each member.
  registerFact(RoleFacts.Created, { stale: () => reads("settings", "members") }),
  registerFact(RoleFacts.Renamed, { stale: () => reads("settings", "members") }),
  // Marks a built-in role revision; the renames and permission changes it made come with it.
  registerFact(RoleFacts.BuiltinsRevised),
  registerFact(RoleFacts.PermissionsChanged, {
    stale: () => grantsChanged,
    access: () => Access.Grants({ memberId: undefined })
  }),
  registerFact(AssignmentFacts.Created, {
    requirement: ({ memberId }, workspaceId) => readAccessRequirement(memberId, workspaceId),
    stale: () => grantsChanged,
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => Access.Grants({ memberId })
  }),
  registerFact(AssignmentFacts.Revoked, {
    requirement: ({ memberId }, workspaceId) => readAccessRequirement(memberId, workspaceId),
    stale: () => grantsChanged,
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => Access.Grants({ memberId })
  }),
  // A group's name shows in the groups list and among public groups, where a public group's
  // creation reaches everyone who might join it.
  registerFact(GroupFacts.Created, {
    requirement: ({ id }, workspaceId) => readGroupRequirement(id, workspaceId),
    stale: () => reads("groups", "public-groups")
  }),
  registerFact(GroupFacts.Renamed, {
    requirement: ({ groupId }, workspaceId) => readGroupRequirement(groupId, workspaceId),
    stale: () => reads("groups", "public-groups")
  }),
  registerFact(GroupMembershipFacts.Added, {
    requirement: ({ groupId }, workspaceId) => readGroupRequirement(groupId, workspaceId),
    stale: membershipChanged,
    access: ({ memberId }) => Access.Groups({ memberId })
  }),
  registerFact(GroupMembershipFacts.Removed, {
    requirement: ({ groupId }, workspaceId) => readGroupRequirement(groupId, workspaceId),
    stale: membershipChanged,
    access: ({ memberId }) => Access.Groups({ memberId })
  }),
  // Connections reach those who may read them; no fact carries a key. Their names, settings, and
  // readiness show with them and with the agents that use them; replacing a key changes none.
  registerFact(ConnectionFacts.Created, {
    requirement: ({ id }, workspaceId) => readConnectionRequirement(id, workspaceId),
    stale: () => reads("connections", "agents")
  }),
  registerFact(ConnectionFacts.Renamed, {
    requirement: ({ connectionId }, workspaceId) => readConnectionRequirement(connectionId, workspaceId),
    stale: () => reads("connections", "agents")
  }),
  registerFact(ConnectionFacts.Configured, {
    requirement: ({ connectionId }, workspaceId) => readConnectionRequirement(connectionId, workspaceId),
    stale: () => reads("connections", "agents")
  }),
  registerFact(ConnectionFacts.KeyReplaced, {
    requirement: ({ connectionId }, workspaceId) => readConnectionRequirement(connectionId, workspaceId)
  }),
  registerFact(ConnectionFacts.Removed, {
    requirement: ({ connectionId }, workspaceId) => readConnectionRequirement(connectionId, workspaceId),
    stale: () => reads("connections", "agents")
  }),
  // Agents' configuration reaches those who may read it; their names and departures come with
  // membership facts.
  registerFact(AgentFacts.Created, {
    requirement: ({ memberId }, workspaceId) => readAgentRequirement(memberId, workspaceId),
    stale: () => reads("agents")
  }),
  registerFact(AgentFacts.Configured, {
    requirement: ({ memberId }, workspaceId) => readAgentRequirement(memberId, workspaceId),
    stale: () => reads("agents")
  }),
  // Turns reach those who may read their thread: what the agent is doing there, and how it ended,
  // which the commit delivers as the turn.
  registerFact(TurnFacts.Created, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TurnFacts.Retried, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TurnFacts.Started, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TurnFacts.CancelRequested, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TurnFacts.Completed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TurnFacts.Failed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TurnFacts.Cancelled, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  // Whether the reader follows a group shows in their groups list.
  registerFact(GroupFollowFacts.Started, { stale: () => reads("groups") }),
  registerFact(GroupFollowFacts.Ended, { stale: () => reads("groups") }),
  registerFact(ThreadFacts.Created, {
    requirement: ({ id }, workspaceId) => readThreadRequirement(id, workspaceId)
  }),
  // A thread's title: the thread itself; its stream and timeline take what the commit delivers.
  registerFact(ThreadFacts.Renamed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
    stale: ({ threadId }) => [readOf("threads", threadId)]
  }),
  registerFact(ThreadMessageFacts.Published, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(ThreadMessageFacts.Edited, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(ThreadMessageFacts.Deleted, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TaskFacts.Created, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(TaskFacts.Updated, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  // Channels reach those who may read them; what a channel bound and delivered reaches the
  // thread's readers, and whom it heard from every member, as contacts write in threads.
  registerFact(ChannelFacts.Created, {
    requirement: ({ id }, workspaceId) => readChannelRequirement(id, workspaceId)
  }),
  registerFact(ChannelFacts.Redirected, {
    requirement: ({ channelId }, workspaceId) => readChannelRequirement(channelId, workspaceId)
  }),
  registerFact(ChannelFacts.Removed, {
    requirement: ({ channelId }, workspaceId) => readChannelRequirement(channelId, workspaceId)
  }),
  registerFact(ChannelFacts.Bound, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(ChannelFacts.ContactCreated),
  registerFact(ChannelFacts.ContactRenamed),
  registerFact(DeliveryFacts.Created, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(DeliveryFacts.Sent, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  registerFact(DeliveryFacts.Failed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId)
  }),
  // Each human or agent recipient receives the notification the activity created for them, which
  // needs no thread read permission; readers take the timeline item the commit delivers.
  registerFact(ThreadActivityFacts.Recorded, {
    requirement: ({ activity }, workspaceId) => readThreadRequirement(activity.threadId, workspaceId),
    notifications: (event) =>
      event.payload.recipients.flatMap((selected) =>
        Notification.Recipient.isAnyOf(["Human", "Agent"])(selected.recipient)
          ? [
              {
                scope: Member.audienceOf(selected.recipient.memberId),
                record: Notification.fromActivity(
                  event,
                  Object.assign({ groupId: event.payload.groupId }, event.payload.activity),
                  selected
                )
              }
            ]
          : []
      )
  }),
  // Who takes part in a thread, and so follows it.
  registerFact(ThreadParticipationFacts.Added, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
    stale: ({ threadId }) => [readOf("participants", threadId)]
  }),
  registerFact(ThreadParticipationFacts.Ended, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
    stale: ({ threadId }) => [readOf("participants", threadId)]
  })
]

const byName = new Map<string, Map<number, Registered>>()
for (const registered of registry) {
  const versions = byName.get(registered.name) ?? new Map<number, Registered>()
  versions.set(registered.version, registered)
  byName.set(registered.name, versions)
}

/**
 * Whether the feed delivers a fact at this version; facts it does not register are internal.
 *
 * @category predicates
 * @since 0.1.0
 */
export const delivers = (fact: { readonly name: string; readonly version: number }) =>
  byName.get(fact.name)?.has(fact.version) ?? false

/**
 * Decode one journal entry for delivery. Facts the feed does not register are internal and
 * yield None; a registered name recorded with an unknown version fails rather than disappear,
 * and the source makes subscribers refresh instead of delivering its commit.
 *
 * @category converting
 * @since 0.1.0
 */
export const prepare = Effect.fn("ChangeFeedEvents.prepare")(function* (entry: Log.Entry<Event.Envelope>) {
  const versions = byName.get(entry.payload.name)
  if (versions === undefined) return Option.none<Prepared>()
  const registered = versions.get(entry.payload.version)
  if (registered === undefined)
    return yield* new UnknownVersion({
      name: entry.payload.name,
      version: entry.payload.version
    })
  return Option.some(yield* registered.prepare(entry))
})
