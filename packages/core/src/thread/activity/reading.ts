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
export type Error =
  | ThreadAccess.Error
  | Authorization.Error
  | ThreadActivityStore.Failure
  | ThreadActivityResolvers.Failure
  | NotFound;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  readonly get: (
    activityId: ThreadActivity.Id,
  ) => Effect.Effect<Thread.TimelineItem, Error, Actor.Service>;
  readonly page: (
    threadId: Thread.Id,
    options: ThreadActivityStore.ReadOptions,
  ) => Effect.Effect<ReadonlyArray<Thread.TimelineItem>, Exclude<Error, NotFound>, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/activity/reading/Service",
) {}
/** @category constructors */
export const make = Effect.fn("ThreadActivityReading.make")(function* () {
  const authorization = yield* Authorization.Service;
  const access = yield* ThreadAccess.Service;
  const resolvers = yield* ThreadActivityResolvers.Service;
  const activities = yield* ThreadActivityStore.Service;
  const workspaceId = authorization.workspaceId;
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
    return yield* resolvers.resolve(thread, yield* activities.readPage(thread.id, request));
  });
  const get = Effect.fn("ThreadActivityReading.get")(function* (activityId: ThreadActivity.Id) {
    const id = yield* Schema.decodeEffect(ThreadActivity.Id)(activityId);
    yield* authorization.require([]);
    const found = yield* activities.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ activityId: id });
    const thread = yield* authorize(found.value.threadId);
    const [item] = yield* resolvers.resolve(thread, [found.value]);
    if (item === undefined) return yield* Effect.die("An activity resolved to no timeline item");
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
