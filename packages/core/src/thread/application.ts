import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { AgentPermissions } from "../agent/permissions.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Group } from "../group/group.ts";
import { GroupAudience } from "../group/audience.ts";
import { GroupMembership } from "../group/membership/membership.ts";
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
import { ThreadPermissions } from "./permissions.ts";
import { ThreadMessage } from "./message/message.ts";
import { ThreadMessageFacts } from "./message/facts.ts";
import { ThreadMessageStore } from "./message/store.ts";
import { ThreadParticipation } from "./participation/participation.ts";
import { ThreadParticipationFacts } from "./participation/facts.ts";
import { ThreadParticipationStore } from "./participation/store.ts";
import { ThreadActivity } from "./activity/activity.ts";
import { ThreadActivityFacts } from "./activity/facts.ts";
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
const sameIdentity = Schema.toEquivalence(Identity.MemberReference);
/** Capture bound services; authorize the complete requested conversation inside its commit. @category constructors */
export const make = Effect.fn("ThreadApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const audience = yield* GroupAudience.Service;
  const memberships = yield* GroupMembershipStore.Service;
  const members = yield* MemberStore.Service;
  const creation = yield* ThreadCreation.Service;
  const threads = yield* ThreadStore.Service;
  const messages = yield* ThreadMessageStore.Service;
  const activities = yield* ThreadActivityStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = authorization.workspaceId;
  if (
    [
      audience.workspaceId,
      memberships.workspaceId,
      members.workspaceId,
      creation.workspaceId,
      threads.workspaceId,
      messages.workspaceId,
      activities.workspaceId,
      participations.workspaceId,
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
      const eligible = new Map<
        Member.Id,
        { admission: GroupMembership.Record; member: Member.Record }
      >();
      const seen = new Set<GroupMembership.Id>();
      for (const found of yield* memberships.listByGroup(request.groupId)) {
        const admission = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(found);
        if (
          admission.workspaceId !== workspaceId ||
          admission.groupId !== request.groupId ||
          seen.has(admission.id)
        )
          return yield* new InvalidResponse({ message: "Group admissions are inconsistent" });
        seen.add(admission.id);
        if (admission.status !== "active") continue;
        if (eligible.has(admission.memberId))
          return yield* new InvalidResponse({ message: "Duplicate active group admission" });
        const foundMember = yield* members.get(admission.memberId);
        if (Option.isNone(foundMember))
          return yield* new InvalidResponse({ message: "Group admission has no workspace member" });
        const member = yield* Schema.decodeEffect(Member.Record)(foundMember.value);
        if (member.id !== admission.memberId || member.workspaceId !== workspaceId)
          return yield* new InvalidResponse({
            message: "Group member belongs to another membership or workspace",
          });
        if (member.status === "active") eligible.set(member.id, { admission, member });
      }
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
      const participants: Array<ThreadParticipation.Record> = [];
      for (const memberId of selected) {
        const entry = eligible.get(memberId);
        if (entry === undefined)
          return yield* new InvalidResponse({ message: "Selected participant disappeared" });
        const participant = {
          id: ThreadParticipation.Id.make(yield* crypto.randomUUIDv4),
          workspaceId,
          threadId: thread.id,
          memberId,
          groupMembershipId: entry.admission.id,
          identity: entry.member.identity,
          joinedAt: occurredAt,
          joinedAtSequence: 1,
          status: "active",
          endedAt: null,
        } satisfies ThreadParticipation.Record;
        yield* journal
          .publish(ThreadParticipationFacts.Added, participant)
          .pipe(Publication.withCause(created, occurredAt));
        participants.push(participant);
      }
      const message = {
        id: ThreadMessage.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        authorMemberId: actor.memberId,
        kind: "User",
        text: request.text,
        mentions: request.mentions,
        publishedAt: occurredAt,
      } satisfies ThreadMessage.Record;
      const published = yield* journal
        .publish(ThreadMessageFacts.Published, message)
        .pipe(Publication.withCause(created, occurredAt));
      const activity = {
        id: ThreadActivity.Id.make(yield* crypto.randomUUIDv4),
        workspaceId,
        threadId: thread.id,
        sequence: 1,
        kind: "MessagePublished",
        messageId: message.id,
        occurredAt,
      } satisfies ThreadActivity.Record;
      const recipients = participants
        .filter(
          (participant) =>
            request.mentions.length === 0 || request.mentions.includes(participant.memberId),
        )
        .map((participant) => ({
          participationId: participant.id,
          identity: participant.identity,
        }));
      yield* journal
        .publish(ThreadActivityFacts.Recorded, { activity, recipients })
        .pipe(Publication.withCause(published, occurredAt));
      return { thread, message, activity } satisfies Thread.Started;
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    journal.commit,
  );
  // All read entry points use this check before exposing conversation data. It is deliberately
  // outside journal.commit; an enclosing caller transaction remains authoritative when present.
  const get = Effect.fn("ThreadApplication.get")(function* (threadId: Thread.Id) {
    const id = yield* Schema.decodeEffect(Thread.Id)(threadId);
    yield* authorization.require([]);
    const found = yield* threads.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ threadId: id });
    const thread = yield* decodeThread(found.value).pipe(Effect.mapError(invalidReadRecord));
    if (thread.workspaceId !== workspaceId || thread.id !== id)
      return yield* new InvalidResponse({
        message: "Thread store returned another thread or workspace",
      });
    yield* audience
      .require(thread.groupId)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new NotFound({ threadId: id })),
        ),
      );
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, { _tag: "Thread", workspaceId, threadId: id }),
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
    const current: Array<ThreadParticipation.Summary> = [];
    const seen = new Set<ThreadParticipation.Id>();
    const seenMembers = new Set<Member.Id>();
    for (const found of yield* participations.listByThread(thread.id)) {
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        found,
      ).pipe(Effect.mapError(invalidReadRecord));
      if (
        participant.workspaceId !== workspaceId ||
        participant.threadId !== thread.id ||
        seen.has(participant.id)
      )
        return yield* new InvalidResponse({
          message: "Participation store returned an inconsistent thread listing",
        });
      seen.add(participant.id);
      if (participant.status !== "active") continue;
      if (seenMembers.has(participant.memberId))
        return yield* new InvalidResponse({
          message: "Participation store returned duplicate active members",
        });
      seenMembers.add(participant.memberId);
      const foundAdmission = yield* memberships.get(participant.groupMembershipId);
      const foundMember = yield* members.get(participant.memberId);
      if (Option.isNone(foundAdmission) || Option.isNone(foundMember))
        return yield* new InvalidResponse({
          message: "Participation references a missing admission or workspace member",
        });
      const admission = yield* Schema.decodeEffect(Schema.toType(GroupMembership.Record))(
        foundAdmission.value,
      ).pipe(Effect.mapError(invalidReadRecord));
      const member = yield* Schema.decodeEffect(Member.Record)(foundMember.value).pipe(
        Effect.mapError(invalidReadRecord),
      );
      if (
        admission.id !== participant.groupMembershipId ||
        admission.workspaceId !== workspaceId ||
        admission.groupId !== thread.groupId ||
        admission.memberId !== participant.memberId ||
        member.workspaceId !== workspaceId ||
        member.id !== participant.memberId ||
        !sameIdentity(member.identity, participant.identity)
      )
        return yield* new InvalidResponse({
          message: "Participation references another admission, group, member, or workspace",
        });
      if (admission.status !== "active" || member.status !== "active") continue;
      current.push({
        id: participant.id,
        workspaceId,
        threadId: thread.id,
        memberId: participant.memberId,
        joinedAt: participant.joinedAt,
        joinedAtSequence: participant.joinedAtSequence,
      });
    }
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
/** Provide opening-message workflows and authorized reads; further publication and execution are separate workflows. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadApplication from "./application.ts";
