import { Context, DateTime, Effect, Layer } from "effect";
import * as Store from "../journal/store.ts";
import * as NotificationStore from "../notification/store.ts";
import type * as Thread from "../thread/Thread.ts";
import type * as ReadState from "./read-state.ts";
import * as ReadStateStore from "./store.ts";

export type Error =
  | NotificationStore.Failure
  | NotificationStore.Conflict
  | ReadStateStore.Failure
  | ReadStateStore.Conflict;
export class ReadStateCommand extends Context.Service<
  ReadStateCommand,
  {
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
>()("@amends-dev/core/read-state/command/Service") {}

/** @category constructors */
export const make = Effect.fn("ReadStateCommand.make")(function* () {
  const notificationStore = yield* NotificationStore.NotificationStore;
  const readStateStore = yield* ReadStateStore.ReadStateStore;
  const { workspaceId } = yield* Store.Store;

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

  return ReadStateCommand.of({ markThreadRead });
});
/** Internal write shared by read-state, thread, and message operations. @category layers */
export const layer = Layer.effect(ReadStateCommand, make());
