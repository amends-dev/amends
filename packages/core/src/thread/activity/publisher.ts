import { Context, Effect, Layer, Schema } from "effect";
import type { DateTime } from "effect";
import type { Event } from "../../journal/event.ts";
import { Publication } from "../../journal/publication.ts";
import type { Store } from "../../journal/store.ts";
import type { Thread } from "../thread.ts";
import { ThreadParticipationAdmission } from "../participation/admission.ts";
import type { ThreadParticipation } from "../participation/participation.ts";
import type { ThreadActivity } from "./activity.ts";
import type { ThreadActivityFacts } from "./facts.ts";
import type { ThreadActivityKind } from "./kind.ts";
import { ThreadActivityRecording } from "./recording.ts";

/** The thread's next position is not the one the caller accounted for. */
export class PositionChanged extends Schema.TaggedError<PositionChanged>()(
  "ThreadActivityPublisher.PositionChanged",
  { expected: Schema.Int, actual: Schema.Int },
) {}
export type Error =
  | ThreadActivityRecording.Error
  | ThreadParticipationAdmission.Error
  | PositionChanged;

/** Where the activity will appear, and who takes part there. */
export interface Context {
  readonly thread: Thread.Record;
  readonly sequence: number;
  /** The participations the publication asked to admit, and the facts of those it added. */
  readonly admitted: ThreadParticipationAdmission.Ensured;
}
/** What the owning domain's step records, after publishing the fact the activity reports. */
export interface Step<A, K extends ThreadActivityKind.Definition> {
  readonly value: A;
  readonly kind: K;
  readonly details: K["details"]["Type"];
  readonly recipients: ReadonlyArray<ThreadActivity.Recipient>;
  /** The fact the activity reports; the activity records it as its cause. */
  readonly cause: Event.Record;
}
export interface Input<A, K extends ThreadActivityKind.Definition, E, R> {
  readonly thread: Thread.Record;
  readonly occurredAt: DateTime.Utc;
  /** Record only at this position, failing with PositionChanged if activity took it first. */
  readonly expectedSequence?: number;
  /** Participants to admit at this position before the step, as a reply admits its author. */
  readonly admit?: ReadonlyArray<ThreadParticipation.Reference>;
  readonly step: (context: Context) => Effect.Effect<Step<A, K>, E, R>;
}
export interface Published<A> {
  readonly value: A;
  readonly event: Event.Type<typeof ThreadActivityFacts.Recorded>;
}
export interface Interface {
  readonly workspaceId: Thread.Record["workspaceId"];
  /**
   * Publish one activity in the caller's commit: take the thread's next position, admit the
   * participants asked for, run the owning domain's step, and record the activity it returns
   * there, caused by the fact the step published. The caller authorizes the operation.
   */
  readonly publish: <A, K extends ThreadActivityKind.Definition, E, R>(
    input: Input<A, K, E, R>,
  ) => Effect.Effect<Published<A>, E | Error, R | Store.Transaction | Publication.Service>;
}
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/thread/activity/publisher/Service",
) {}

/** @category constructors */
export const make = Effect.fn("ThreadActivityPublisher.make")(function* () {
  const recording = yield* ThreadActivityRecording.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const workspaceId = recording.workspaceId;
  if (admissions.workspaceId !== workspaceId)
    return yield* new ThreadActivityRecording.InvalidReference({
      message: "Activity publisher services belong to different workspaces",
    });
  const publish = Effect.fn("ThreadActivityPublisher.publish")(function* <
    A,
    K extends ThreadActivityKind.Definition,
    E,
    R,
  >(input: Input<A, K, E, R>) {
    const { thread, occurredAt } = input;
    const sequence = yield* recording.nextSequence(thread.id);
    if (input.expectedSequence !== undefined && input.expectedSequence !== sequence)
      return yield* new PositionChanged({ expected: input.expectedSequence, actual: sequence });
    const admitted =
      input.admit === undefined || input.admit.length === 0
        ? { participants: [], added: [] }
        : yield* admissions
            .ensure(thread, input.admit, sequence, occurredAt)
            .pipe(Publication.withOccurredAt(occurredAt));
    const step = yield* input.step({ thread, sequence, admitted });
    const event = yield* recording
      .record({
        threadId: thread.id,
        sequence,
        occurredAt,
        kind: step.kind,
        details: step.details,
        recipients: step.recipients,
      })
      .pipe(Publication.withCause(step.cause, occurredAt));
    return { value: step.value, event } satisfies Published<A>;
  });
  return Service.of({ workspaceId, publish });
});
/** Internal service: callers own authorization and the commit. @category layers */
export const layer = Layer.effect(Service, make());
export * as ThreadActivityPublisher from "./publisher.ts";
