import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Actor } from "../identity/actor.ts";
import { Group } from "../group/group.ts";
import { GroupAudience } from "../group/audience.ts";
import { GroupMembershipStore } from "../group/membership/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Thread } from "./thread.ts";
import { ThreadStore } from "./store.ts";
import { ThreadStart } from "./start.ts";
import { GroupStore } from "../group/store.ts";
import { DirectGroups } from "../group/direct.ts";
import { ThreadAccess } from "./access.ts";
import { ThreadParticipationAdmission } from "./participation/admission.ts";
import { ThreadMessagePublication } from "./message/publication.ts";
import { ThreadPermissions } from "./permissions.ts";
import { ThreadMessageStore } from "./message/store.ts";
import { ThreadParticipation } from "./participation/participation.ts";
import { ThreadParticipationStore } from "./participation/store.ts";
import { ThreadActivityReading } from "./activity/reading.ts";
import { ThreadActivityStore } from "./activity/store.ts";
/** Missing, foreign, and outside-audience threads share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("ThreadApplication.NotFound", {
  threadId: Thread.Id,
}) {}
export class GroupNotFound extends Schema.TaggedError<GroupNotFound>()(
  "ThreadApplication.GroupNotFound",
  { groupId: Group.Id },
) {}
export class ParticipantUnavailable extends Schema.TaggedError<ParticipantUnavailable>()(
  "ThreadApplication.ParticipantUnavailable",
  { memberId: Member.Id },
) {}
export class HumanAuthorRequired extends Schema.TaggedError<HumanAuthorRequired>()(
  "ThreadApplication.HumanAuthorRequired",
  { memberId: Member.Id },
) {}
/** A direct group needs the author and at least one other member. */
export class DirectMembersRequired extends Schema.TaggedError<DirectMembersRequired>()(
  "ThreadApplication.DirectMembersRequired",
  {},
) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadApplication.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | Authorization.Error
  | GroupAudience.InvalidResponse
  | Exclude<ThreadStart.Error, ThreadParticipationAdmission.Unavailable>
  | Exclude<DirectGroups.Error, DirectGroups.Unavailable>
  | GroupStore.Failure
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | GroupNotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
  | DirectMembersRequired
  | InvalidResponse;
