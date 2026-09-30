import { Schema } from "effect";
import { ThreadMessageTimeline } from "./message/timeline.ts";
import { ThreadParticipationTimeline } from "./participation/timeline.ts";
import { TurnTimeline } from "../turn/timeline.ts";

/**
 * Every kind of timeline item, for protocols that encode timelines: the schema of
 * `Thread.TimelineItem`. A domain that records a new kind adds its item schema here, apart from the
 * composition root, so that clients decoding timelines need not load core's wiring.
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
export type Item = typeof Item.Type;

export * as ThreadTimeline from "./timeline.ts";
