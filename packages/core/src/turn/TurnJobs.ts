/**
 * Turn jobs: one for each agent in each thread, which runs the agent's work there, one turn at a
 * time, through `TurnExecution`, and stops its turn when asked. Core declares, as journal
 * reactions, which facts request a job, in the commit that publishes them: activity that asks the
 * agent for work, and a turn's end or retry, request a run; a request to stop a turn, the end of
 * the agent's participation, and its leaving the thread's group request a stop. Hosts supply the
 * service, shared by every workspace, and deliver each request to whatever runs turn jobs, as
 * Cluster's `TurnJob` does; a host that runs none accepts requests and runs nothing.
 *
 * @since 0.1.0
 */

import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import * as GroupMembershipFacts from "../group/GroupMembershipFacts.ts"
import type * as Event from "../journal/Event.ts"
import type * as Reaction from "../journal/Reaction.ts"
import type * as Store from "../journal/Store.ts"
import type * as StoreError from "../journal/StoreError.ts"
import * as Notification from "../notification/Notification.ts"
import * as ThreadActivityFacts from "../thread/ThreadActivityFacts.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadParticipationFacts from "../thread/ThreadParticipationFacts.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import type * as Turn from "./Turn.ts"
import * as TurnFacts from "./TurnFacts.ts"
import * as TurnStore from "./TurnStore.ts"

/**
 * An agent's turn job: the work of one agent in one thread, named by its membership.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Job = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  memberId: MemberId.Id,
  threadId: ThreadId.Id
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Job extends Schema.Schema.Type<typeof Job> {}

/**
 * @effect-expect-leaking Transaction
 *
 * Turn jobs: one for each agent in each thread, which takes the work asked of the agent there into
 * a turn and runs it, one turn at a time, and stops the turn when asked. Hosts supply it and
 * deliver each request to whatever runs turn jobs; a host that runs none accepts requests and
 * runs nothing, so work waits in agents' inboxes.
 *
 * @category services
 * @since 0.1.0
 */
export class TurnJobs extends Context.Service<
  TurnJobs,
  {
    /**
     * Request, as part of the caller's commit, that the job run the agent's work in the thread: the
     * request is stored with the commit and discarded if it rolls back. Asking again before it runs
     * asks once.
     */
    readonly requestRun: (job: Job) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
    /**
     * Request, likewise, that the job stop its turn `turnId`, which was asked to stop or whose agent
     * no longer takes part where it works. A turn the job is not running is stopped as it stands.
     */
    readonly requestStop: (
      job: Job & { readonly turnId: Turn.Id }
    ) => Effect.Effect<void, StoreError.StoreError, Store.Transaction>
  }
>()("@amends-dev/core/turn/TurnJobs") {}

/**
 * For a host that runs no turn jobs: requests are accepted and nothing runs, so work waits in
 * agents' inboxes until something runs it.
 *
 * @category constructors
 * @since 0.1.0
 */
export const noRunner: TurnJobs["Service"] = TurnJobs.of({
  requestRun: () => Effect.void,
  requestStop: () => Effect.void
})

/**
 * Turn jobs for a host that runs none: `noRunner` as a layer.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerNoRunner = Layer.succeed(TurnJobs, noRunner)

const decodeRecorded = Schema.decodeUnknownSync(
  Schema.Struct({
    activity: Schema.Struct({
      threadId: ThreadActivityFacts.Recorded.payload.fields.activity.fields.threadId
    }),
    recipients: ThreadActivityFacts.Recorded.payload.fields.recipients
  })
)
const decodeEnded = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: TurnFacts.Completed.payload.fields.memberId,
    threadId: TurnFacts.Completed.payload.fields.threadId
  })
)
const decodeCancelRequested = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: TurnFacts.CancelRequested.payload.fields.memberId,
    threadId: TurnFacts.CancelRequested.payload.fields.threadId,
    turnId: TurnFacts.CancelRequested.payload.fields.turnId
  })
)
const decodeParticipationEnded = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: ThreadParticipationFacts.Ended.payload.fields.memberId,
    threadId: ThreadParticipationFacts.Ended.payload.fields.threadId,
    participationId: ThreadParticipationFacts.Ended.payload.fields.participationId
  })
)
const decodeGroupRemoval = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: GroupMembershipFacts.Removed.payload.fields.memberId,
    groupId: GroupMembershipFacts.Removed.payload.fields.groupId
  })
)

/** Each agent the activity asks for work runs it in the activity's thread. */
const runRequestedWork = Effect.fnUntraced(function* (event: Event.Event) {
  const turnJobs = yield* TurnJobs
  const { activity, recipients } = decodeRecorded(event.payload)
  for (const { recipient, requestsWork } of recipients)
    if (requestsWork && Notification.Recipient.isAnyOf(["Agent"])(recipient))
      yield* turnJobs.requestRun({
        workspaceId: event.provenance.workspaceId,
        memberId: recipient.memberId,
        threadId: activity.threadId
      })
})

