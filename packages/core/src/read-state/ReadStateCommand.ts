/**
 * The write to read state that operations share: marking a thread read through a position, which
 * marks the reader's pending notifications from it seen and advances their read position.
 * `ReadStateService` uses it, and so do `ThreadService` and `ThreadMessageService`, so that an
 * author has read what they posted. It joins the caller's transaction when there is one, and the
 * caller owns authorization.
 *
 * @since 0.1.0
 */
import { Context, DateTime, Effect, Layer } from "effect";
import * as Store from "../journal/Store.ts";
import * as NotificationStore from "../notification/NotificationStore.ts";
import type * as Thread from "../thread/Thread.ts";
import type * as ReadState from "./ReadState.ts";
import * as ReadStateStore from "./ReadStateStore.ts";

/**
 * What the write can fail with: the notification and read-state stores' failures and conflicts.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | NotificationStore.Failure
  | NotificationStore.Conflict
  | ReadStateStore.Failure
  | ReadStateStore.Conflict;

/**
 * The write to read state that read-state, thread, and message operations share.
 *
 * @category services
 * @since 0.1.0
 */
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
      thread: Thread.Thread,
      throughSequence: number,
    ) => Effect.Effect<void, Error>;
  }
>()("@amends-dev/core/read-state/ReadStateCommand") {}

/**
 * Builds the shared write over the notification and read-state stores.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("ReadStateCommand.make")(function* () {
  const notificationStore = yield* NotificationStore.NotificationStore;
  const readStateStore = yield* ReadStateStore.ReadStateStore;
  const { workspaceId } = yield* Store.Store;

  const markThreadRead = Effect.fn("ReadStateCommand.markThreadRead")(function* (
    reader: ReadState.Reader,
    thread: Thread.Thread,
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

/**
 * Provide the write that read-state, thread, and message operations share.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ReadStateCommand, make());
