/**
 * Which facts the change feed delivers, and how each becomes an event a reader may see: a registry
 * of fact versions with the audience each reaches, the read permission a reader also needs, the
 * public view of its payload, whose access it changes, and the notifications it created.
 * `ChangeFeedSource` prepares each committed entry with `prepare`, and `ChangeFeedService` filters
 * what it prepared for each reader. A fact not registered here stays within the host.
 *
 * @since 0.1.0
 */
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as TurnFacts from "../turn/TurnFacts.ts";
import * as AgentFacts from "../agent/AgentFacts.ts";
import * as AgentPermissions from "../agent/AgentPermissions.ts";
import * as AssignmentFacts from "../authorization/AssignmentFacts.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as RoleFacts from "../authorization/RoleFacts.ts";
import * as GroupFacts from "../group/GroupFacts.ts";
import type * as Connection from "../connection/Connection.ts";
import * as ConnectionFacts from "../connection/ConnectionFacts.ts";
import * as ConnectionPermissions from "../connection/ConnectionPermissions.ts";
import type * as Group from "../group/Group.ts";
import * as GroupFollowFacts from "../group/GroupFollowFacts.ts";
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts";
import * as GroupPermissions from "../group/GroupPermissions.ts";
import type * as Audience from "../journal/Audience.ts";
import * as Event from "../journal/Event.ts";
import * as Fact from "../journal/Fact.ts";
import type * as Log from "../journal/Log.ts";
import * as Notification from "../notification/Notification.ts";
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts";
import type * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadFacts from "../thread/ThreadFacts.ts";
import * as ThreadMessageFacts from "../thread/ThreadMessageFacts.ts";
import * as ThreadParticipation from "../thread/ThreadParticipation.ts";
import * as ThreadParticipationFacts from "../thread/ThreadParticipationFacts.ts";
import * as ThreadPermissions from "../thread/ThreadPermissions.ts";
import * as TaskFacts from "../task/TaskFacts.ts";
import * as ChannelFacts from "../channel/ChannelFacts.ts";
import type * as ChannelId from "../channel/ChannelId.ts";
import * as ChannelPermissions from "../channel/ChannelPermissions.ts";
import * as DeliveryFacts from "../channel/DeliveryFacts.ts";
import * as WorkspaceFacts from "../workspace/WorkspaceFacts.ts";
import type * as WorkspaceId from "../workspace/WorkspaceId.ts";
import * as InvitationFacts from "../workspace/InvitationFacts.ts";
import * as MemberFacts from "../workspace/MemberFacts.ts";
import * as Member from "../workspace/Member.ts";
import * as MemberPermissions from "../workspace/MemberPermissions.ts";
import * as InvitationPermissions from "../workspace/InvitationPermissions.ts";
import * as AssignmentPermissions from "../authorization/AssignmentPermissions.ts";
import * as ChangeFeed from "./ChangeFeed.ts";

/**
 * How a fact changes what one reader may see: their group admissions, their grants (or anyone's,
 * without a member), or their workspace membership ending.
 *
 * @category models
 * @since 0.1.0
 */
export type Access = Data.TaggedEnum<{
  Groups: { readonly memberId: Member.Id };
  Grants: { readonly memberId: Member.Id | undefined };
  Removed: { readonly memberId: Member.Id };
}>;
/**
 * @category models
 * @since 0.1.0
 */
export const Access = Data.taggedEnum<Access>();

/**
 * A notification the event created, for the reader holding its recipient's scope.
 *
 * @category models
 * @since 0.1.0
 */
export interface Addressed {
  readonly scope: Audience.Scope;
  readonly record: Notification.Notification;
}

/**
 * One decoded event, ready to filter for each reader.
 *
 * @category models
 * @since 0.1.0
 */
export interface Prepared {
  readonly event: ChangeFeed.Event;
  readonly audience: Audience.Audience;
  /** The read permission a reader also needs, beyond holding one of the audience's scopes. */
  readonly requirement: Requirement.Requirement | undefined;
  /** A scope whose holder needs no read permission: the member the fact is about. */
  readonly exempt: Audience.Scope | undefined;
  readonly access: Access | undefined;
  readonly notifications: ReadonlyArray<Addressed>;
}

/**
 * A published fact's name recorded with a version this host does not know.
 *
 * @category errors
 * @since 0.1.0
 */
