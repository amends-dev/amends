/**
 * The outcomes `ReadStateService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's `Error` type adds the failures of what it depends on.
 */
import { Schema } from "effect";
import * as ThreadId from "../../thread/ThreadId.ts";

/**
 * The requested position is past the thread's latest recorded activity.
 */
export class BeyondTimeline extends Schema.TaggedError<BeyondTimeline>()(
  "ReadStateService.BeyondTimeline",
  { threadId: ThreadId.Id, throughSequence: Schema.Int, latestSequence: Schema.Int },
) {}
