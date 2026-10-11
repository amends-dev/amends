/**
 * The identity of a message, in a leaf of its own so that activity kinds and turns can refer to
 * messages without importing the message's record.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Names a message. A publication names its message itself, so a keyed reply names the same message
 * on a retry.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadMessageId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;
