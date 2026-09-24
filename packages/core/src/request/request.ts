import { Schema } from "effect";

/**
 * A key the client chooses once for one logical request, such as a UUID, and repeats on every
 * retry of that request. A member's keys are independent of other members', and each creating
 * operation has its own.
 */
export const Key = Schema.NonEmptyString.check(Schema.isTrimmed(), Schema.isMaxLength(200)).pipe(
  Schema.brand("RequestKey"),
);
export type Key = typeof Key.Type;

/** What a creating operation accepts besides its input. */
export interface Options {
  /** Without a key, every call creates anew; with one, a retry returns the first call's result. */
  readonly requestKey?: Key | undefined;
}

/** The member already used this key for the operation with a different input. */
export class Reused extends Schema.TaggedError<Reused>()("Request.Reused", {
  operation: Schema.String,
  key: Key,
}) {}

export * as Request from "./request.ts";
