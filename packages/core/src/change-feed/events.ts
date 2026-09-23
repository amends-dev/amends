import { Effect, Option, Schema } from "effect";
import { AssignmentFacts } from "../authorization/assignment/facts.ts";
import { Requirement } from "../authorization/requirement.ts";
import { RoleFacts } from "../authorization/role/facts.ts";
import { GroupFacts } from "../group/facts.ts";
import type { Group } from "../group/group.ts";
import { GroupFollowFacts } from "../group/follow/facts.ts";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import { GroupPermissions } from "../group/permissions.ts";
import type { Audience } from "../journal/audience.ts";
import { Event } from "../journal/event.ts";
import { Fact } from "../journal/fact.ts";
import type { Log } from "../journal/log.ts";
import { NotificationFacts } from "../notification/facts.ts";
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
import type { Member } from "../workspace/member/member.ts";
import { ChangeFeed } from "./change-feed.ts";

/**
 * How a fact changes what one reader may see: their group admissions, their grants (or anyone's,
 * without a member), or their workspace membership ending.
 */
export type Access =
  | { readonly _tag: "Groups"; readonly memberId: Member.Id }
  | { readonly _tag: "Grants"; readonly memberId: Member.Id | undefined }
  | { readonly _tag: "Removed"; readonly memberId: Member.Id };

/** One decoded event, ready to filter for each reader. */
export interface Prepared {
  readonly event: ChangeFeed.Event;
  readonly audience: Audience.Value;
  /** The read permission a reader also needs, beyond holding one of the audience's scopes. */
  readonly requirement: Requirement.Value | undefined;
  readonly access: Access | undefined;
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
        access: options.access?.(payload),
      };
    }),
  };
};

const readThread = (threadId: ThreadId.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId });
const readGroup = (groupId: Group.Id, workspaceId: WorkspaceId.Id) =>
  Requirement.make(GroupPermissions.Read, { _tag: "Group", workspaceId, groupId });

/**
 * Every fact the feed may deliver, each version registered separately. Readers see an event
 * when they hold a scope in its audience and any read permission it names, the same permission
 * the matching read requires. Facts absent from this list are internal.
 */
const registry: ReadonlyArray<Registered> = [
  register(WorkspaceFacts.Initialized),
  register(WorkspaceFacts.OwnershipTransferred),
  register(MemberFacts.Added),
  register(MemberFacts.Removed, {
    access: ({ memberId }) => ({ _tag: "Removed", memberId }),
  }),
  register(InvitationFacts.Issued),
  register(InvitationFacts.Accepted),
  register(InvitationFacts.Revoked),
  register(RoleFacts.Created),
  register(RoleFacts.Renamed),
  register(RoleFacts.PermissionsChanged, {
    access: () => ({ _tag: "Grants", memberId: undefined }),
  }),
  register(AssignmentFacts.Created, {
    access: ({ memberId }) => ({ _tag: "Grants", memberId }),
  }),
  // A revocation does not name its member, so every reader rechecks their grants.
  register(AssignmentFacts.Revoked, {
    access: () => ({ _tag: "Grants", memberId: undefined }),
  }),
  register(GroupFacts.Created, {
    requirement: ({ id }, workspaceId) => readGroup(id, workspaceId),
  }),
  register(GroupMembershipFacts.Added, {
    requirement: ({ groupId }, workspaceId) => readGroup(groupId, workspaceId),
    access: ({ memberId }) => ({ _tag: "Groups", memberId }),
  }),
  register(GroupMembershipFacts.Removed, {
    requirement: ({ groupId }, workspaceId) => readGroup(groupId, workspaceId),
    access: ({ memberId }) => ({ _tag: "Groups", memberId }),
  }),
  register(GroupFollowFacts.Started),
  register(GroupFollowFacts.Ended),
  register(ThreadFacts.Created, {
    requirement: ({ id }, workspaceId) => readThread(id, workspaceId),
  }),
  register(ThreadMessageFacts.Published, {
    requirement: ({ threadId }, workspaceId) => readThread(threadId, workspaceId),
  }),
  // Readers see the timeline item; who it notified stays with the notification projection.
  register(ThreadActivityFacts.Recorded, {
    requirement: ({ activity }, workspaceId) => readThread(activity.threadId, workspaceId),
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
  register(NotificationFacts.Acknowledged),
];

const byName = new Map<string, Map<number, Registered>>();
for (const registered of registry) {
  const versions = byName.get(registered.name) ?? new Map<number, Registered>();
  versions.set(registered.version, registered);
  byName.set(registered.name, versions);
}

/**
 * Decode one journal entry for delivery. Facts the feed does not register are internal and
 * yield None; a registered name recorded with an unknown version fails rather than disappear.
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
