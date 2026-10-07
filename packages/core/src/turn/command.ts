import { Context, DateTime, Effect, Layer, Option } from "effect";
import type { Event } from "../journal/event.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { ThreadCommand } from "../thread/command.ts";
import type { ThreadId } from "../thread/id.ts";
import { ThreadStore } from "../thread/store.ts";
import { Thread } from "../thread/thread.ts";
import type { ThreadMessageId } from "../thread/message/id.ts";
import { TurnActivity } from "./activity.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { Turn } from "./turn.ts";

/**
 * How a turn ended: completed with the reply it posted, if any, failed and why, or stopped and why
 * it was asked to. Callers name the stop's reason, since the record they hold may predate the
 * request.
 */
export type Ending =
  | { readonly outcome: "completed"; readonly messageIds: ReadonlyArray<ThreadMessageId.Id> }
  | { readonly outcome: "failed"; readonly reason: string }
  | { readonly outcome: "cancelled"; readonly cancelReason: Turn.CancelReason };

/** A turn's change, as its thread's timeline shows it. */
export type ActivityKind =
  | typeof TurnActivity.Created
  | typeof TurnActivity.Started
  | typeof TurnActivity.Stopping
  | typeof TurnActivity.Ended;

export type RecordError = ThreadCommand.Error | ThreadStore.Failure;
export type EndError = Projection.Error | Log.WriteError | RecordError;
export interface Interface {
  /**
   * Record a turn's change in its thread's timeline, in the caller's commit, caused by the turn
   * fact that reports it. It informs no one.
   */
  readonly recordActivity: <K extends ActivityKind>(
    thread: Thread.Record | ThreadId.Id,
    kind: K,
    details: K["details"]["Type"],
    cause: Event.Record,
  ) => Effect.Effect<void, RecordError, Store.Transaction | Publication.Service>;
  /**
   * End a turn in the caller's commit, everywhere it is told: its fact in the journal, its row in
   * its thread's timeline, and its log, whose readers it lets go. Callers check that the turn may
   * end this way.
   */
  readonly endTurn: (
    turn: Turn.Record,
    ending: Ending,
  ) => Effect.Effect<void, EndError, Store.Transaction | Publication.Service>;
}

/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/command/Service",
) {}

/** @category constructors */
export const make = Effect.fn("TurnCommand.make")(function* () {
  const threadStore = yield* ThreadStore.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;

  const recordActivity: Interface["recordActivity"] = Effect.fnUntraced(
    function* (thread, kind, details, cause) {
      const found =
        typeof thread === "string" ? Option.getOrUndefined(yield* threadStore.get(thread)) : thread;
      if (found === undefined) return yield* Effect.die("A turn's thread is missing");
      const occurredAt = yield* DateTime.now;
      yield* threadCommand.publishActivity({
        thread: found,
        occurredAt,
        step: () => Effect.succeed({ value: undefined, kind, details, recipients: [], cause }),
      });
    },
  );

  const endTurn: Interface["endTurn"] = Effect.fnUntraced(function* (turn, ending) {
    const finishedAt = yield* DateTime.now;
    const where = {
      workspaceId: turn.workspaceId,
      groupId: turn.groupId,
      threadId: turn.threadId,
      memberId: turn.memberId,
      turnId: turn.id,
    };
    const messageIds = ending.outcome === "completed" ? ending.messageIds : [];
    const reason = ending.outcome === "failed" ? ending.reason : null;
    const cancelReason = ending.outcome === "cancelled" ? ending.cancelReason : null;
    const event =
      ending.outcome === "completed"
        ? yield* journal.publish(
            TurnFacts.Completed,
            Object.assign(where, { messageIds, finishedAt }),
          )
        : ending.outcome === "failed"
          ? yield* journal.publish(
              TurnFacts.Failed,
              Object.assign(where, { reason: ending.reason, finishedAt }),
            )
          : yield* journal.publish(
              TurnFacts.Cancelled,
              Object.assign(where, { cancelReason: ending.cancelReason, finishedAt }),
            );
    yield* recordActivity(
      turn.threadId,
      TurnActivity.Ended,
      { turnId: turn.id, outcome: ending.outcome, messageIds, reason, cancelReason },
      event,
    );
    yield* TurnLog.open(log, turn.id).append({
      _tag: "Ended",
      outcome: ending.outcome,
      reason,
      cancelReason,
      messageIds,
    });
  });

  return Service.of({ recordActivity, endTurn });
});

/** Internal writes shared by turn operations and execution. @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnCommand from "./command.ts";
