import { Schema } from "effect";
import { Subject } from "../../journal/subject.ts";
import { ThreadActivityKind } from "../activity/kind.ts";
import { ThreadParticipationId } from "./id.ts";
import { ThreadParticipation } from "./participation.ts";

const subject = ({ participationId }: { readonly participationId: ThreadParticipationId.Id }) =>
  Subject.make("participation", participationId);

/** A member joined the thread by following it. */
export const Followed = ThreadActivityKind.make("participation.followed", {
  details: Schema.Struct({ participationId: ThreadParticipationId.Id }),
  subject,
  newActivity: false,
});
export type Followed = ThreadActivityKind.Activity<typeof Followed>;

/** A participation ended, for the reason recorded. */
export const Ended = ThreadActivityKind.make("participation.ended", {
  details: Schema.Struct({
    participationId: ThreadParticipationId.Id,
    reason: ThreadParticipation.EndReason,
  }),
  subject,
  newActivity: false,
});
export type Ended = ThreadActivityKind.Activity<typeof Ended>;

export * as ThreadParticipationActivity from "./activity.ts";
