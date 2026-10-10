import { Context, Effect, Layer, Schema } from "effect";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import type { Event } from "../journal/event.ts";
import type { Reaction } from "../journal/reaction.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "../notification/notification.ts";
import { ThreadActivityFacts } from "../thread/ThreadActivityFacts.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { ThreadParticipationFacts } from "../thread/ThreadParticipationFacts.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { TurnFacts } from "./facts.ts";
import { TurnStore } from "./store.ts";
import type { Turn } from "./turn.ts";

/** An agent's turn job: the work of one agent in one thread, named by its membership. */
export const Job = Schema.Struct({
  workspaceId: WorkspaceId.Id,
  memberId: MemberId.Id,
  threadId: ThreadId.Id,
});
export interface Job extends Schema.Schema.Type<typeof Job> {}

/**
 * Turn jobs: one for each agent in each thread, which takes the work asked of the agent there into
 * a turn and runs it, one turn at a time, and stops the turn when asked. Hosts supply it and
 * deliver each request to whatever runs turn jobs; a host that runs none accepts requests and
 * runs nothing, so work waits in agents' inboxes.
 */
export interface Interface {
  /**
   * Request, as part of the caller's commit, that the job run the agent's work in the thread: the
   * request is stored with the commit and discarded if it rolls back. Asking again before it runs
   * asks once.
   */
  readonly requestRun: (job: Job) => Effect.Effect<void, Store.Failure, Store.Transaction>;
  /**
   * Request, likewise, that the job stop its turn `turnId`, which was asked to stop or whose agent
   * no longer takes part where it works. A turn the job is not running is stopped as it stands.
   */
  readonly requestStop: (
    job: Job & { readonly turnId: Turn.Id },
  ) => Effect.Effect<void, Store.Failure, Store.Transaction>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends-dev/core/turn/jobs/Service",
) {}

/**
 * For a host that runs no turn jobs: requests are accepted and nothing runs, so work waits in
 * agents' inboxes until something runs it.
 */
export const noRunner: Interface = Service.of({
  requestRun: () => Effect.void,
  requestStop: () => Effect.void,
});

/** @category layers */
export const layerNoRunner = Layer.succeed(Service, noRunner);

/** A turn store failure, as the commit a reaction runs in fails with it. */
const toStoreFailure = (failure: TurnStore.Failure) =>
  new Store.Failure({ operation: failure.operation, cause: failure.cause });

const decodeRecorded = Schema.decodeUnknownSync(
  Schema.Struct({
    activity: Schema.Struct({
      threadId: ThreadActivityFacts.Recorded.payload.fields.activity.fields.threadId,
    }),
    recipients: ThreadActivityFacts.Recorded.payload.fields.recipients,
  }),
);
const decodeEnded = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: TurnFacts.Completed.payload.fields.memberId,
    threadId: TurnFacts.Completed.payload.fields.threadId,
  }),
);
const decodeCancelRequested = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: TurnFacts.CancelRequested.payload.fields.memberId,
    threadId: TurnFacts.CancelRequested.payload.fields.threadId,
    turnId: TurnFacts.CancelRequested.payload.fields.turnId,
  }),
);
const decodeParticipationEnded = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: ThreadParticipationFacts.Ended.payload.fields.memberId,
    threadId: ThreadParticipationFacts.Ended.payload.fields.threadId,
    participationId: ThreadParticipationFacts.Ended.payload.fields.participationId,
  }),
);
const decodeGroupRemoval = Schema.decodeUnknownSync(
  Schema.Struct({
    memberId: GroupMembershipFacts.Removed.payload.fields.memberId,
    groupId: GroupMembershipFacts.Removed.payload.fields.groupId,
  }),
);

/** Each agent the activity asks for work runs it in the activity's thread. */
const runRequestedWork = Effect.fnUntraced(function* (event: Event.Record) {
  const turnJobs = yield* Service;
  const { activity, recipients } = decodeRecorded(event.payload);
  for (const { recipient, requestsWork } of recipients)
    if (requestsWork && Notification.Recipient.isAnyOf(["Agent"])(recipient))
      yield* turnJobs.requestRun({
        workspaceId: event.provenance.workspaceId,
        memberId: recipient.memberId,
        threadId: activity.threadId,
      });
});

/**
 * A turn that ended, or one created to run a turn again, has its job run: the work that waited for
 * the turn, or the new turn.
 */
const runWaitingWork = Effect.fnUntraced(function* (event: Event.Record) {
  const { memberId, threadId } = decodeEnded(event.payload);
  yield* (yield* Service).requestRun({
    workspaceId: event.provenance.workspaceId,
    memberId,
    threadId,
  });
});

/** A turn asked to stop has its job stop it. */
const stopCancelledTurn = Effect.fnUntraced(function* (event: Event.Record) {
  const { memberId, threadId, turnId } = decodeCancelRequested(event.payload);
  yield* (yield* Service).requestStop({
    workspaceId: event.provenance.workspaceId,
    memberId,
    threadId,
    turnId,
  });
});

/** A member that stopped taking part in a thread has its turn there stopped. */
const stopTurnOfEndedParticipation = Effect.fnUntraced(function* (event: Event.Record) {
  const { memberId, threadId, participationId } = decodeParticipationEnded(event.payload);
  const turnStore = yield* TurnStore.Service;
  const active = yield* Effect.mapError(turnStore.findActive(memberId, threadId), toStoreFailure);
  if (active._tag === "None" || active.value.participationId !== participationId) return;
  yield* (yield* Service).requestStop({
    workspaceId: event.provenance.workspaceId,
    memberId,
    threadId,
    turnId: active.value.id,
  });
});

/**
 * A member that left a group, or was removed from it or the workspace, has its turns in the
 * group's threads stopped, since leaving ended its participation in each. A person has none.
 */
const stopTurnsInLeftGroup = Effect.fnUntraced(function* (event: Event.Record) {
  const { memberId, groupId } = decodeGroupRemoval(event.payload);
  const turnStore = yield* TurnStore.Service;
  const turnJobs = yield* Service;
  const active = yield* Effect.mapError(turnStore.listActiveByMember(memberId), toStoreFailure);
  for (const turn of active)
    if (turn.groupId === groupId)
      yield* turnJobs.requestStop({
        workspaceId: event.provenance.workspaceId,
        memberId,
        threadId: turn.threadId,
        turnId: turn.id,
      });
});

/** The facts that change an agent's work in a thread request its job, in the commit that publishes them. */
export const reactions: ReadonlyArray<Reaction.Definition<Service | TurnStore.Service>> = [
  { fact: ThreadActivityFacts.Recorded.name, react: runRequestedWork },
  { fact: TurnFacts.Retried.name, react: runWaitingWork },
  { fact: TurnFacts.Completed.name, react: runWaitingWork },
  { fact: TurnFacts.Failed.name, react: runWaitingWork },
  { fact: TurnFacts.Cancelled.name, react: runWaitingWork },
  { fact: TurnFacts.CancelRequested.name, react: stopCancelledTurn },
  { fact: ThreadParticipationFacts.Ended.name, react: stopTurnOfEndedParticipation },
  { fact: GroupMembershipFacts.Removed.name, react: stopTurnsInLeftGroup },
];

export * as TurnJobs from "./jobs.ts";
