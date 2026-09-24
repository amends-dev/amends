import { Context, DateTime, Effect, Layer, Schema } from "effect";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import type { Thread } from "../thread/thread.ts";
import { ReadStateStore } from "./store.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadReading.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | NotificationStore.Failure
  | NotificationStore.Conflict
  | ReadStateStore.Failure
  | ReadStateStore.Conflict
  | Schema.SchemaError
  | InvalidResponse;
/** The human whose reading this is, as their notifications address them. */
export type Reader = Extract<Notification.Recipient, { readonly _tag: "Human" }>;
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /** The reader's pending notifications from a thread's activity up to a position, validated. */
  readonly pending: (
    reader: Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Error>;
  /**
   * Internal step of an authorized workflow: record the reader's pending notifications from the
   * thread up to the position as seen, and advance their read position. Both are private state,
   * written outside the journal; they join the caller's transaction when there is one, as when
   * posting reads the thread for its author. Marking a thread read and posting both use it.
   */
  readonly markRead: (
    reader: Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) => Effect.Effect<void, Error>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/attention/reading/Service",
) {}

const sameRecipient = Schema.toEquivalence(Notification.Recipient);

/** @category constructors */
export const make = Effect.fn("ThreadReading.make")(function* () {
  const notifications = yield* NotificationStore.Service;
  const readStates = yield* ReadStateStore.Service;
  const workspaceId = notifications.workspaceId;
  if (readStates.workspaceId !== workspaceId)
    return yield* new InvalidResponse({
      message: "Reading services belong to different workspaces",
    });
  const pending = Effect.fn("ThreadReading.pending")(function* (
    reader: Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) {
    const result: Array<Notification.Record> = [];
    for (const row of yield* notifications.listPendingByThread(
      reader,
      thread.id,
      throughSequence,
    )) {
      const note = yield* Schema.decodeEffect(Schema.toType(Notification.Record))(row).pipe(
        Effect.mapError(
          (cause) => new InvalidResponse({ message: `Invalid notification: ${cause.message}` }),
        ),
      );
      if (
        note.workspaceId !== workspaceId ||
        !sameRecipient(note.recipient, reader) ||
        note.thread === undefined ||
        note.thread.threadId !== thread.id ||
        note.thread.sequence > throughSequence ||
        note.state._tag !== "Pending"
      )
        return yield* new InvalidResponse({
          message: "Notification store returned another recipient, thread, or state",
        });
      result.push(note);
    }
    return result;
  });
  const markRead = Effect.fn("ThreadReading.markRead")(function* (
    reader: Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) {
    const settled = yield* pending(reader, thread, throughSequence);
    if (settled.length > 0)
      yield* notifications.markSeen(
        settled.map((note) => note.id),
        yield* DateTime.now,
      );
    yield* readStates.advanceThread({
      workspaceId,
      memberId: reader.memberId,
      threadId: thread.id,
      readThrough: throughSequence,
    });
  });
  return Service.of({ workspaceId, pending, markRead });
});
/** Internal service: callers own authorization and the commit. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadReading from "./reading.ts";
