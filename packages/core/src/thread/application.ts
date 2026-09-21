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
import { ThreadCreation } from "./creation.ts";
import { ThreadAccess } from "./access.ts";
import { ThreadParticipationAdmission } from "./participation/admission.ts";
import { ThreadMessagePublication } from "./message/publication.ts";
import { ThreadPermissions } from "./permissions.ts";
import { ThreadMessage } from "./message/message.ts";
import { ThreadMessageStore } from "./message/store.ts";
import { ThreadParticipation } from "./participation/participation.ts";
import { ThreadParticipationStore } from "./participation/store.ts";
import { ThreadActivity } from "./activity/activity.ts";
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
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadApplication.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | Authorization.Error
  | GroupAudience.InvalidResponse
  | ThreadCreation.Error
  | Exclude<ThreadMessagePublication.Error, ThreadParticipationAdmission.Unavailable>
  | GroupMembershipStore.Failure
  | MemberStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | GroupNotFound
  | ParticipantUnavailable
  | HumanAuthorRequired
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
  readonly startInGroup: (
    input: Thread.StartInGroupInput,
  ) => Effect.Effect<Thread.Started, Error, Actor.Service>;
  /** Current group audience plus thread.read. Reading creates no participation or acknowledgment. */
  readonly get: (threadId: Thread.Id) => Effect.Effect<Thread.Record, ReadError, Actor.Service>;
  /** Current readable threads only, in stable ID order. This list is unpaginated. */
  readonly listInGroup: (
    groupId: Group.Id,
  ) => Effect.Effect<ReadonlyArray<Thread.Record>, ReadError, Actor.Service>;
  /** Bounded activity page with resolved messages, ordered by sequence. The cursor is exclusive. */
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
  const creation = yield* ThreadCreation.Service;
  const access = yield* ThreadAccess.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const publication = yield* ThreadMessagePublication.Service;
  const threads = yield* ThreadStore.Service;
  const messages = yield* ThreadMessageStore.Service;
  const activities = yield* ThreadActivityStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      audience.workspaceId,
      creation.workspaceId,
      access.workspaceId,
      admissions.workspaceId,
      publication.workspaceId,
      threads.workspaceId,
      messages.workspaceId,
      activities.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Thread services belong to different workspaces",
    });
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
      const selected =
        request.mentions.length === 0
          ? [...eligible.keys()].sort()
          : [actor.memberId, ...request.mentions.filter((id) => id !== actor.memberId)];
      for (const memberId of selected) {
        const member = eligible.get(memberId)?.member;
        if (member === undefined) return yield* new ParticipantUnavailable({ memberId });
        if (member.identity._tag === "Agent")
          yield* authorization.require([
            Requirement.make(AgentPermissions.Use, { _tag: "Member", workspaceId, memberId }),
          ]);
      }
      const occurredAt = yield* DateTime.now;
      const created = yield* creation.create({
        groupId: request.groupId,
        createdBy: actor.memberId,
        createdAt: occurredAt,
      });
      const thread = created.payload;
      const published = yield* publication
        .publish({
          threadId: thread.id,
          authorMemberId: actor.memberId,
          text: request.text,
          mentions: request.mentions,
          participantIds: selected,
          occurredAt,
        })
        .pipe(
          Publication.withCause(created, occurredAt),
          Effect.catchTag("ThreadParticipationAdmission.Unavailable", (error) =>
            Effect.fail(new ParticipantUnavailable({ memberId: error.memberId })),
          ),
        );
      return {
        thread,
        message: published.message,
        activity: published.activity,
      } satisfies Thread.Started;
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
  const readTimeline = Effect.fn("ThreadApplication.readTimeline")(function* (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) {
    const request = yield* Schema.decodeEffect(ThreadActivityStore.ReadOptions)(options);
    const thread = yield* get(threadId);
    const found = yield* activities.readPage(thread.id, request);
    if (found.length > request.limit)
      return yield* new InvalidResponse({ message: "Timeline exceeds the requested page size" });
    let afterSequence = request.afterSequence ?? 0;
    const seen = new Set<ThreadActivity.Id>();
    const seenMessages = new Set<ThreadMessage.Id>();
    const items: Array<Thread.TimelineItem> = [];
    for (const row of found) {
      const activity = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(row).pipe(
        Effect.mapError(invalidReadRecord),
      );
      if (
        activity.workspaceId !== workspaceId ||
        activity.threadId !== thread.id ||
        activity.sequence <= afterSequence ||
        seen.has(activity.id) ||
        seenMessages.has(activity.messageId)
      )
        return yield* new InvalidResponse({
          message: "Timeline store returned inconsistent references or order",
        });
      afterSequence = activity.sequence;
      seen.add(activity.id);
      seenMessages.add(activity.messageId);
      const foundMessage = yield* messages.get(activity.messageId);
      if (Option.isNone(foundMessage))
        return yield* new InvalidResponse({
          message: "Timeline activity references a missing message",
        });
      const message = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Record))(
        foundMessage.value,
      ).pipe(Effect.mapError(invalidReadRecord));
      if (
        message.workspaceId !== workspaceId ||
        message.threadId !== thread.id ||
        message.id !== activity.messageId
      )
        return yield* new InvalidResponse({
          message: "Message store returned another message, thread, or workspace",
        });
      items.push({ activity, message });
    }
    return items;
  });
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
    const current: Array<ThreadParticipation.Summary> = participants.map((participant) => ({
      id: participant.id,
      workspaceId,
      threadId: thread.id,
      memberId: participant.memberId,
      joinedAt: participant.joinedAt,
      joinedAtSequence: participant.joinedAtSequence,
    }));
    return current;
  });
  return Service.of({
    workspaceId,
    startInGroup,
    get,
    listInGroup,
    readTimeline,
    listParticipants,
  });
});
/** Provide opening-message workflows and authorized reads; replies use ThreadMessageApplication. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadApplication from "./application.ts";
