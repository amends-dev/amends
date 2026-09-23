import { Context, Effect, Layer, Schema } from "effect";
import type { PlatformError } from "effect";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import type { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationAcknowledgment } from "../notification/acknowledgment.ts";
import { NotificationStore } from "../notification/store.ts";
import type { Thread } from "../thread/thread.ts";
import type { MemberId } from "../workspace/member/id.ts";
import { ReadStateStore } from "./store.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "ThreadReading.InvalidResponse",
  { message: Schema.String },
) {}
export type Error =
  | NotificationStore.Failure
  | NotificationAcknowledgment.Error
  | ReadStateStore.Failure
  | ReadStateStore.Conflict
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | InvalidResponse;
export interface Reader {
  readonly memberId: MemberId.Id;
  readonly recipient: Extract<Notification.Recipient, { readonly _tag: "Human" }>;
}
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /** The reader's pending notifications from a thread's activity up to a position, validated. */
  readonly pending: (
    reader: Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) => Effect.Effect<ReadonlyArray<Notification.Record>, Error>;
  /**
   * Internal step of an authorized workflow: acknowledge the reader's pending notifications from
   * the thread up to the position as seen, and advance their read position, in the caller's
   * commit. Posting and marking a thread read both use it.
   */
  readonly markRead: (
    reader: Reader,
    thread: Thread.Record,
    throughSequence: number,
  ) => Effect.Effect<void, Error, Store.Transaction | Publication.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/attention/reading/Service",
) {}

/** @category constructors */
export const make = Effect.fn("ThreadReading.make")(function* () {
  const notifications = yield* NotificationStore.Service;
  const acknowledgment = yield* NotificationAcknowledgment.Service;
  const readStates = yield* ReadStateStore.Service;
  const workspaceId = notifications.workspaceId;
  if (acknowledgment.workspaceId !== workspaceId || readStates.workspaceId !== workspaceId)
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
      reader.recipient,
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
        note.recipient._tag !== "Human" ||
        note.recipient.id !== reader.recipient.id ||
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
    yield* Store.Transaction;
    for (const note of yield* pending(reader, thread, throughSequence))
      yield* acknowledgment.record(note.id, { _tag: "Seen" });
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
