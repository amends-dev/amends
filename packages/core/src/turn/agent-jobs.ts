import { Context, Effect, Layer, Schema } from "effect";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import type { Event } from "../journal/event.ts";
import type { Reaction } from "../journal/reaction.ts";
import type { Store } from "../journal/store.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { ThreadParticipationFacts } from "../thread/participation/facts.ts";
import type { WorkspaceId } from "../workspace/id.ts";
import { MemberId } from "../workspace/member/id.ts";
import { TurnFacts } from "./facts.ts";

/** A request for an agent's job, naming the agent by its membership. */
export interface Request {
  readonly workspaceId: WorkspaceId.Id;
  readonly memberId: MemberId.Id;
}

/**
 * Agent jobs: requests for an agent to accept the work asked of it, or to stop its turns where it
 * no longer takes part, which `AgentWork` does. Hosts supply it and deliver each request to
 * whatever runs agent jobs; a host that runs none accepts requests and runs nothing, so work waits
 * in agents' inboxes.
 */
export interface Interface {
  /**
   * Request, as part of the caller's commit, that the agent accept its pending work: the request is
   * stored with the commit and discarded if it rolls back. Asking again in the same commit asks once.
   */
  readonly requestAcceptWork: (
    request: Request,
  ) => Effect.Effect<void, Store.Failure, Store.Transaction>;
  /** Request, likewise, that the member's turns stop where it no longer takes part. */
  readonly requestStopDepartedTurns: (
    request: Request,
  ) => Effect.Effect<void, Store.Failure, Store.Transaction>;
}
/** @effect-expect-leaking Transaction */
export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/agent-jobs/Service",
) {}

/**
 * For a host that runs no agent jobs: requests are accepted and nothing runs, so work waits in
 * agents' inboxes until something accepts it.
 */
export const noRunner: Interface = Service.of({
  requestAcceptWork: () => Effect.void,
  requestStopDepartedTurns: () => Effect.void,
});

/** @category layers */
export const layerNoRunner = Layer.succeed(Service, noRunner);

const decodeRecipients = Schema.decodeUnknownSync(
  Schema.Struct({ recipients: ThreadActivityFacts.Recorded.payload.fields.recipients }),
);
const decodeMember = Schema.decodeUnknownSync(Schema.Struct({ memberId: MemberId.Id }));

/** Each agent the activity asks for work accepts it. */
const acceptRequestedWork = Effect.fnUntraced(function* (event: Event.Record) {
  const agentJobs = yield* Service;
  for (const { recipient, requestsWork } of decodeRecipients(event.payload).recipients)
    if (requestsWork && recipient._tag === "Agent")
      yield* agentJobs.requestAcceptWork({
        workspaceId: event.provenance.workspaceId,
        memberId: recipient.memberId,
      });
});

/** The agent whose turn ended accepts the work that waited for it. */
const acceptWaitingWork = Effect.fnUntraced(function* (event: Event.Record) {
  yield* (yield* Service).requestAcceptWork({
    workspaceId: event.provenance.workspaceId,
    memberId: decodeMember(event.payload).memberId,
  });
});

/**
 * A member that stopped taking part, in a thread or in a whole group, stops its turns there. The
 * facts do not say whether the member is an agent; a person has no turns to stop.
 */
const stopDepartedTurns = Effect.fnUntraced(function* (event: Event.Record) {
  yield* (yield* Service).requestStopDepartedTurns({
    workspaceId: event.provenance.workspaceId,
    memberId: decodeMember(event.payload).memberId,
  });
});

/** The facts that change an agent's work request its job, in the commit that publishes them. */
export const reactions: ReadonlyArray<Reaction.Definition<Service>> = [
  { fact: ThreadActivityFacts.Recorded.name, react: acceptRequestedWork },
  { fact: TurnFacts.Completed.name, react: acceptWaitingWork },
  { fact: TurnFacts.Failed.name, react: acceptWaitingWork },
  { fact: TurnFacts.Cancelled.name, react: acceptWaitingWork },
  { fact: ThreadParticipationFacts.Ended.name, react: stopDepartedTurns },
  { fact: GroupMembershipFacts.Removed.name, react: stopDepartedTurns },
];

export * as AgentJobs from "./agent-jobs.ts";
