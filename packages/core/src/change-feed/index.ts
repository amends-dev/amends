/**
 * The change feed: how a connected reader learns what changed in a workspace, as it commits, and
 * what is happening now. `ChangeFeed` is what a reader receives and resumes from, and
 * `ChangeFeedService` the operation that serves it to the acting member. `ChangeFeedSource` follows
 * the journal and the workspace's signals for every reader, and `ChangeFeedEvents` is the registry
 * of what it delivers.
 *
 * @since 0.1.0
 */

// @barrel: Auto-generated exports. Do not edit manually.

/**
 * @since 0.1.0
 */
export * as ChangeFeed from "./ChangeFeed.ts";

/**
 * @since 0.1.0
 */
export * as ChangeFeedEvents from "./ChangeFeedEvents.ts";

/**
 * @since 0.1.0
 */
export * as ChangeFeedService from "./ChangeFeedService.ts";

/**
 * @since 0.1.0
 */
export * as ChangeFeedSource from "./ChangeFeedSource.ts";
