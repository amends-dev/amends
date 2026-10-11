/**
 * The change feed: how a connected reader learns what changed in a workspace, as it commits, and
 * what is happening now. `ChangeFeed` is what a reader receives and resumes from, and
 * `ChangeFeedService` the operation that serves it to the acting member; the source it follows the
 * journal with, and the registry of what it delivers, are internal to core.
 *
 * @since 0.1.0
 */

/**
 * The messages a reader receives, the cursor it resumes from, and the options it watches with.
 *
 * @since 0.1.0
 */
export * as ChangeFeed from "./ChangeFeed.ts";

/**
 * The operation that streams a workspace's changes and signals to the acting member.
 *
 * @since 0.1.0
 */
export * as ChangeFeedService from "./ChangeFeedService.ts";
