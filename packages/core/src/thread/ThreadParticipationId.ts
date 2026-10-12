/**
 * The identity of a participation, in a leaf of its own so that activity, notifications, and turns
 * can refer to participations without importing the participation's record.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";

/**
 * Names one participation: one participant's spell of taking part in a thread, from joining to
 * ending. A participant who leaves and returns has a new one.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("ThreadParticipationId"));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Id = typeof Id.Type;
