import { Context, Effect, Layer, Option, Schema } from "effect";
import type { DateTime } from "effect";
import { Journal } from "../../journal/journal.ts";
import { Publication } from "../../journal/publication.ts";
import { Store } from "../../journal/store.ts";
import { Thread } from "../thread.ts";
import { ThreadStore } from "../store.ts";
import { ThreadActivityPublisher } from "../activity/publisher.ts";
import { ThreadParticipationActivity } from "./activity.ts";
import { ThreadParticipation } from "./participation.ts";
import { ThreadParticipationStore } from "./store.ts";
import { ThreadParticipationFacts } from "./facts.ts";

export class InvalidReference extends Schema.TaggedError<InvalidReference>()(
  "ThreadParticipationDeparture.InvalidReference",
  { message: Schema.String },
) {}
export type Error =
  | ThreadActivityPublisher.Error
  | ThreadParticipationStore.Failure
  | InvalidReference;
export interface Interface {
  readonly workspaceId: ThreadParticipation.Record["workspaceId"];
  /**
   * End one active participation because its member unfollowed the thread, with a quiet ending
   * in its timeline. Leaving or being removed from the group ends participations with the
   * departure instead, all together and without thread activity.
   */
  readonly end: (
    departure: ThreadParticipation.Departure,
    occurredAt: DateTime.Utc,
  ) => Effect.Effect<void, Error, Store.Transaction | Publication.Service>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/participation/departure/Service",
) {}
export const make = Effect.fn("ThreadParticipationDeparture.make")(function* () {
  const participations = yield* ThreadParticipationStore.Service;
  const threads = yield* ThreadStore.Service;
  const publisher = yield* ThreadActivityPublisher.Service;
  const journal = yield* Journal.Service;
  const workspaceId = participations.workspaceId;
  if (threads.workspaceId !== workspaceId || publisher.workspaceId !== workspaceId)
    return yield* new InvalidReference({
      message: "Departure services belong to different workspaces",
    });
  const invalid = (cause: Schema.SchemaError) =>
    new InvalidReference({ message: `Invalid departure reference: ${cause.message}` });
  const threadOf = Effect.fnUntraced(function* (participant: ThreadParticipation.Record) {
    const found = yield* threads.get(participant.threadId);
    if (Option.isNone(found))
      return yield* new InvalidReference({ message: "Participation thread is missing" });
    const thread = yield* Schema.decodeEffect(Schema.toType(Thread.Record))(found.value).pipe(
      Effect.mapError(invalid),
    );
    if (thread.id !== participant.threadId || thread.workspaceId !== workspaceId)
      return yield* new InvalidReference({ message: "Participation belongs to another thread" });
    return thread;
  });
  const end = Effect.fn("ThreadParticipationDeparture.end")(function* (
    input: ThreadParticipation.Departure,
    occurredAt: DateTime.Utc,
  ) {
    const reason: ThreadParticipation.EndReason = "unfollowed";
    yield* Store.Transaction;
    const departure = yield* Schema.decodeEffect(ThreadParticipation.Departure)(input);
    const found = yield* participations.get(departure.participationId);
    if (Option.isNone(found))
      return yield* new InvalidReference({ message: "Departure participation is missing" });
    const participant = yield* Schema.decodeEffect(Schema.toType(ThreadParticipation.Record))(
      found.value,
    ).pipe(Effect.mapError(invalid));
    if (
      departure.workspaceId !== workspaceId ||
      participant.workspaceId !== workspaceId ||
      participant.id !== departure.participationId ||
      participant.threadId !== departure.threadId ||
      participant.status !== "active"
    )
      return yield* new InvalidReference({
        message: "Departure participation is inconsistent or already ended",
      });
    const thread = yield* threadOf(participant);
    yield* publisher.publish({
      thread,
      occurredAt,
      step: () =>
        Effect.map(
          journal
            .publish(ThreadParticipationFacts.Ended, {
              ...departure,
              groupId: thread.groupId,
              reason,
            })
            .pipe(Publication.withOccurredAt(occurredAt)),
          (ended) => ({
            value: undefined,
            kind: ThreadParticipationActivity.Ended,
            details: { participationId: participant.id, reason },
            recipients: [],
            cause: ended,
          }),
        ),
    });
  });
  return Service.of({ workspaceId, end });
});
export const layer = Layer.effect(Service, make());
export * as ThreadParticipationDeparture from "./departure.ts";
