import { Context, Effect, Layer, Option, Schema } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { GroupAudience } from "../group/audience.ts";
import type { GroupMembershipStore } from "../group/membership/store.ts";
import type { Actor } from "../identity/actor.ts";
import { Thread } from "./thread.ts";
import { ThreadStore } from "./store.ts";

export class NotFound extends Schema.TaggedError<NotFound>()("ThreadAccess.NotFound", {
  threadId: Thread.Id,
}) {}
export type Error =
  | Authorization.Error
  | GroupAudience.InvalidResponse
  | GroupMembershipStore.Failure
  | ThreadStore.Failure
  | Schema.SchemaError
  | NotFound;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /** Audience only. Applications check their action permission separately, inside the commit for writes. */
  readonly require: (threadId: Thread.Id) => Effect.Effect<Thread.Record, Error, Actor.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/access/Service",
) {}
export const make = Effect.fn("ThreadAccess.make")(function* () {
  const authorization = yield* Authorization.Service;
  const audience = yield* GroupAudience.Service;
  const threads = yield* ThreadStore.Service;
  const workspaceId = authorization.workspaceId;
  const requireAccess = Effect.fn("ThreadAccess.require")(function* (threadId: Thread.Id) {
    const id = yield* Schema.decodeEffect(Thread.Id)(threadId);
    yield* authorization.require([]);
    const found = yield* threads.get(id);
    if (Option.isNone(found)) return yield* new NotFound({ threadId: id });
    const thread = found.value;
    yield* audience
      .require(thread.groupId)
      .pipe(
        Effect.catchTag("GroupAudience.NotMember", () =>
          Effect.fail(new NotFound({ threadId: id })),
        ),
      );
    return thread;
  });
  return Service.of({ workspaceId, require: requireAccess });
});
export const layer = Layer.effect(Service, make());
export * as ThreadAccess from "./access.ts";
