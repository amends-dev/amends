import { Context, DateTime, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import type { Actor } from "../../identity/actor.ts";
import { Thread } from "../thread.ts";
import { ThreadAccess } from "../access.ts";
import { ThreadPermissions } from "../permissions.ts";
import { ThreadMessage } from "../message/message.ts";
import { ThreadMessageStore } from "../message/store.ts";
import { ThreadParticipation } from "../participation/participation.ts";
import { ThreadParticipationStore } from "../participation/store.ts";
import { ThreadActivity } from "./activity.ts";
import { ThreadActivityStore } from "./store.ts";

export class NotFound extends Schema.TaggedError<NotFound>()("ThreadActivityReading.NotFound", {
  activityId: ThreadActivity.Id,
}) {}
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadActivityReading.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | ThreadAccess.Error
  | Authorization.Error
  | ThreadMessageStore.Failure
  | ThreadParticipationStore.Failure
  | ThreadActivityStore.Failure
  | NotFound
  | InvalidResponse;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  readonly get: (
    activityId: ThreadActivity.Id,
  ) => Effect.Effect<Thread.TimelineItem, Error, Actor.Service>;
  readonly page: (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/activity/reading/Service",
) {}
/** Records a set of activities reference, by ID. */
interface Subjects {
  readonly messages: ReadonlyMap<ThreadMessage.Id, ThreadMessage.Record>;
  readonly participations: ReadonlyMap<ThreadParticipation.Id, ThreadParticipation.Record>;
}
const invalidRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Thread storage returned invalid data: ${cause.message}` });
/** @category constructors */
export const make = Effect.fn("ThreadActivityReading.make")(function* () {
  const authorization = yield* Authorization.Service;
  const access = yield* ThreadAccess.Service;
  const messages = yield* ThreadMessageStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const activities = yield* ThreadActivityStore.Service;
  const workspaceId = authorization.workspaceId;
  if (
    [
      access.workspaceId,
      messages.workspaceId,
      participations.workspaceId,
      activities.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({
      message: "Activity reading services belong to different workspaces",
    });
  const authorize = Effect.fn("ThreadActivityReading.authorize")(function* (threadId: Thread.Id) {
    const thread = yield* access.require(threadId);
    yield* authorization.require([
      Requirement.make(ThreadPermissions.Read, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    return thread;
  });
  /** Load the messages and participations these activities reference, one read for each kind. */
  const loadSubjects = Effect.fnUntraced(function* (
    listed: ReadonlyArray<ThreadActivity.Record>,
  ): Effect.fn.Return<Subjects, Error> {
    const messageIds = new Set<ThreadMessage.Id>();
    const participationIds = new Set<ThreadParticipation.Id>();
    for (const activity of listed)
      if (activity.kind === "MessagePublished") messageIds.add(activity.messageId);
      else participationIds.add(activity.participationId);
    const foundMessages = new Map<ThreadMessage.Id, ThreadMessage.Record>();
    for (const row of yield* messages.getMany([...messageIds])) {
      const message = yield* Schema.decodeEffect(Schema.toType(ThreadMessage.Record))(row).pipe(
        Effect.mapError(invalidRecord),
      );
      if (!messageIds.has(message.id) || foundMessages.has(message.id))
        return yield* new InvalidResponse({
          message: "Message store returned another message, thread, or workspace",
        });
      foundMessages.set(message.id, message);
    }
    const foundParticipations = new Map<ThreadParticipation.Id, ThreadParticipation.Record>();
    for (const row of yield* participations.getMany([...participationIds])) {
      const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
        row,
      ).pipe(Effect.mapError(invalidRecord));
      if (!participationIds.has(participant.id) || foundParticipations.has(participant.id))
        return yield* new InvalidResponse({
          message: "Participation store returned another participation",
        });
      foundParticipations.set(participant.id, participant);
    }
    return { messages: foundMessages, participations: foundParticipations };
  });
  const resolve = Effect.fn("ThreadActivityReading.resolve")(function* (
    thread: Thread.Record,
    activity: ThreadActivity.Record,
    subjects: Subjects,
  ): Effect.fn.Return<Thread.TimelineItem, Error> {
    if (activity.kind !== "MessagePublished") {
      const participant = subjects.participations.get(activity.participationId);
      if (participant === undefined)
        return yield* new InvalidResponse({
          message: "Participation activity references missing participation",
        });
      if (
        participant.workspaceId !== workspaceId ||
        participant.threadId !== thread.id ||
        participant.id !== activity.participationId ||
        (activity.kind === "ParticipationFollowed"
          ? participant.joinedAtSequence !== activity.sequence
          : participant.joinedAtSequence >= activity.sequence ||
            participant.status !== "ended" ||
            participant.endedAt === null ||
            DateTime.formatIso(participant.endedAt) !== DateTime.formatIso(activity.occurredAt))
      )
        return yield* new InvalidResponse({
          message: "Participation activity references inconsistent participation",
        });
      return { activity, participant: ThreadParticipation.toSummary(participant) };
    }
    const message = subjects.messages.get(activity.messageId);
    if (message === undefined)
      return yield* new InvalidResponse({
        message: "Timeline activity references a missing message",
      });
    if (
      message.workspaceId !== workspaceId ||
      message.threadId !== thread.id ||
      message.id !== activity.messageId
    )
      return yield* new InvalidResponse({
        message: "Message store returned another message, thread, or workspace",
      });
    return { activity, message };
  });
  const page = Effect.fn("ThreadActivityReading.page")(function* (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) {
    const request = yield* Schema.decodeEffect(ThreadActivityStore.ReadOptions)(options);
    const thread = yield* authorize(threadId);
    const found = yield* activities.readPage(thread.id, request);
    if (found.length > request.limit)
      return yield* new InvalidResponse({ message: "Timeline exceeds the requested page size" });
    let afterSequence = request.afterSequence ?? 0;
    const seen = new Set<ThreadActivity.Id>();
    const seenMessages = new Set<ThreadMessage.Id>();
    const seenParticipationActivity = new Set<string>();
    const listed: Array<ThreadActivity.Record> = [];
    for (const row of found) {
      const activity = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(row).pipe(
        Effect.mapError(invalidRecord),
      );
      if (
        activity.workspaceId !== workspaceId ||
        activity.threadId !== thread.id ||
        activity.sequence <= afterSequence ||
        seen.has(activity.id)
      )
        return yield* new InvalidResponse({
          message: "Timeline store returned inconsistent references or order",
        });
      afterSequence = activity.sequence;
      seen.add(activity.id);
      if (activity.kind !== "MessagePublished") {
        const occurrence = `${activity.kind}:${activity.participationId}`;
        if (seenParticipationActivity.has(occurrence))
          return yield* new InvalidResponse({ message: "Duplicate participation activity" });
        seenParticipationActivity.add(occurrence);
      } else {
        if (seenMessages.has(activity.messageId))
          return yield* new InvalidResponse({ message: "Duplicate message activity" });
        seenMessages.add(activity.messageId);
      }
      listed.push(activity);
    }
    const subjects = yield* loadSubjects(listed);
    return yield* Effect.forEach(listed, (activity) => resolve(thread, activity, subjects));
  });
  const get = Effect.fn("ThreadActivityReading.get")(function* (activityId: ThreadActivity.Id) {
    const id = yield* Schema.decodeEffect(ThreadActivity.Id)(activityId);
    yield* authorization.require([]);
    const found = yield* activities.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ activityId: id });
    const activity = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(
      found.value,
    ).pipe(Effect.mapError(invalidRecord));
    if (activity.id !== id || activity.workspaceId !== workspaceId)
      return yield* new InvalidResponse({
        message: "Activity store returned another activity or workspace",
      });
    const thread = yield* authorize(activity.threadId);
    return yield* resolve(thread, activity, yield* loadSubjects([activity]));
  });
  return Service.of({ workspaceId, get, page });
});
/**
 * Internal authorized reader shared by timeline and notification-source operations.
 * @category layers
 */
export const layer = Layer.effect(Service, make());
export * as ThreadActivityReading from "./reading.ts";
