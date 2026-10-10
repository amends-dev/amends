/**
 * The closed set of timeline items, for protocols that encode timelines. Each domain that records
 * activity adds its items' schemas here and its resolver to the composition root, so a client that
 * decodes timelines loads this module and not core's wiring.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { ThreadMessageTimeline } from "./ThreadMessageTimeline.ts";
import { ThreadParticipationTimeline } from "./ThreadParticipationTimeline.ts";
import { TurnTimeline } from "../turn/timeline.ts";

/**
 * Every kind of timeline item: the schema of `Thread.TimelineItem`. Each item holds its activity,
 * with the kind's details decoded, and what the activity references.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Item = Schema.Union([
  ThreadMessageTimeline.Item,
  ThreadParticipationTimeline.FollowedItem,
  ThreadParticipationTimeline.EndedItem,
  TurnTimeline.CreatedItem,
  TurnTimeline.StartedItem,
  TurnTimeline.StoppingItem,
  TurnTimeline.EndedItem,
]);

/**
 * @category schemas
 * @since 0.1.0
 */
export type Item = typeof Item.Type;

export * as ThreadTimeline from "./ThreadTimeline.ts";
