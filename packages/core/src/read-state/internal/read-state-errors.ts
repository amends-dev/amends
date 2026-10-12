/**
 * The outcomes `ReadStateService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";
import * as ThreadId from "../../thread/ThreadId.ts";
import * as MemberId from "../../workspace/MemberId.ts";

/**
 * The requested position is past the thread's latest recorded activity.
 */
export class BeyondTimeline extends Schema.TaggedError<BeyondTimeline>()(
  "ReadStateService.BeyondTimeline",
  { threadId: ThreadId.Id, throughSequence: Schema.Int, latestSequence: Schema.Int },
) {}

/**
 * The acting member is an agent: only people keep read state, and agents' turns track their input
 * progress.
 */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "ReadStateService.HumanRequired",
  { memberId: MemberId.Id },
) {}
