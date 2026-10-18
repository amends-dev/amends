/**
 * When a live stream reconnects: the change feed and a turn's log both back off between failures
 * by the same rule.
 */

import * as ApiErrors from "@amends-dev/http/ApiErrors"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Effect from "effect/Effect"
import * as Sse from "effect/encoding/Sse"
import * as Random from "effect/Random"
import * as Schema from "effect/Schema"

/** The errors a stream failed with. */
export const errorsOf = (cause: Cause.Cause<unknown>) =>
  cause.reasons.flatMap((reason) => (Cause.isFailReason(reason) ? [reason.error] : []))
/**
 * How long a live stream waits before reconnecting after its `attempt`th failure in a row: what
 * the server asked for, or exponential from one second to thirty, halved at random so clients do
 * not return together, and at least fifteen seconds while too many streams are open.
 */
export const retryDelay = Effect.fnUntraced(function* (attempt: number, cause: Cause.Cause<unknown>) {
  const errors = errorsOf(cause)
  const requested = errors.find((error) => Sse.Retry.is(error))
  if (requested) return requested.duration
  const exponential = Math.min(30_000, 1_000 * 2 ** Math.min(attempt - 1, 5))
  const limited = errors.some(Schema.is(ApiErrors.TooManyStreams)) ? Math.max(exponential, 15_000) : exponential
  return Duration.millis(limited * (0.5 + (yield* Random.next) / 2))
})
