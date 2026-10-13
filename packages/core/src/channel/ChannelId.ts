/**
 * The identity of a channel, in a leaf of its own so that models which refer to channels, such as
 * how a message came about and authorization targets, need not import the channel's record.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"

/**
 * Names a channel.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ChannelId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type
