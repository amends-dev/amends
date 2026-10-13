/**
 * The delivery runner carries one bound thread's messages to the external conversation it came
 * from, for its delivery job: it accepts what the thread's contacts were told into deliveries
 * through the workspace, and for each, in order, readies it, posts it through the channel's
 * transport, built from the connection's integration with its key, and records how the post went.
 * A system that cannot be reached now fails the run, for the job to try again; one that refuses
 * the message, or the connection, fails the delivery there and then. `DeliveryJob`'s worker makes a
 * runner for each job with `make`.
 *
 * @since 0.1.0
 */

import { Integrations } from "@amends-dev/connection"
import type * as Core from "@amends-dev/core"
import type { Delivery, DeliveryJobs } from "@amends-dev/core/channel"
import { DeliveryExecution } from "@amends-dev/core/channel"
import { Gateway } from "@amends-dev/gateway"
import * as Data from "effect/Data"
import * as Effect from "effect/Effect"
import * as Ref from "effect/Ref"
import * as Result from "effect/Result"
import type * as Scope from "effect/Scope"

/**
 * A run of the job failed before it had posted every delivery; `deliveryId` names the one it was
 * on, which the job gives up once it stops trying.
 *
 * @category errors
 * @since 0.1.0
 */
export class RunFailed extends Data.TaggedError("DeliveryRunner.RunFailed")<{
  readonly deliveryId: Delivery.Id | undefined
  readonly cause: unknown
}> {}

/**
 * Makes the delivery runner of `job`, over `Gateway.Gateway` and the host's `Integrations`, which
 * `DeliveryJob`'s worker holds for the job's entity: `deliver` posts what the thread's contacts
 * were told, and `giveUp` fails the delivery the job could not post. It counts the tries it made of
 * each delivery, which the delivery records.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fnUntraced(function* (job: DeliveryJobs.Job) {
  const gateway = yield* Gateway.Gateway
  const integrations = yield* Integrations.Integrations
  /** How many times this runner tried to post each delivery it has not finished with. */
  const tries = yield* Ref.make(new Map<Delivery.Id, number>())
  /**
   * Run `program` in the job's workspace, holding the workspace only while `program` runs: a post
   * waits on another system, and the workspace may reload meanwhile.
   */
  const inWorkspace = <A, E>(program: Effect.Effect<A, E, Core.JobServices | Scope.Scope>) =>
    Effect.scoped(gateway.inWorkspace(job.workspaceId, program))

  /** Post what `ready` says through the channel's transport. */
  const post = (ready: Extract<DeliveryExecution.Start, { readonly _tag: "Ready" }>) =>
    Effect.gen(function* () {
      const integration = yield* integrations.find(ready.access.connection.integration)
      const transport = yield* integration.channelTransport(
        ready.access.connection,
        ready.access.credential ?? undefined
      )
      return yield* transport.post(ready.conversation, ready.outgoing)
    })

  /** Ready, post, and record one delivery; a retryable failure to post fails the run. */
  const deliverOne = Effect.fnUntraced(function* (delivery: Delivery.Delivery) {
    const start = yield* inWorkspace(
      DeliveryExecution.DeliveryExecution.use((deliveryExecution) => deliveryExecution.start(delivery.id))
    )
    if (DeliveryExecution.Start.isAnyOf(["Idle"])(start)) return
    const attempts = yield* Ref.modify(tries, (counts) => {
      const attempts = (counts.get(delivery.id) ?? 0) + 1
      return [attempts, new Map(counts).set(delivery.id, attempts)] as const
    })
    const posted = yield* Effect.result(post(start))
    if (Result.isSuccess(posted)) {
      yield* inWorkspace(
        DeliveryExecution.DeliveryExecution.use((deliveryExecution) =>
          deliveryExecution.recordSent(delivery.id, {
            externalMessageId: posted.success.messageId,
            attempts
          })
        )
      )
    } else if (posted.failure.isRetryable) {
      return yield* new RunFailed({ deliveryId: delivery.id, cause: posted.failure })
    } else {
      yield* inWorkspace(
        DeliveryExecution.DeliveryExecution.use((deliveryExecution) =>
          deliveryExecution.recordFailed(delivery.id, {
            reason: posted.failure.message,
            attempts
          })
        )
      )
    }
    yield* Ref.update(tries, (counts) => {
      const remaining = new Map(counts)
      remaining.delete(delivery.id)
      return remaining
    })
  })

  return {
    /**
     * Deliver what the thread's contacts were told: accept it into deliveries, then post each
     * still requested, in the order of their messages.
     */
    deliver: Effect.gen(function* () {
      const deliveries = yield* inWorkspace(
        DeliveryExecution.DeliveryExecution.use((deliveryExecution) => deliveryExecution.accept(job.threadId))
      ).pipe(Effect.mapError((cause) => new RunFailed({ deliveryId: undefined, cause })))
      for (const delivery of deliveries)
        yield* deliverOne(delivery).pipe(
          Effect.catchIf(
            (error) => !(error instanceof RunFailed),
            (cause) => new RunFailed({ deliveryId: delivery.id, cause })
          )
        )
    }),
    /** Fail the delivery the job could not post, after as many tries as this runner made. */
    giveUp: (deliveryId: Delivery.Id, reason: string) =>
      Effect.gen(function* () {
        const attempts = (yield* Ref.get(tries)).get(deliveryId) ?? 0
        yield* inWorkspace(
          DeliveryExecution.DeliveryExecution.use((deliveryExecution) =>
            deliveryExecution.recordFailed(deliveryId, { reason, attempts })
          )
        )
        yield* Ref.update(tries, (counts) => {
          const remaining = new Map(counts)
          remaining.delete(deliveryId)
          return remaining
        })
      })
  }
})

/**
 * What `make` returns: `deliver` and `giveUp`.
 *
 * @category models
 * @since 0.1.0
 */
export type DeliveryRunner = Effect.Success<ReturnType<typeof make>>
