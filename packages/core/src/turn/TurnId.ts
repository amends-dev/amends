import { Schema } from "effect";

/** Identifies one agent's attempt on one thread. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("TurnId"));
export type Id = typeof Id.Type;
