import { Context, DateTime, Effect, Layer, Option } from "effect";
import type * as Event from "../journal/event.ts";
import * as Journal from "../journal/journal.ts";
import type * as Projection from "../journal/projection.ts";
import * as Publication from "../journal/publication.ts";
import * as Store from "../journal/store.ts";
import * as ThreadCommand from "../thread/ThreadCommand.ts";
import type * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadStore from "../thread/ThreadStore.ts";
import type * as ThreadMessageId from "../thread/ThreadMessageId.ts";
import * as TurnActivity from "./activity.ts";
import * as TurnFacts from "./facts.ts";
import * as Turn from "./turn.ts";

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
export type EndError = Projection.Error | RecordError;

/**
 * @effect-expect-leaking Transaction
 */
export class TurnCommand extends Context.Service<
  TurnCommand,
  {
    /**
     * Record a turn's change in its thread's timeline, in the caller's commit, caused by the turn
     * fact that reports it. It informs no one.
     */
    readonly recordActivity: <K extends ActivityKind>(
      threadId: ThreadId.Id,
      kind: K,
      details: K["details"]["Type"],
      cause: Event.Record,
    ) => Effect.Effect<void, RecordError, Store.Transaction | Publication.Publication>;
    /**
     * End a turn in the caller's commit, everywhere it is told: its fact in the journal, which lets
     * its log's readers go, and its row in its thread's timeline. Callers check that the turn may end
     * this way.
     */
    readonly endTurn: (
      turn: Turn.Record,
      ending: Ending,
    ) => Effect.Effect<void, EndError, Store.Transaction | Publication.Publication>;
    /**
     * Ask an active turn to stop for `reason`, in the caller's commit: a queued one ends cancelled at
     * once, since nothing runs it yet; a running one is marked stopping, which its job confirms once
     * it has stopped. Returns the turn as it now stands. Callers give an active turn not yet asked.
     */
    readonly requestStop: (
      turn: Turn.Record,
      reason: Turn.CancelReason,
    ) => Effect.Effect<Turn.Record, EndError, Store.Transaction | Publication.Publication>;
  }
>()("@amends-dev/core/turn/command/Service") {}

/** @category constructors */
export const make = Effect.fn("TurnCommand.make")(function* () {
  const threadStore = yield* ThreadStore.ThreadStore;
  const threadCommand = yield* ThreadCommand.ThreadCommand;
  const journal = yield* Journal.Journal;

  const recordActivity: TurnCommand["Service"]["recordActivity"] = Effect.fnUntraced(
    function* (threadId, kind, details, cause) {
      const thread = yield* threadStore.get(threadId);
      if (Option.isNone(thread)) return yield* Effect.die("A turn's thread is missing");
      const occurredAt = yield* DateTime.now;
      yield* threadCommand.publishActivity({
        thread: thread.value,
        occurredAt,
        step: () => Effect.succeed({ value: undefined, kind, details, recipients: [], cause }),
      });
    },
  );

  /** Publish the fact that ends `turn` as `ending` says, at `finishedAt`. */
  const publishEnding = (turn: Turn.Record, ending: Ending, finishedAt: DateTime.Utc) => {
    const where = {
      workspaceId: turn.workspaceId,
      groupId: turn.groupId,
      threadId: turn.threadId,
      memberId: turn.memberId,
      turnId: turn.id,
      finishedAt,
    };
    switch (ending.outcome) {
      case "completed":
        return journal.publish(TurnFacts.Completed, { ...where, messageIds: ending.messageIds });
      case "failed":
        return journal.publish(TurnFacts.Failed, { ...where, reason: ending.reason });
      case "cancelled":
        return journal.publish(TurnFacts.Cancelled, {
          ...where,
          cancelReason: ending.cancelReason,
        });
    }
  };

  const endTurn: TurnCommand["Service"]["endTurn"] = Effect.fnUntraced(function* (turn, ending) {
    const event = yield* publishEnding(turn, ending, yield* DateTime.now);
    yield* recordActivity(
      turn.threadId,
      TurnActivity.Ended,
      {
        turnId: turn.id,
        outcome: ending.outcome,
        messageIds: ending.outcome === "completed" ? ending.messageIds : [],
        reason: ending.outcome === "failed" ? ending.reason : null,
        cancelReason: ending.outcome === "cancelled" ? ending.cancelReason : null,
      },
      event,
    );
  });

  const requestStop: TurnCommand["Service"]["requestStop"] = Effect.fnUntraced(
    function* (turn, reason) {
      const requestedAt = yield* DateTime.now;
      const requested = yield* journal.publish(TurnFacts.CancelRequested, {
        workspaceId: turn.workspaceId,
        groupId: turn.groupId,
        threadId: turn.threadId,
        memberId: turn.memberId,
        turnId: turn.id,
        reason,
        requestedAt,
      });
      if (turn.status === "queued") {
        yield* endTurn(turn, { outcome: "cancelled", cancelReason: reason });
        return Turn.change(turn, {
          status: "cancelled",
          cancelReason: reason,
          finishedAt: requestedAt,
        });
      }
      yield* recordActivity(
        turn.threadId,
        TurnActivity.Stopping,
        { turnId: turn.id, cancelReason: reason },
        requested,
      );
      return Turn.change(turn, { status: "cancelling", cancelReason: reason });
    },
  );

  return TurnCommand.of({ recordActivity, endTurn, requestStop });
});

/** Internal writes shared by turn operations and execution. @category layers */
export const layer = Layer.effect(TurnCommand, make());
