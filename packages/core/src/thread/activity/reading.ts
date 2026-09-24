import { Context, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../../authorization/authorization.ts";
import { Requirement } from "../../authorization/requirement.ts";
import type { Actor } from "../../identity/actor.ts";
import { Thread } from "../thread.ts";
import { ThreadAccess } from "../access.ts";
import { ThreadPermissions } from "../permissions.ts";
import { ThreadActivity } from "./activity.ts";
import { ThreadActivityResolvers } from "./resolvers.ts";
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
  | ThreadActivityStore.Failure
  | ThreadActivityResolvers.Failure
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
const invalidRecord = (cause: Schema.SchemaError) =>
  new InvalidResponse({ message: `Thread storage returned invalid data: ${cause.message}` });
/** @category constructors */
export const make = Effect.fn("ThreadActivityReading.make")(function* () {
  const authorization = yield* Authorization.Service;
  const access = yield* ThreadAccess.Service;
  const resolvers = yield* ThreadActivityResolvers.Service;
  const activities = yield* ThreadActivityStore.Service;
  const workspaceId = authorization.workspaceId;
  if (
    [access.workspaceId, resolvers.workspaceId, activities.workspaceId].some(
      (id) => id !== workspaceId,
    )
  )
    return yield* new InvalidResponse({
      message: "Activity reading services belong to different workspaces",
    });
  /** Resolve through each kind's resolver, reporting what it finds wrong as this reader's own. */
  const resolve = (thread: Thread.Record, listed: ReadonlyArray<ThreadActivity.Record>) =>
    resolvers.resolve(thread, listed).pipe(
      Effect.catchTags({
        "ThreadActivityResolvers.InvalidResponse": (error) =>
          Effect.fail(new InvalidResponse({ message: error.message })),
        "ThreadActivityResolvers.Unknown": (error) =>
          Effect.fail(
            new InvalidResponse({ message: `No resolver for activity kind ${error.kind}` }),
          ),
      }),
    );
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
    const occurrences = new Set<string>();
    const listed: Array<ThreadActivity.Record> = [];
    for (const row of found) {
      const activity = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(row).pipe(
        Effect.mapError(invalidRecord),
      );
      if (
        activity.workspaceId !== workspaceId ||
        activity.threadId !== thread.id ||
        activity.sequence <= afterSequence ||
        (request.beforeSequence !== undefined && activity.sequence >= request.beforeSequence) ||
        seen.has(activity.id)
      )
        return yield* new InvalidResponse({
          message: "Timeline store returned inconsistent references or order",
        });
      afterSequence = activity.sequence;
      seen.add(activity.id);
      if (activity.occurrence !== null) {
        if (occurrences.has(activity.occurrence))
          return yield* new InvalidResponse({ message: "Duplicate activity occurrence" });
        occurrences.add(activity.occurrence);
      }
      listed.push(activity);
    }
    return yield* resolve(thread, listed);
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
    const [item] = yield* resolve(thread, [activity]);
    if (item === undefined)
      return yield* new InvalidResponse({ message: "Activity resolved to no timeline item" });
    return item;
  });
  return Service.of({ workspaceId, get, page });
});
/**
 * Internal authorized reader shared by timeline and notification-source operations.
 * @category layers
 */
export const layer = Layer.effect(Service, make());
export * as ThreadActivityReading from "./reading.ts";
