/**
 * The closed set of timeline items, for protocols that encode timelines. Each domain that records
 * activity adds its items' schemas here and its resolver to the composition root, so a client that
 * decodes timelines loads this module and not core's wiring.
 *
 * @since 0.1.0
 */
import * as Schema from "effect/Schema";
import * as ThreadMessageTimeline from "./ThreadMessageTimeline.ts";
import * as ThreadParticipationTimeline from "./ThreadParticipationTimeline.ts";
import * as ThreadTitleTimeline from "./ThreadTitleTimeline.ts";
import * as TurnTimeline from "../turn/TurnTimeline.ts";
import * as TaskTimeline from "../task/TaskTimeline.ts";

/**
 * Every kind of timeline item: the schema of `Thread.TimelineItem`. Each item holds its activity,
 * with the kind's details decoded, and what the activity references.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Item = Schema.Union([
  ThreadMessageTimeline.PublishedItem,
  ThreadMessageTimeline.EditedItem,
  ThreadMessageTimeline.DeletedItem,
  ThreadParticipationTimeline.FollowedItem,
  ThreadParticipationTimeline.EndedItem,
  ThreadTitleTimeline.RenamedItem,
  TurnTimeline.CreatedItem,
  TurnTimeline.StartedItem,
  TurnTimeline.StoppingItem,
  TurnTimeline.EndedItem,
  TaskTimeline.CreatedItem,
  TaskTimeline.UpdatedItem,
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Item = typeof Item.Type;
