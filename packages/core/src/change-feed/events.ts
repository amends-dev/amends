import { Effect, Option, Schema } from "effect";
import { AgentFacts } from "../agent/facts.ts";
import { AgentPermissions } from "../agent/permissions.ts";
import { AssignmentFacts } from "../authorization/assignment/facts.ts";
import { Requirement } from "../authorization/requirement.ts";
import { RoleFacts } from "../authorization/role/facts.ts";
import { GroupFacts } from "../group/facts.ts";
import type { ConnectionId } from "../connection/id.ts";
import { ConnectionFacts } from "../connection/facts.ts";
import { ConnectionPermissions } from "../connection/permissions.ts";
import { EnvironmentFacts } from "../environment/facts.ts";
import type { EnvironmentId } from "../environment/id.ts";
import { EnvironmentPermissions } from "../environment/permissions.ts";
import type { Group } from "../group/group.ts";
import { GroupFollowFacts } from "../group/follow/facts.ts";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import { GroupPermissions } from "../group/permissions.ts";
import type { Audience } from "../journal/audience.ts";
import { Event } from "../journal/event.ts";
import { Fact } from "../journal/fact.ts";
import type { Log } from "../journal/log.ts";
import { Notification } from "../notification/notification.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import type { ThreadId } from "../thread/id.ts";
import { ThreadFacts } from "../thread/facts.ts";
import { ThreadMessageFacts } from "../thread/message/facts.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { ThreadParticipationFacts } from "../thread/participation/facts.ts";
import { ThreadPermissions } from "../thread/permissions.ts";
import { WorkspaceFacts } from "../workspace/facts.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { InvitationFacts } from "../workspace/invitation/facts.ts";
import { MemberFacts } from "../workspace/member/facts.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberPermissions } from "../workspace/member/permissions.ts";
import { InvitationPermissions } from "../workspace/invitation/permissions.ts";
import { AssignmentPermissions } from "../authorization/assignment/permissions.ts";
import { ChangeFeed } from "./change-feed.ts";

/**
 * How a fact changes what one reader may see: their group admissions, their grants (or anyone's,
 * without a member), or their workspace membership ending.
 */
export type Access =
  | { readonly _tag: "Groups"; readonly memberId: Member.Id }
  | { readonly _tag: "Grants"; readonly memberId: Member.Id | undefined }
  | { readonly _tag: "Removed"; readonly memberId: Member.Id };

/** A notification the event created, for the reader holding its recipient's scope. */
export interface Addressed {
  readonly scope: Audience.Scope;
  readonly record: Notification.Record;
}

/** One decoded event, ready to filter for each reader. */
export interface Prepared {
  readonly event: ChangeFeed.Event;
  readonly audience: Audience.Value;
  /** The read permission a reader also needs, beyond holding one of the audience's scopes. */
  readonly requirement: Requirement.Value | undefined;
  /** A scope whose holder needs no read permission: the member the fact is about. */
  readonly exempt: Audience.Scope | undefined;
  readonly access: Access | undefined;
  readonly notifications: ReadonlyArray<Addressed>;
}

/** A published fact's name recorded with a version this host does not know. */
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

/**
 * Deliver one fact version to its audience. The payload is the fact's own unless a view names
 * the public shape, which then matches what the corresponding read returns.
 */
/** A fact whose payload schema needs no services, as every domain fact's does. */
type Standalone = Fact.Definition & {
  readonly payload: { readonly DecodingServices: never; readonly EncodingServices: never };
};

