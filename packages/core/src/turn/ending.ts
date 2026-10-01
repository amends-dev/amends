import { Context, DateTime, Effect, Layer } from "effect";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import type { Publication } from "../journal/publication.ts";
import type { Store } from "../journal/store.ts";
import type { ThreadMessageId } from "../thread/message/id.ts";
import { TurnActivity } from "./activity.ts";
import { TurnActivityRecorder } from "./activity-recorder.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import type { Turn } from "./turn.ts";

/**
 * How a turn ended: completed with the replies it posted, failed and why, or stopped and why it
 * was asked to. Callers name the stop's reason, since the record they hold may predate the request.
 */
export type Ending =
  | { readonly outcome: "completed"; readonly messageIds: ReadonlyArray<ThreadMessageId.Id> }
  | { readonly outcome: "failed"; readonly reason: string }
  | { readonly outcome: "cancelled"; readonly cancelReason: Turn.CancelReason | null };

export type Error = Projection.Error | Log.WriteError | TurnActivityRecorder.Error;

export interface Interface {
  /**
   * End a turn in the caller's commit, everywhere it is told: its fact in the journal, its row in
   * its thread's timeline, and its agent's log for the thread, which so says how every turn there
   * ended. Callers check that the turn may end this way.
   */
  readonly end: (
    turn: Turn.Record,
    ending: Ending,
  ) => Effect.Effect<void, Error, Store.Transaction | Publication.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/ending/Service",
) {}

/** @category constructors */
export const make = Effect.fn("TurnEnding.make")(function* () {
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const turnActivityRecorder = yield* TurnActivityRecorder.Service;

  const end: Interface["end"] = Effect.fnUntraced(function* (turn, ending) {
    const finishedAt = yield* DateTime.now;
    const where = {
      workspaceId: turn.workspaceId,
      groupId: turn.groupId,
      threadId: turn.threadId,
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
          : yield* journal.publish(TurnFacts.Cancelled, Object.assign(where, { finishedAt }));
    yield* turnActivityRecorder.record(
      turn.threadId,
      TurnActivity.Ended,
      { turnId: turn.id, outcome: ending.outcome, messageIds, reason, cancelReason },
      event,
    );
    yield* TurnLog.open(log, turn.participationId).append({
      _tag: "Ended",
      turnId: turn.id,
      outcome: ending.outcome,
      reason,
      cancelReason,
      messageIds,
    });
  });

  return Service.of({ end });
});

/** Internal service: callers own authorization and the commit. @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnEnding from "./ending.ts";
