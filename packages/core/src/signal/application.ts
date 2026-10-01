import { Context, DateTime, Duration, Effect, Layer } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Actor } from "../identity/actor.ts";
import { ThreadAccess } from "../thread/access.ts";
import { ThreadMessagePermissions } from "../thread/message/permissions.ts";
import { Thread } from "../thread/thread.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { Signal } from "./signal.ts";
import { Signals } from "./signals.ts";
import { ThreadNotFound } from "./errors.ts";
export { ThreadNotFound } from "./errors.ts";

export type Error =
  | Authorization.Error
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound>
  | ThreadNotFound;

export interface Interface {
  readonly workspaceId: WorkspaceId.Id;
  /**
   * Tell the thread's readers that the acting member is composing a message there, for the next
   * few seconds. Requires current group access and `thread.publish`, as posting does. Repeats
   * from the same member in the same thread within a moment are dropped, so a client may send it
   * whenever the member types.
   */
  readonly typing: (threadId: Thread.Id) => Effect.Effect<void, Error, Actor.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/signal/application/Service",
) {}

/** How long readers show a typing indicator without a repeat. */
export const typingFor = Duration.seconds(6);
/** Repeats closer than this are dropped. */
const typingEvery = Duration.seconds(2);

/** Capture the workspace's signals and thread access; authorize each signal as its actor. @category constructors */
export const make = Effect.fn("SignalApplication.make")(function* () {
  const authorization = yield* Authorization.Service;
  const access = yield* ThreadAccess.Service;
  const signals = yield* Signals.Service;
  const workspaceId = authorization.workspaceId;
  /** When each member last signalled typing in each thread, in this process. */
  const lastTyping = new Map<string, number>();

  const typing = Effect.fn("SignalApplication.typing")(function* (threadId: Thread.Id) {
    const thread = yield* access
      .require(threadId)
      .pipe(
        Effect.catchTag("ThreadAccess.NotFound", (error) =>
          Effect.fail(new ThreadNotFound({ threadId: error.threadId })),
        ),
      );
    yield* authorization.require([
      Requirement.make(ThreadMessagePermissions.Publish, {
        _tag: "Thread",
        workspaceId,
        threadId: thread.id,
      }),
    ]);
    const actor = yield* Actor.Service;
    const now = yield* DateTime.now;
    const at = DateTime.toEpochMillis(now);
    const key = JSON.stringify([actor.memberId, thread.id]);
    const last = lastTyping.get(key);
    if (last !== undefined && at - last < Duration.toMillis(typingEvery)) return;
    // Forget old entries so the map follows only recent typists.
    if (lastTyping.size > 1024)
      for (const [entry, time] of lastTyping)
        if (at - time >= Duration.toMillis(typingFor)) lastTyping.delete(entry);
    lastTyping.set(key, at);
    yield* signals.publish(
      Signal.Value.cases.Typing.make({
        workspaceId,
        groupId: thread.groupId,
        threadId: thread.id,
        memberId: actor.memberId,
        until: DateTime.add(now, { milliseconds: Duration.toMillis(typingFor) }),
      }),
    );
  });
  return Service.of({ workspaceId, typing });
});

/** Provide signal operations over the workspace's services. @category layers */
export const layer = Layer.effect(Service, make());

export * as SignalApplication from "./application.ts";
