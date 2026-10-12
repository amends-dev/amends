/**
 * The kinds of activity participation records in a thread's timeline. Both are quiet: they count
 * as nobody's new activity and notify nobody. `ThreadParticipationTimeline` shows them.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Subject from "../journal/Subject.ts";
import * as ThreadActivityKind from "./ThreadActivityKind.ts";
import * as ThreadParticipationId from "./ThreadParticipationId.ts";
import * as ThreadParticipation from "./ThreadParticipation.ts";

const subject = ({ participationId }: { readonly participationId: ThreadParticipationId.Id }) =>
  Subject.make("participation", participationId);

/**
 * A member joined the thread by following it. Joining by replying or being mentioned records no
 * activity of its own; the message does.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Followed = ThreadActivityKind.make("participation.followed", {
  version: 1,
  details: Schema.Struct({ participationId: ThreadParticipationId.Id }),
  subject,
  newActivity: false,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Followed = ThreadActivityKind.Activity<typeof Followed>;

/**
 * A participation ended, for the reason recorded.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Ended = ThreadActivityKind.make("participation.ended", {
  version: 1,
  details: Schema.Struct({
    participationId: ThreadParticipationId.Id,
    reason: ThreadParticipation.EndReason,
  }),
  subject,
  newActivity: false,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Ended = ThreadActivityKind.Activity<typeof Ended>;
