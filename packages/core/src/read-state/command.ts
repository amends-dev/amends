import { Context, DateTime, Effect, Layer } from "effect";
import { Store } from "../journal/store.ts";
import { NotificationStore } from "../notification/store.ts";
import type { Thread } from "../thread/Thread.ts";
import type { ReadState } from "./read-state.ts";
import { ReadStateStore } from "./store.ts";

export type Error =
  | NotificationStore.Failure
  | NotificationStore.Conflict
  | ReadStateStore.Failure
  | ReadStateStore.Conflict;
export interface Interface {
  /**
   * Record that a person has read a thread through a position: their pending notifications from
   * its activity up to there are seen, and their read position advances. Both are private state,
   * written outside the journal; they join the caller's transaction when there is one, as when
   * posting reads the thread for its author. The caller owns authorization.
   */
  readonly markThreadRead: (
    reader: ReadState.Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) => Effect.Effect<void, Error>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/read-state/command/Service",
) {}

/** @category constructors */
export const make = Effect.fn("ReadStateCommand.make")(function* () {
  const notificationStore = yield* NotificationStore.Service;
  const readStateStore = yield* ReadStateStore.Service;
  const { workspaceId } = yield* Store.Service;

  const markThreadRead = Effect.fn("ReadStateCommand.markThreadRead")(function* (
    reader: ReadState.Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) {
    const seen = yield* notificationStore.listPendingByThread(reader, thread.id, throughSequence);
    if (seen.length > 0)
      yield* notificationStore.markSeen(
        seen.map((notification) => notification.id),
        yield* DateTime.now,
      );
    yield* readStateStore.advanceThread({
      workspaceId,
      memberId: reader.memberId,
      threadId: thread.id,
      readThrough: throughSequence,
    });
  });

  return Service.of({ markThreadRead });
});
/** Internal write shared by read-state, thread, and message operations. @category layers */
export const layer = Layer.effect(Service, make());
export * as ReadStateCommand from "./command.ts";
