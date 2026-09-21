import { Context, Crypto, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";
import type { Event } from "../../journal/event.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { ThreadId } from "../id.ts";
import { Thread } from "../thread.ts";
import { ThreadStore } from "../store.ts";
import { ThreadActivity } from "./activity.ts";
import { ThreadActivityStore } from "./store.ts";
import { ThreadActivityFacts } from "./facts.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "ThreadActivityRecording.InvalidReference",
  { message: Schema.String },
) {}
export const Input = Schema.Struct({
  threadId: ThreadId.Id,
  sequence: ThreadActivity.Common.fields.sequence,
  occurredAt: ThreadActivity.Common.fields.occurredAt,
  subject: ThreadActivity.Subject,
  recipients: ThreadActivityFacts.Recorded.payload.fields.recipients,
});
export interface Input extends Schema.Schema.Type<typeof Input> {}
export type Error =
  | ThreadStore.Failure
  | ThreadActivityStore.Failure
  | InvalidReference
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  readonly workspaceId: ThreadActivity.Record["workspaceId"];
  /** The caller must stay in this transaction until recording; record rechecks the position. */
  readonly nextSequence: (threadId: ThreadId.Id) => Effect.Effect<number, Error, Store.Transaction>;
  readonly record: (
    input: Input,
  ) => Effect.Effect<
    Event.Type<typeof ThreadActivityFacts.Recorded>,
    Error,
    Store.Transaction | Publication.Service
  >;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/activity/recording/Service",
) {}
export const make = Effect.fn("ThreadActivityRecording.make")(function* () {
  const threads = yield* ThreadStore.Service;
  const activities = yield* ThreadActivityStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = threads.workspaceId;
  if (activities.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Activity services belong to different workspaces",
    });
  const invalid = (cause: Schema.SchemaError) =>
    new InvalidReference({ message: `Invalid activity reference: ${cause.message}` });
  const nextSequence = Effect.fn("ThreadActivityRecording.nextSequence")(function* (
    threadId: ThreadId.Id,
  ) {
    yield* Store.Transaction;
    const id = yield* Schema.decodeEffect(ThreadId.Id)(threadId);
    const found = yield* threads.get(id);
    if (Option.isNone(found)) return yield* new InvalidReference({ message: "Thread is missing" });
    const thread = yield* Schema.decodeEffect(Schema.toType(Thread.Record))(found.value).pipe(
      Effect.mapError(invalid),
    );
    if (thread.id !== id || thread.workspaceId !== workspaceId)
      return yield* new InvalidReference({ message: "Thread belongs to another workspace or ID" });
    const latest = yield* activities.latest(id);
    if (Option.isNone(latest)) return 1;
    const record = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))(
      latest.value,
    ).pipe(Effect.mapError(invalid));
    if (
      record.threadId !== id ||
      record.workspaceId !== workspaceId ||
      !Number.isSafeInteger(record.sequence + 1)
    )
      return yield* new InvalidReference({
        message: "Latest activity is inconsistent or sequence is exhausted",
      });
    return record.sequence + 1;
  });
  const record = Effect.fn("ThreadActivityRecording.record")(function* (input: Input) {
    yield* Store.Transaction;
    const request = yield* Schema.decodeEffect(Schema.toType(Input))(input);
    if (request.sequence !== (yield* nextSequence(request.threadId)))
      return yield* new InvalidReference({ message: "Activity position changed before recording" });
    const activity = yield* Schema.decodeEffect(Schema.toType(ThreadActivity.Record))({
      ...request.subject,
      id: ThreadActivity.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      threadId: request.threadId,
      sequence: request.sequence,
      occurredAt: request.occurredAt,
    });
    return yield* journal
      .publish(ThreadActivityFacts.Recorded, { activity, recipients: request.recipients })
      .pipe(Publication.withOccurredAt(request.occurredAt));
  });
  return Service.of({ workspaceId, nextSequence, record });
});
export const layer = Layer.effect(Service, make());
export * as ThreadActivityRecording from "./recording.ts";