const register = <F extends Standalone, View extends Schema.Constraint = F["payload"]>(
  fact: F,
  options: {
    readonly requirement?: (
      payload: Fact.Payload<F>,
      workspaceId: WorkspaceId.Id,
    ) => Requirement.Value;
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

const readThread = (threadId: ThreadId.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId });
const readGroup = (groupId: Group.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId });
const readMember = (memberId: Member.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(MemberPermissions.Read, { _tag: "Member", workspaceId, memberId });
const readAccess = (memberId: Member.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(AssignmentPermissions.Read, { _tag: "Member", workspaceId, memberId });
const readConnection = (connectionId: ConnectionId.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(ConnectionPermissions.Read, { _tag: "Connection", workspaceId, connectionId });
const readEnvironment = (environmentId: EnvironmentId.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(EnvironmentPermissions.Read, {
    _tag: "Environment",
    workspaceId,
    environmentId,
  });
const readAgent = (memberId: Member.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(AgentPermissions.Read, { _tag: "Member", workspaceId, memberId });
const manageInvitations = (_: unknown, workspaceId: WorkspaceId.Id) =>
  Requirement.make(InvitationPermissions.Manage, { _tag: "Workspace", workspaceId });

/**
 * Every fact the feed may deliver, each version registered separately. Readers see an event
 * when they hold a scope in its audience and any read permission it names, the same permission
 * the matching read requires. Facts absent from this list are internal.
 */
const registry: ReadonlyArray<Registered> = [
  register(WorkspaceFacts.Initialized),
  register(WorkspaceFacts.Renamed),
  register(WorkspaceFacts.OwnershipTransferred),
  // Membership and access changes reach those who may read them, and always the member concerned.
  register(MemberFacts.Added, {
    requirement: ({ memberId }, workspaceId) => readMember(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
  }),
  register(MemberFacts.Removed, {
    requirement: ({ memberId }, workspaceId) => readMember(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => ({ _tag: "Removed", memberId }),
  }),
  register(MemberFacts.Renamed, {
    requirement: ({ memberId }, workspaceId) => readMember(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
  }),
  // Invitations name their recipient and role, which only invitation managers may list.
  register(InvitationFacts.Issued, { requirement: manageInvitations }),
  register(InvitationFacts.Accepted, {
    requirement: manageInvitations,
    concerns: ({ memberId }) => memberId,
  }),
  register(InvitationFacts.Revoked, { requirement: manageInvitations }),
  register(RoleFacts.Created),
  register(RoleFacts.Renamed),
  // Marks a built-in role revision; the renames and permission changes it made come with it.
  register(RoleFacts.BuiltinsRevised),
  register(RoleFacts.PermissionsChanged, {
    access: () => ({ _tag: "Grants", memberId: undefined }),
  }),
  register(AssignmentFacts.Created, {
    requirement: ({ memberId }, workspaceId) => readAccess(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => ({ _tag: "Grants", memberId }),
  }),
  register(AssignmentFacts.Revoked, {
    requirement: ({ memberId }, workspaceId) => readAccess(memberId, workspaceId),
    concerns: ({ memberId }) => memberId,
    access: ({ memberId }) => ({ _tag: "Grants", memberId }),
  }),
  register(GroupFacts.Created, {
    requirement: ({ id }, workspaceId) => readGroup(id, workspaceId),
  }),
  register(GroupFacts.Renamed, {
    requirement: ({ groupId }, workspaceId) => readGroup(groupId, workspaceId),
  }),
  register(GroupMembershipFacts.Added, {
    requirement: ({ groupId }, workspaceId) => readGroup(groupId, workspaceId),
    access: ({ memberId }) => ({ _tag: "Groups", memberId }),
  }),
  register(GroupMembershipFacts.Removed, {
    requirement: ({ groupId }, workspaceId) => readGroup(groupId, workspaceId),
    access: ({ memberId }) => ({ _tag: "Groups", memberId }),
  }),
  // Connections reach those who may read them; no fact carries a secret.
  register(ConnectionFacts.Created, {
    requirement: ({ id }, workspaceId) => readConnection(id, workspaceId),
  }),
  register(ConnectionFacts.Renamed, {
    requirement: ({ connectionId }, workspaceId) => readConnection(connectionId, workspaceId),
  }),
  register(ConnectionFacts.Configured, {
    requirement: ({ connectionId }, workspaceId) => readConnection(connectionId, workspaceId),
  }),
  register(ConnectionFacts.CredentialSet, {
    requirement: ({ connectionId }, workspaceId) => readConnection(connectionId, workspaceId),
  }),
  register(ConnectionFacts.CredentialCleared, {
    requirement: ({ connectionId }, workspaceId) => readConnection(connectionId, workspaceId),
  }),
  register(ConnectionFacts.Removed, {
    requirement: ({ connectionId }, workspaceId) => readConnection(connectionId, workspaceId),
  }),
  register(EnvironmentFacts.Created, {
    requirement: ({ id }, workspaceId) => readEnvironment(id, workspaceId),
  }),
  register(EnvironmentFacts.Renamed, {
    requirement: ({ environmentId }, workspaceId) => readEnvironment(environmentId, workspaceId),
  }),
  register(EnvironmentFacts.Configured, {
    requirement: ({ environmentId }, workspaceId) => readEnvironment(environmentId, workspaceId),
  }),
  register(EnvironmentFacts.Removed, {
    requirement: ({ environmentId }, workspaceId) => readEnvironment(environmentId, workspaceId),
  }),
  // Agents' configuration reaches those who may read it; their names come with membership facts.
  register(AgentFacts.Created, {
    requirement: ({ memberId }, workspaceId) => readAgent(memberId, workspaceId),
  }),
  register(AgentFacts.Configured, {
    requirement: ({ memberId }, workspaceId) => readAgent(memberId, workspaceId),
  }),
  register(GroupFollowFacts.Started),
  register(GroupFollowFacts.Ended),
  register(ThreadFacts.Created, {
    requirement: ({ id }, workspaceId) => readThread(id, workspaceId),
  }),
  register(ThreadMessageFacts.Published, {
    requirement: ({ threadId }, workspaceId) => readThread(threadId, workspaceId),
  }),
  // Readers see the timeline item without whom it notified; each human or agent recipient
  // receives the notification it created for them, which needs no thread read permission.
  register(ThreadActivityFacts.Recorded, {
    requirement: ({ activity }, workspaceId) => readThread(activity.threadId, workspaceId),
    notifications: (event) =>
      event.payload.recipients.flatMap((selected) =>
        selected.recipient._tag === "Human" || selected.recipient._tag === "Agent"
          ? [
              {
                scope: Member.audienceOf(selected.recipient.memberId),
                record: Notification.generated(
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
  register(ThreadParticipationFacts.Added, {
    requirement: ({ threadId }, workspaceId) => readThread(threadId, workspaceId),
    view: {
      schema: Schema.Struct({
        ...ThreadParticipation.Summary.fields,
        groupId: ThreadParticipationFacts.Added.payload.fields.groupId,
      }),
      from: (payload) =>
        Object.assign(ThreadParticipation.toSummary(payload), { groupId: payload.groupId }),
    },
  }),
  register(ThreadParticipationFacts.Ended, {
    requirement: ({ threadId }, workspaceId) => readThread(threadId, workspaceId),
  }),
];

const byName = new Map<string, Map<number, Registered>>();
for (const registered of registry) {
  const versions = byName.get(registered.name) ?? new Map<number, Registered>();
  versions.set(registered.version, registered);
  byName.set(registered.name, versions);
}

/** Whether the feed delivers a fact at this version; facts it does not register are internal. */
export const delivers = (fact: { readonly name: string; readonly version: number }) =>
  byName.get(fact.name)?.has(fact.version) ?? false;

/**
 * Decode one journal entry for delivery. Facts the feed does not register are internal and
 * yield None; a registered name recorded with an unknown version fails rather than disappear,
 * and the source makes subscribers refresh instead of delivering its commit.
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

export * as ChangeFeedEvents from "./events.ts";
