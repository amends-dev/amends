/**
 * The identity of a thread, in a leaf of its own so that models which refer to threads, such as
 * notifications, turns, and authorization targets, need not import the thread's record.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Names a thread. A start names its thread itself, so a keyed start names the same thread on a
 * retry.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;

export * as ThreadId from "./ThreadId.ts";
