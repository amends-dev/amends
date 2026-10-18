/**
 * The facts that record how a member's keyed request ran: it completed, in the commit of what it
 * did, or it was rejected, in a commit of its own. Each is recorded once per request, which
 * `RequestService.runOnce` looks for before running a request.
 *
 * @since 0.1.0
 */

import * as Effect from "effect/Effect"
import * as Schema from "effect/Schema"
import * as CoreError from "../error/CoreError.ts"
import * as Fact from "../journal/Fact.ts"
import * as Occurrence from "../journal/Occurrence.ts"
import * as Subject from "../journal/Subject.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as Request from "./Request.ts"

/** A member's request: the member, and the key they gave it. */
const MemberRequest = Schema.Struct({
  memberId: MemberId.MemberId,
  key: Request.Key
})
/** A request is its member's key, so each fact is recorded once per request. */
const occurrence = (request: typeof MemberRequest.Type) => [request.memberId, request.key]
const subject = (request: typeof MemberRequest.Type) => Subject.make("request", JSON.stringify(occurrence(request)))

/**
 * A member's request `key` completed: recorded in the commit of what it did, so the two are
 * visible together or not at all.
 *
 * @category facts
 * @since 0.1.0
 */
export const Completed = Fact.make("request.completed", {
  version: 1,
  subject,
  occurrence,
  payload: MemberRequest
})

/**
 * A member's request `key` was rejected with `error`, and nothing it did was committed.
 *
 * @category facts
 * @since 0.1.0
 */
export const Rejected = Fact.make("request.rejected", {
  version: 1,
  subject,
  occurrence,
  payload: Schema.Struct({
    ...MemberRequest.fields,
    error: CoreError.Rejection
  })
})

/**
 * The keys under which the journal records how request `key` of `memberId` ran, one for each
 * fact, so either is found before the request runs.
 *
 * @category constructors
 * @since 0.1.0
 */
export const makeOccurrenceKeys = (memberId: MemberId.MemberId, key: Request.Key) =>
  Effect.forEach([Completed, Rejected], (fact) => Occurrence.makeKey(fact.name, occurrence({ memberId, key })))
