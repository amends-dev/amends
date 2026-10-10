/**
 * The kind of activity a thread's title records in its timeline. It is quiet: it counts as
 * nobody's new activity. `ThreadTitleTimeline` shows it.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import { Thread } from "./Thread.ts";
import { ThreadActivityKind } from "./ThreadActivityKind.ts";

/**
 * The thread was given a title, or its title changed. It is about its thread, and a thread is
 * renamed any number of times, so it has no occurrence.
 *
 * @category kinds
 * @since 0.1.0
 */
export const Renamed = ThreadActivityKind.make("thread.renamed", {
  details: Schema.Struct({
    title: Thread.Title,
    /** The title it replaced, or null when the thread had none. */
    previous: Schema.NullOr(Thread.Title),
  }),
  occurrence: () => null,
  newActivity: false,
});

/**
 * @category kinds
 * @since 0.1.0
 */
export type Renamed = ThreadActivityKind.Activity<typeof Renamed>;

export * as ThreadTitleActivity from "./ThreadTitleActivity.ts";
