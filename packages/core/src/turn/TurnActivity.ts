/**
 * The kinds of activity a turn records in its thread's timeline, in the commits that make them:
 * where it was created, that it started, that it was asked to stop, and how it ended. None is new
 * activity and none informs anyone; the replies a turn posts are. `TurnCommand.recordActivity`
 * records them, and `TurnTimeline` shows them, which a client folds into one row at the turn's
 * `turn.created` position.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Subject from "../journal/Subject.ts";
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import * as ThreadMessageId from "../thread/ThreadMessageId.ts";
import * as MemberId from "../workspace/MemberId.ts";
import * as Turn from "./Turn.ts";

const turnSubject = ({ turnId }: { readonly turnId: Turn.Id }) => Subject.make("turn", turnId);

/**
 * An agent accepted work into a new turn here, or someone asked a failed or stopped one to run
 * again: where the turn's row shows in the thread. It informs no one and is not new activity; the
 * replies the turn posts are.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Created = ThreadActivityKind.make("turn.created", {
  version: 1,
  details: Schema.Struct({
    turnId: Turn.Id,
    /** The agent's membership. */
    memberId: MemberId.Id,
    retryOf: Schema.NullOr(Turn.Id),
  }),
  subject: turnSubject,
  newActivity: false,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Created = ThreadActivityKind.Activity<typeof Created>;

/**
 * `TurnExecution` started the turn for its job: it is working.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Started = ThreadActivityKind.make("turn.started", {
  version: 1,
  details: Schema.Struct({ turnId: Turn.Id }),
  subject: turnSubject,
  newActivity: false,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Started = ThreadActivityKind.Activity<typeof Started>;

/**
 * Someone asked the working turn to stop, or its agent stopped taking part: it is stopping.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Stopping = ThreadActivityKind.make("turn.stopping", {
  version: 1,
  details: Schema.Struct({ turnId: Turn.Id, cancelReason: Turn.CancelReason }),
  subject: turnSubject,
  newActivity: false,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Stopping = ThreadActivityKind.Activity<typeof Stopping>;

/**
 * The turn ended: completed, with the replies it posted, if any; failed, and why; or stopped, and
 * why it was asked to.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Ended = ThreadActivityKind.make("turn.ended", {
  version: 1,
  details: Schema.Struct({
    turnId: Turn.Id,
    outcome: Turn.Outcome,
    messageIds: Schema.Array(ThreadMessageId.Id),
    reason: Schema.NullOr(Schema.String),
    cancelReason: Schema.NullOr(Turn.CancelReason),
  }),
  subject: turnSubject,
  newActivity: false,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Ended = ThreadActivityKind.Activity<typeof Ended>;
