import { Context, Crypto, Effect, Layer, Option } from "effect";
import type { PlatformError, Schema } from "effect";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import type { Event } from "../../journal/event.ts";
import type { Log } from "../../journal/log.ts";
import type { Projection } from "../../journal/projection.ts";
import { Store } from "../../journal/store.ts";
import type { ThreadId } from "../id.ts";
import type { Thread } from "../thread.ts";
import { ThreadActivity } from "./activity.ts";
import { ThreadActivityKind } from "./kind.ts";
import { ThreadActivityStore } from "./store.ts";
import { ThreadActivityFacts } from "./facts.ts";

/** An activity of one kind, at a position of its thread, with the recipients it selects. */
export interface Input<K extends ThreadActivityKind.Definition> {
  readonly thread: Thread.Record;
  readonly sequence: number;
  readonly occurredAt: ThreadActivity.Record["occurredAt"];
  readonly kind: K;
  readonly details: K["details"]["Type"];
  readonly recipients: ReadonlyArray<ThreadActivity.Recipient>;
}
export type Error =
  | ThreadActivityStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error;
export interface Interface {
  /** The position the thread's next activity takes, read in the caller's transaction. */
  readonly nextSequence: (threadId: ThreadId.Id) => Effect.Effect<number, Error, Store.Transaction>;
  readonly record: <K extends ThreadActivityKind.Definition>(
    input: Input<K>,
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
  const activities = yield* ThreadActivityStore.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;
  const nextSequence = Effect.fn("ThreadActivityRecording.nextSequence")(function* (
    threadId: ThreadId.Id,
  ) {
    yield* Store.Transaction;
    const latest = yield* activities.latest(threadId);
    return Option.isNone(latest) ? 1 : latest.value.sequence + 1;
  });
  const record = Effect.fn("ThreadActivityRecording.record")(function* <
    K extends ThreadActivityKind.Definition,
  >(input: Input<K>) {
    yield* Store.Transaction;
    const activity: ThreadActivity.Record = {
      ...(yield* ThreadActivityKind.prepare(input.kind, input.details)),
      id: ThreadActivity.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      threadId: input.thread.id,
      sequence: input.sequence,
      occurredAt: input.occurredAt,
    };
    return yield* journal
      .publish(ThreadActivityFacts.Recorded, {
        groupId: input.thread.groupId,
        activity,
        recipients: input.recipients,
      })
      .pipe(Publication.withOccurredAt(input.occurredAt));
  });
  return Service.of({ nextSequence, record });
});
export const layer = Layer.effect(Service, make());
export * as ThreadActivityRecording from "./recording.ts";