export type ReadError =
  | Authorization.Error
  | GroupAudience.InvalidResponse
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | ThreadStore.Failure
  | ThreadMessageStore.Failure
  | ThreadActivityStore.Failure
  | ThreadParticipationStore.Failure
  | Schema.SchemaError
  | GroupNotFound
  | NotFound
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /**
   * Start a thread in a group the author belongs to. A team thread starts with its author and
   * mentioned members; the rest of the group can read it without participating. A direct-group
   * thread enrolls all of its members, and mentions only narrow who is notified. Only mentioned
   * agents need the author's agent-use authority.
   */
  readonly startInGroup: (
    input: Thread.StartInGroupInput,
  ) => Effect.Effect<Thread.Started, Error, Actor.Service>;
  /**
   * Establish or reuse the direct group for the author and the given members, then start a
   * thread with all of them. Needs active membership, agent use for every named agent, and
   * thread.start on the direct group; no group-management permission.
   */
  readonly startDirect: (
    input: Thread.StartDirectInput,
  ) => Effect.Effect<Thread.Started, Error, Actor.Service>;
  /** Current group audience plus thread.read. Reading creates no participation or acknowledgment. */
  readonly get: (threadId: Thread.Id) => Effect.Effect<Thread.Record, ReadError, Actor.Service>;
  /** Current readable threads only, in stable ID order. This list is unpaginated. */
  readonly listInGroup: (
    groupId: Group.Id,
  ) => Effect.Effect<ReadonlyArray<Thread.Record>, ReadError, Actor.Service>;
  /** Bounded activity page with resolved subjects, ordered by sequence. The cursor is exclusive. */
  readonly readTimeline: (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, ReadError, Actor.Service>;
  /** Active participation backed by current workspace/group admissions; public member references only. */
  readonly listParticipants: (
    threadId: Thread.Id,
  ) => Effect.Effect<ReadonlyArray<ThreadParticipation.Summary>, ReadError, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/application/Service",
) {}
const invalidReadRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Thread storage returned invalid data: ${cause.message}` });
const decodeThread = Schema.decodeEffect(Schema.toType(Thread.Record));
/** Capture bound services; authorize the complete requested conversation inside its commit. @category constructors */
export const make = Effect.fn("ThreadApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const audience = yield* GroupAudience.Service;
  const starts = yield* ThreadStart.Service;
  const groups = yield* GroupStore.Service;
  const directGroups = yield* DirectGroups.Service;
  const access = yield* ThreadAccess.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const publication = yield* ThreadMessagePublication.Service;
  const threads = yield* ThreadStore.Service;
  const reading = yield* ThreadActivityReading.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      audience.workspaceId,
      starts.workspaceId,
      groups.workspaceId,
      directGroups.workspaceId,
      access.workspaceId,
      admissions.workspaceId,
      publication.workspaceId,
      threads.workspaceId,
      reading.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Thread services belong to different workspaces",
    });
  /**
   * Check the starting participants, authorize the agents the author names, then open the thread
   * through the shared start. Agents that take part without being named need no agent-use grant.
   */
  const begin = Effect.fnUntraced(function* (
    groupId: Group.Id,
    selected: ReadonlyArray<Member.Id>,
    named: ReadonlyArray<Member.Id>,
    eligible: ReadonlyMap<Member.Id, ThreadParticipationAdmission.Eligible>,
    message: {
      readonly text: Thread.StartInGroupInput["text"];
      readonly mentions: ReadonlyArray<Member.Id>;
    },
  ) {
    const actor = yield* Actor.Service;
    for (const memberId of selected)
      if (!eligible.has(memberId)) return yield* new ParticipantUnavailable({ memberId });
    for (const memberId of named) {
      const member = eligible.get(memberId)?.member;
      if (member === undefined) return yield* new ParticipantUnavailable({ memberId });
      if (member.identity._tag === "Agent")
        yield* authorization.require([
          Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
        ]);
    }
    return yield* starts
      .start({
        groupId,
        participants: selected.map((memberId) => ({ _tag: "Member" as const, memberId })),
        first: {
          _tag: "Message",
          author: { _tag: "Member", memberId: actor.memberId },
          text: message.text,
          mentions: message.mentions,
        },
        occurredAt: yield* DateTime.now,
      })
      .pipe(
        Effect.catchTag("ThreadParticipationAdmission.Unavailable", (error) =>
          Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
        ),
      );
  });
  const startDirect = Effect.fn("ThreadApplication.startDirect")(
    function* (input: Thread.StartDirectInput) {
      const request = yield* Schema.decodeEffect(Thread.StartDirectInput)(input);
      yield* authorization.require([]);
      const actor = yield* Actor.Service;
      if (actor.identity._tag !== "Human")
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const memberIds = Group.directMembers([actor.memberId, ...request.memberIds]);
      if (memberIds.length < 2) return yield* new DirectMembersRequired({});
      const missing = request.mentions.find((id) => !memberIds.includes(id));
      if (missing !== undefined) return yield* new ParticipantUnavailable({ memberId: missing });
      const group = yield* directGroups
        .establish(memberIds, actor.memberId, yield* DateTime.now)
        .pipe(
          Effect.catchTag("DirectGroups.Unavailable", (error) =>
            Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
          ),
        );
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, {
          _tag: "Group",
          workspaceId,
          groupId: group.id,
        }),
      ]);
      const eligible = yield* admissions
        .eligible(group.id)
        .pipe(
          Effect.catchTag("ThreadParticipationAdmission.InvalidResponse", (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          ),
        );
      return yield* begin(group.id, memberIds, memberIds, eligible, request);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  const startInGroup = Effect.fn("ThreadApplication.startInGroup")(
    function* (input: Thread.StartInGroupInput) {
      const request = yield* Schema.decodeEffect(Thread.StartInGroupInput)(input);
      const authorAdmission = yield* audience
        .require(request.groupId)
        .pipe(
          Effect.catchTag("GroupAudience.NotMember", () =>
            Effect.fail(new GroupNotFound({ groupId: request.groupId })),
          ),
        );
      yield* authorization.require([
        Requirement.make(ThreadPermissions.Start, {
          _tag: "Group",
          workspaceId,
          groupId: request.groupId,
        }),
      ]);
      const actor = yield* Actor.Service;
      if (actor.identity._tag !== "Human")
        return yield* new HumanAuthorRequired({ memberId: actor.memberId });
      const eligible = yield* admissions
        .eligible(request.groupId)
        .pipe(
          Effect.catchTag("ThreadParticipationAdmission.InvalidResponse", (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          ),
        );
      if (eligible.get(actor.memberId)?.admission.id !== authorAdmission.id)
        return yield* new InvalidResponse({
          message: "Group listing omitted the author's current admission",
        });
      const foundGroup = yield* groups.get(request.groupId);
      if (Option.isNone(foundGroup))
        return yield* new InvalidResponse({ message: "Audience group is missing" });
      // A direct group's members all take part; a team thread starts with its author and the
      // members its opening message mentions, and the rest of the group sees it as unread.
      const selected =
        foundGroup.value.kind === "Direct"
          ? [...eligible.keys()].sort()
          : [actor.memberId, ...request.mentions.filter((id) => id !== actor.memberId)];
      const missing = request.mentions.find((id) => !eligible.has(id));
      if (missing !== undefined) return yield* new ParticipantUnavailable({ memberId: missing });
      return yield* begin(request.groupId, selected, request.mentions, eligible, request);
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  // All read entry points use this check before exposing conversation data. It is deliberately
  // outside journal.commit; an enclosing caller transaction remains authoritative when present.
  const get = Effect.fn("ThreadApplication.get")(function* (threadId: Thread.Id) {
    const thread = yield* access.require(threadId).pipe(
      Effect.catchTags({
        "ThreadAccess.NotFound": (error) => Effect.fail(new NotFound({ threadId: error.threadId })),
        "ThreadAccess.InvalidResponse": (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
      }),
    );
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    return thread;
  });
  const listInGroup = Effect.fn("ThreadApplication.listInGroup")(function* (groupId: Group.Id) {
    const id = yield* Schema.decodeEffect(Group.Id)(groupId);
    yield* audience
      .require(id)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new GroupNotFound({ groupId: id })),
        ),
      );
    const seen = new Set<Thread.Id>();
    const readable: Array<Thread.Record> = [];
    for (const found of yield* threads.listByGroup(id)) {
      const candidate = yield* decodeThread(found).pipe(Effect.mapError(invalidReadRecord));
      if (
        candidate.workspaceId !== workspaceId ||
        candidate.groupId !== id ||
        seen.has(candidate.id)
      )
        return yield* new InvalidResponse({
          message: "Thread store returned an inconsistent group listing",
        });
      seen.add(candidate.id);
      const current = yield* get(candidate.id).pipe(
        Effect.asSome,
        Effect.catchTag(
          ["ThreadApplication.NotFound", "Authorization.Denied"],
          () => Effect.succeedNone,
        ),
      );
      if (Option.isSome(current)) {
        if (current.value.groupId !== id)
          return yield* new InvalidResponse({ message: "Thread lookup returned another group" });
        readable.push(current.value);
      }
    }
    return readable;
  });
  const readTimeline = Effect.fn("ThreadApplication.readTimeline")(
    (threadId: Thread.Id, options: ThreadActivityStore.ReadOptions) =>
      reading.page(threadId, options).pipe(
        Effect.catchTags({
          "ThreadAccess.NotFound": (error) =>
            Effect.fail(new NotFound({ threadId: error.threadId })),
          "ThreadAccess.InvalidResponse": (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          "ThreadActivityReading.InvalidResponse": (error) =>
            Effect.fail(new InvalidResponse({ message: error.message })),
          "ThreadActivityReading.NotFound": () =>
            Effect.fail(new InvalidResponse({ message: "Timeline activity is missing" })),
        }),
      ),
  );
  const listParticipants = Effect.fn("ThreadApplication.listParticipants")(function* (
    threadId: Thread.Id,
  ) {
    const thread = yield* get(threadId);
    const participants = yield* admissions
      .current(thread)
      .pipe(
        Effect.catchTag("ThreadParticipationAdmission.InvalidResponse", (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
        ),
      );
    return participants.map(ThreadParticipation.toSummary);
  });
  return Service.of({
    workspaceId,
    startInGroup,
    startDirect,
    get,
    listInGroup,
    readTimeline,
    listParticipants,
  });
});
/** Provide opening-message workflows and authorized reads; replies use ThreadMessageApplication. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadApplication from "./application.ts";
