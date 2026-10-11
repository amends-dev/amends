import { Schema } from "effect";
import * as Subject from "../journal/subject.ts";
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import * as ThreadMessageId from "../thread/ThreadMessageId.ts";
import * as MemberId from "../workspace/member/id.ts";
import * as Turn from "./turn.ts";

const turnSubject = ({ turnId }: { readonly turnId: Turn.Id }) => Subject.make("turn", turnId);

/**
 * An agent accepted work into a new turn here, or someone asked a failed or stopped one to run
 * again: where the turn's row shows in the thread. It informs no one and is not new activity; the
 * replies the turn posts are.
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
export type Created = ThreadActivityKind.Activity<typeof Created>;

/** Execution took the turn: it is working. */
export const Started = ThreadActivityKind.make("turn.started", {
  version: 1,
  details: Schema.Struct({ turnId: Turn.Id }),
  subject: turnSubject,
  newActivity: false,
});
export type Started = ThreadActivityKind.Activity<typeof Started>;

/** Someone asked the working turn to stop, or its agent stopped taking part: it is stopping. */
export const Stopping = ThreadActivityKind.make("turn.stopping", {
  version: 1,
  details: Schema.Struct({ turnId: Turn.Id, cancelReason: Turn.CancelReason }),
  subject: turnSubject,
  newActivity: false,
});
export type Stopping = ThreadActivityKind.Activity<typeof Stopping>;

/**
 * The turn ended: completed, with the replies it posted, if any; failed, and why; or stopped, and
 * why it was asked to.
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
export type Ended = ThreadActivityKind.Activity<typeof Ended>;