export class UnknownVersion extends Schema.TaggedError<UnknownVersion>()(
  "ChangeFeedEvents.UnknownVersion",
  { name: Schema.String, version: Schema.Finite },
) {}

interface Registered {
  readonly name: string;
  readonly version: number;
  readonly prepare: (
    entry: Log.Entry<Event.Envelope>,
  ) => Effect.Effect<Prepared, Schema.SchemaError | Event.FactMismatch>;
}

/** A fact whose payload schema needs no services, as every domain fact's does. */
type Standalone = Fact.Definition & {
  readonly payload: { readonly DecodingServices: never; readonly EncodingServices: never };
};

/**
 * Deliver one fact version to its audience. The payload is the fact's own unless a view names
 * the public shape, which then matches what the corresponding read returns.
 */
const registerFact = <F extends Standalone, View extends Schema.Constraint = F["payload"]>(
  fact: F,
  options: {
    readonly requirement?: (
      payload: Fact.Payload<F>,
      workspaceId: WorkspaceId.Id,
    ) => Requirement.Requirement;
    readonly view?: {
      readonly schema: View;
      readonly from: (payload: Fact.Payload<F>) => View["Type"];
    };
    readonly access?: (payload: Fact.Payload<F>) => Access | undefined;
    /** The member the fact is about, who sees it without the read permission. */
    readonly concerns?: (payload: Fact.Payload<F>) => Member.Id;
    /** The notifications the fact's projection creates, as their recipients' inboxes list them. */
    readonly notifications?: (
      event: Event.Metadata & { readonly payload: Fact.Payload<F> },
    ) => ReadonlyArray<Addressed>;
  } = {},
): Registered => {
  // Domain payload schemas need no services, so the JSON codec runs without context.
  const codec = Schema.toCodecJson(options.view?.schema ?? fact.payload) as unknown as Schema.Codec<
    unknown,
    unknown
  >;
  const encode = Schema.encodeUnknownEffect(codec);
  return {
    name: fact.name,
    version: fact.version,
    prepare: Effect.fnUntraced(function* (entry: Log.Entry<Event.Envelope>) {
      const event = yield* Event.decode(fact, entry);
      const payload = event.payload as Fact.Payload<F>;
      const workspaceId = event.provenance.workspaceId;
      return {
        event: ChangeFeed.Event.make({
          id: event.id,
          name: event.name,
          version: event.version,
          recordedAt: event.recordedAt,
          provenance: event.provenance,
          payload: yield* encode(
            options.view === undefined ? payload : options.view.from(payload),
          ).pipe(Effect.flatMap(Schema.decodeUnknownEffect(Schema.Json))),
        }),
        audience: yield* Fact.makeAudience(fact, payload),
        requirement: options.requirement?.(payload, workspaceId),
        exempt:
          options.concerns === undefined ? undefined : Member.audienceOf(options.concerns(payload)),
        access: options.access?.(payload),
        notifications: options.notifications?.(Object.assign({}, event, { payload })) ?? [],
      };
    }),
  };
};

