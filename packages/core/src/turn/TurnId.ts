/**
 * The identity of a turn, in a leaf of its own so that models which refer to turns, such as a
 * message's `via` and a notification's `Accepted` state, need not import the turn's record.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"

/**
 * Identifies one agent's attempt on one thread. A retry derives its ID from the turn it retries,
 * so repeating it names the turn it created.
 *
 * @category schemas
 * @since 0.1.0
 */
export const TurnId = Schema.NonEmptyString.pipe(Schema.brand("TurnId"))

/**
 * @category schemas
 * @since 0.1.0
 */
export type TurnId = typeof TurnId.Type
