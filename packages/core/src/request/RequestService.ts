/**
 * Running a member's keyed request once. A protocol that may deliver a request more than once,
 * such as a browser's outbox sending what it wrote until the server answers, runs each through
 * `runOnce`, which runs it unless it ran before and records how it ran: it completed, in the
 * commit of what it did, or was rejected, with the error that rejected it. A request that ran
 * does nothing when asked again, whatever has changed since.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import * as CoreError from "../error/CoreError.ts"
import * as Actor from "../identity/Actor.ts"
import * as Journal from "../journal/Journal.ts"
import * as Publication from "../journal/Publication.ts"
import * as Operation from "../operation/Operation.ts"
import type * as MemberId from "../workspace/MemberId.ts"
import * as Request from "./Request.ts"
import * as RequestFacts from "./RequestFacts.ts"

/**
 * Running requests once, one of `Core.Operations`.
 *
 * @category services
 * @since 0.1.0
 */
export class RequestService extends Context.Service<
  RequestService,
  {
    /**
     * Run `operation` as the acting member's request `key`, once. Unless the request ran before,
     * the operation runs inside `Request.withKey(key)` and one commit, which also records that the
     * request completed; a `Rejection` rolls that commit back and is recorded in one of its own.
     * It fails only while the request has not run, with `Unavailable` or `Uncertain`, so it may be
     * asked again.
     */
    readonly runOnce: <R>(
      key: Request.Key,
      operation: Effect.Effect<unknown, CoreError.CoreError, R>
    ) => Effect.Effect<void, CoreError.Unavailable | CoreError.Uncertain, R | Actor.Actor>
  }
>()("@amends-dev/core/request/RequestService") {}

const isRejection = Schema.is(CoreError.Rejection)

/**
 * Builds the request operations over the journal.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const journal = yield* Journal.Journal
  const crypto = yield* Crypto.Crypto

  /** Whether request `key` of `memberId` ran before: it completed or was rejected. */
  const ranBefore = Effect.fnUntraced(function* (memberId: MemberId.MemberId, key: Request.Key) {
    for (const occurrenceKey of yield* RequestFacts.makeOccurrenceKeys(memberId, key))
      if (Option.isSome(yield* journal.log.getAppend(occurrenceKey))) return true
    return false
  })

  /** Record that request `key` of `memberId` was rejected with `error`, unless it ran meanwhile. */
  const recordRejection = (memberId: MemberId.MemberId, key: Request.Key, error: CoreError.Rejection) =>
    journal.commit(
      Effect.gen(function* () {
        if (yield* ranBefore(memberId, key)) return
        yield* journal.publish(RequestFacts.Rejected, { memberId, key, error })
      })
    )

  const runOnce = Effect.fn("RequestService.runOnce")(
    function* <R>(key: Request.Key, operation: Effect.Effect<unknown, CoreError.CoreError, R>) {
      const { memberId } = yield* Actor.Actor
      yield* journal
        .commit(
          Effect.gen(function* () {
            if (yield* ranBefore(memberId, key)) return
            yield* operation.pipe(Request.withKey(key))
            yield* journal.publish(RequestFacts.Completed, { memberId, key })
          })
        )
        .pipe(Effect.catchIf(isRejection, (error) => recordRejection(memberId, key, error)))
    },
    Publication.withActor,
    Effect.provideService(Crypto.Crypto, crypto),
    Operation.report,
    // What it records is core's own and always decodes, so a value that does not is a defect.
    Effect.catchTag("CoreError.Invalid", Effect.die)
  )

  return RequestService.of({ runOnce })
})

/**
 * Provide the request operations over the journal.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(RequestService, make)