const readThreadRequirement = (threadId: ThreadId.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId });
const readGroupRequirement = (groupId: Group.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId });
const readMemberRequirement = (memberId: Member.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(MemberPermissions.Read, { _tag: "Member", workspaceId, memberId });
const readAccessRequirement = (memberId: Member.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(AssignmentPermissions.Read, { _tag: "Member", workspaceId, memberId });
const readConnectionRequirement = (connectionId: Connection.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(ConnectionPermissions.Read, {
    _tag: "Connection",
    workspaceId,
    connectionId,
  });
const readAgentRequirement = (memberId: Member.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(AgentPermissions.Read, { _tag: "Member", workspaceId, memberId });
const readChannelRequirement = (channelId: ChannelId.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(ChannelPermissions.Read, { _tag: "Channel", workspaceId, channelId });
const manageInvitationsRequirement = (_: unknown, workspaceId: WorkspaceId.Id) =>
  Requirement.make(InvitationPermissions.Manage, { _tag: "Workspace", workspaceId });

/**
 * Every fact the feed may deliver, each version registered separately. Readers see an event
 * when they hold a scope in its audience and any read permission it names, the same permission
 * the matching read requires. Facts absent from this list are internal.
 */
const registry: ReadonlyArray<Registered> = [
  registerFact(WorkspaceFacts.Initialized),
  registerFact(WorkspaceFacts.Renamed),
  registerFact(WorkspaceFacts.OwnershipTransferred),
  // Membership and access changes reach those who may read them, and always the member concerned.
  registerFact(MemberFacts.Added, {
    requirement: ({ memberId }, workspaceId) => readMemberRequirement(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
  }),
  registerFact(MemberFacts.Removed, {
    requirement: ({ memberId }, workspaceId) => readMemberRequirement(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => Access.Removed({ memberId }),
  }),
  registerFact(MemberFacts.Renamed, {
    requirement: ({ memberId }, workspaceId) => readMemberRequirement(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
  }),
  // Invitations name their recipient and role, which only invitation managers may list.
  registerFact(InvitationFacts.Issued, { requirement: manageInvitationsRequirement }),
  registerFact(InvitationFacts.Accepted, {
    requirement: manageInvitationsRequirement,
    concerns: ({ memberId }) => memberId,
  }),
  registerFact(InvitationFacts.Revoked, { requirement: manageInvitationsRequirement }),
  registerFact(RoleFacts.Created),
  registerFact(RoleFacts.Renamed),
  // Marks a built-in role revision; the renames and permission changes it made come with it.
  registerFact(RoleFacts.BuiltinsRevised),
  registerFact(RoleFacts.PermissionsChanged, {
    access: () => Access.Grants({ memberId: undefined }),
  }),
  registerFact(AssignmentFacts.Created, {
    requirement: ({ memberId }, workspaceId) => readAccessRequirement(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => Access.Grants({ memberId }),
  }),
  registerFact(AssignmentFacts.Revoked, {
    requirement: ({ memberId }, workspaceId) => readAccessRequirement(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => Access.Grants({ memberId }),
  }),
  registerFact(GroupFacts.Created, {
    requirement: ({ id }, workspaceId) => readGroupRequirement(id, workspaceId),
  }),
  registerFact(GroupFacts.Renamed, {
    requirement: ({ groupId }, workspaceId) => readGroupRequirement(groupId, workspaceId),
  }),
  registerFact(GroupMembershipFacts.Added, {
    requirement: ({ groupId }, workspaceId) => readGroupRequirement(groupId, workspaceId),
    access: ({ memberId }) => Access.Groups({ memberId }),
  }),
  registerFact(GroupMembershipFacts.Removed, {
    requirement: ({ groupId }, workspaceId) => readGroupRequirement(groupId, workspaceId),
    access: ({ memberId }) => Access.Groups({ memberId }),
  }),
  // Connections reach those who may read them; no fact carries a key.
  registerFact(ConnectionFacts.Created, {
    requirement: ({ id }, workspaceId) => readConnectionRequirement(id, workspaceId),
  }),
  registerFact(ConnectionFacts.Renamed, {
    requirement: ({ connectionId }, workspaceId) =>
      readConnectionRequirement(connectionId, workspaceId),
  }),
  registerFact(ConnectionFacts.Configured, {
    requirement: ({ connectionId }, workspaceId) =>
      readConnectionRequirement(connectionId, workspaceId),
  }),
  registerFact(ConnectionFacts.KeyReplaced, {
    requirement: ({ connectionId }, workspaceId) =>
      readConnectionRequirement(connectionId, workspaceId),
  }),
  registerFact(ConnectionFacts.Removed, {
    requirement: ({ connectionId }, workspaceId) =>
      readConnectionRequirement(connectionId, workspaceId),
  }),
  // Agents' configuration reaches those who may read it; their names and departures come with
  // membership facts.
  registerFact(AgentFacts.Created, {
    requirement: ({ memberId }, workspaceId) => readAgentRequirement(memberId, workspaceId),
  }),
  registerFact(AgentFacts.Configured, {
    requirement: ({ memberId }, workspaceId) => readAgentRequirement(memberId, workspaceId),
  }),
  // Turns reach those who may read their thread: what the agent is doing there, and how it ended.
  registerFact(TurnFacts.Created, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TurnFacts.Retried, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TurnFacts.Started, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TurnFacts.CancelRequested, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TurnFacts.Completed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TurnFacts.Failed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TurnFacts.Cancelled, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(GroupFollowFacts.Started),
  registerFact(GroupFollowFacts.Ended),
  registerFact(ThreadFacts.Created, {
    requirement: ({ id }, workspaceId) => readThreadRequirement(id, workspaceId),
  }),
  registerFact(ThreadFacts.Renamed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(ThreadMessageFacts.Published, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(ThreadMessageFacts.Edited, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(ThreadMessageFacts.Deleted, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TaskFacts.Created, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(TaskFacts.Updated, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  // Channels reach those who may read them; what a channel bound and delivered reaches the
  // thread's readers, and whom it heard from every member, as contacts write in threads.
  registerFact(ChannelFacts.Created, {
    requirement: ({ id }, workspaceId) => readChannelRequirement(id, workspaceId),
  }),
  registerFact(ChannelFacts.Redirected, {
    requirement: ({ channelId }, workspaceId) => readChannelRequirement(channelId, workspaceId),
  }),
  registerFact(ChannelFacts.Removed, {
    requirement: ({ channelId }, workspaceId) => readChannelRequirement(channelId, workspaceId),
  }),
  registerFact(ChannelFacts.Bound, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(ChannelFacts.ContactCreated),
  registerFact(ChannelFacts.ContactRenamed),
  registerFact(DeliveryFacts.Created, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(DeliveryFacts.Sent, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  registerFact(DeliveryFacts.Failed, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
  // Readers see the timeline item without whom it notified; each human or agent recipient
  // receives the notification it created for them, which needs no thread read permission.
  registerFact(ThreadActivityFacts.Recorded, {
    requirement: ({ activity }, workspaceId) =>
      readThreadRequirement(activity.threadId, workspaceId),
    notifications: (event) =>
      event.payload.recipients.flatMap((selected) =>
        Notification.Recipient.isAnyOf(["Human", "Agent"])(selected.recipient)
          ? [
              {
                scope: Member.audienceOf(selected.recipient.memberId),
                record: Notification.fromActivity(
                  event,
                  Object.assign({ groupId: event.payload.groupId }, event.payload.activity),
                  selected,
                ),
              },
            ]
          : [],
      ),
    view: {
      schema: Schema.Struct({
        groupId: ThreadActivityFacts.Recorded.payload.fields.groupId,
        activity: ThreadActivityFacts.Recorded.payload.fields.activity,
      }),
      from: ({ groupId, activity }) => ({ groupId, activity }),
    },
  }),
  // Readers see the public participant summary, without routing identities or admissions.
  registerFact(ThreadParticipationFacts.Added, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
    view: {
      schema: Schema.Struct({
        ...ThreadParticipation.Summary.fields,
        groupId: ThreadParticipationFacts.Added.payload.fields.groupId,
      }),
      from: (payload) =>
        Object.assign(ThreadParticipation.toSummary(payload), { groupId: payload.groupId }),
    },
  }),
  registerFact(ThreadParticipationFacts.Ended, {
    requirement: ({ threadId }, workspaceId) => readThreadRequirement(threadId, workspaceId),
  }),
];

const byName = new Map<string, Map<number, Registered>>();
for (const registered of registry) {
  const versions = byName.get(registered.name) ?? new Map<number, Registered>();
  versions.set(registered.version, registered);
  byName.set(registered.name, versions);
}

/**
 * Whether the feed delivers a fact at this version; facts it does not register are internal.
 *
 * @category utils
 * @since 0.1.0
 */
export const delivers = (fact: { readonly name: string; readonly version: number }) =>
  byName.get(fact.name)?.has(fact.version) ?? false;

/**
 * Decode one journal entry for delivery. Facts the feed does not register are internal and
 * yield None; a registered name recorded with an unknown version fails rather than disappear,
 * and the source makes subscribers refresh instead of delivering its commit.
 *
 * @category utils
 * @since 0.1.0
 */
export const prepare = Effect.fn("ChangeFeedEvents.prepare")(function* (
  entry: Log.Entry<Event.Envelope>,
) {
  const versions = byName.get(entry.payload.name);
  if (versions === undefined) return Option.none<Prepared>();
  const registered = versions.get(entry.payload.version);
  if (registered === undefined)
    return yield* new UnknownVersion({
      name: entry.payload.name,
      version: entry.payload.version,
    });
  return Option.some(yield* registered.prepare(entry));
});
