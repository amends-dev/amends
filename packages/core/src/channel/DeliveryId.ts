/**
 * The identity of a delivery, in a leaf of its own so that a notification can name the delivery
 * that accepted it without importing the delivery's record.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Names a delivery: one message to one external conversation through one channel.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("DeliveryId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;