/**
 * A turn that ended, or one created to run a turn again, has its job run: the work that waited for
 * the turn, or the new turn.
 */
const runWaitingWork = Effect.fnUntraced(function* (event: Event.Event) {
  const { memberId, threadId } = decodeEnded(event.payload)
  yield* (yield* TurnJobs).requestRun({
    workspaceId: event.provenance.workspaceId,
    memberId,
    threadId
  })
})

/** A turn asked to stop has its job stop it. */
const stopCancelledTurn = Effect.fnUntraced(function* (event: Event.Event) {
  const { memberId, threadId, turnId } = decodeCancelRequested(event.payload)
  yield* (yield* TurnJobs).requestStop({
    workspaceId: event.provenance.workspaceId,
    memberId,
    threadId,
    turnId
  })
})

/** A member that stopped taking part in a thread has its turn there stopped. */
const stopTurnOfEndedParticipation = Effect.fnUntraced(function* (event: Event.Event) {
  const { memberId, threadId, participationId } = decodeParticipationEnded(event.payload)
  const turnStore = yield* TurnStore.TurnStore
  const active = yield* turnStore.findActive(memberId, threadId)
  if (active._tag === "None" || active.value.participationId !== participationId) return
  yield* (yield* TurnJobs).requestStop({
    workspaceId: event.provenance.workspaceId,
    memberId,
    threadId,
    turnId: active.value.id
  })
})

/**
 * A member that left a group, or was removed from it or the workspace, has its turns in the
 * group's threads stopped, since leaving ended its participation in each. A person has none.
 */
const stopTurnsInLeftGroup = Effect.fnUntraced(function* (event: Event.Event) {
  const { memberId, groupId } = decodeGroupRemoval(event.payload)
  const turnStore = yield* TurnStore.TurnStore
  const turnJobs = yield* TurnJobs
  const active = yield* turnStore.listActiveByMember(memberId)
  for (const turn of active)
    if (turn.groupId === groupId)
      yield* turnJobs.requestStop({
        workspaceId: event.provenance.workspaceId,
        memberId,
        threadId: turn.threadId,
        turnId: turn.id
      })
})

/**
 * The facts that change an agent's work in a thread request its job, in the commit that publishes
 * them: recorded activity that asks an agent for work, and a turn's retry or end, request a run;
 * a stop request, an ended participation, and a removal from a group request a stop of the turn
 * they concern.
 *
 * @category constructors
 * @since 0.1.0
 */
export const reactions: ReadonlyArray<Reaction.Definition<TurnJobs | TurnStore.TurnStore>> = [
  { fact: ThreadActivityFacts.Recorded.name, react: runRequestedWork },
  { fact: TurnFacts.Retried.name, react: runWaitingWork },
  { fact: TurnFacts.Completed.name, react: runWaitingWork },
  { fact: TurnFacts.Failed.name, react: runWaitingWork },
  { fact: TurnFacts.Cancelled.name, react: runWaitingWork },
  { fact: TurnFacts.CancelRequested.name, react: stopCancelledTurn },
  { fact: ThreadParticipationFacts.Ended.name, react: stopTurnOfEndedParticipation },
  { fact: GroupMembershipFacts.Removed.name, react: stopTurnsInLeftGroup }
]
