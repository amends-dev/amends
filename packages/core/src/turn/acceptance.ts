import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Agent } from "../agent/agent.ts";
import { AgentStore } from "../agent/store.ts";
import { Authorization } from "../authorization/authorization.ts";
import { BackgroundProcess } from "../background/process.ts";
import { GroupMembershipFacts } from "../group/membership/facts.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Performer } from "../identity/performer.ts";
import { Journal } from "../journal/journal.ts";
import type { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import { ThreadAccess } from "../thread/access.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { ThreadParticipationFacts } from "../thread/participation/facts.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { TurnFacts } from "./facts.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "TurnAcceptance.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound | Authorization.Denied>
  | AgentStore.Failure
  | MemberStore.Failure
  | NotificationStore.Failure
  | NotificationStore.Conflict
  | ThreadParticipationStore.Failure
  | TurnStore.Failure
  | TurnStore.Conflict
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.WriteError
  | Projection.Error
  | InvalidResponse;

export interface Interface {
  readonly workspaceId: Turn.Record["workspaceId"];
  /**
   * Handle every agent's pending work, as that agent: accept each thread's notifications into its
   * active turn there, or into a new one, settling them in the same commit, and leave them waiting
   * while an earlier turn there is still stopping. Stop the turns of agents that no longer take
   * part in their thread. Reports whether more is outstanding.
   */
  readonly run: Effect.Effect<BackgroundProcess.Outcome, Error, Publication.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/acceptance/Service",
) {}

/** How many notifications each agent's inbox is read by, per run. */
const page = 100;

/** @category constructors */
export const make = Effect.fn("TurnAcceptance.make")(function* () {
  const agents = yield* AgentStore.Service;
  const members = yield* MemberStore.Service;
  const notifications = yield* NotificationStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const turns = yield* TurnStore.Service;
  const access = yield* ThreadAccess.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = turns.workspaceId;
  if (
    [
      agents.workspaceId,
      members.workspaceId,
      notifications.workspaceId,
      participations.workspaceId,
      access.workspaceId,
      authorization.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({ message: "Turn services belong to different workspaces" });

  const decodeNotification = Schema.decodeEffect(Schema.toType(Notification.Record));
  const decodeParticipation = Schema.decodeEffect(Schema.toType(ThreadParticipation.Record));

  /** The agent as the actor and performer of what it does with its own work. */
  const asAgent = (agent: { readonly id: Agent.Id; readonly memberId: Member.Id }) => {
    const identity = Identity.MemberReference.cases.Agent.make({ id: agent.id });
    return <A, E, R>(effect: Effect.Effect<A, E, R>) =>
      effect.pipe(
        Publication.withPerformer(
          Performer.Reference.cases.Member.make({ memberId: agent.memberId, identity }),
        ),
        Effect.provideService(Actor.Service, { workspaceId, memberId: agent.memberId, identity }),
      );
  };

  /** Agents whose membership is active, with their inbox recipient. */
  const activeAgents = Effect.gen(function* () {
    const found: Array<{ readonly id: Agent.Id; readonly memberId: Member.Id }> = [];
    for (const stored of yield* agents.list) {
      const membership = yield* members.get(stored.memberId);
      if (Option.isSome(membership) && membership.value.status === "active")
        found.push({ id: stored.id, memberId: stored.memberId });
    }
    return found;
  });

  /**
   * Accept one thread's pending notifications for an agent, in one commit: recheck they are still
   * pending, then extend the active turn or create one.
   */
  const acceptThread = Effect.fnUntraced(function* (
    agent: { readonly id: Agent.Id; readonly memberId: Member.Id },
    threadId: Turn.Record["threadId"],
    ids: ReadonlyArray<Notification.Id>,
  ) {
    const recipient = Notification.ofMember(
      agent.memberId,
      Identity.MemberReference.cases.Agent.make({ id: agent.id }),
    );
    const pending: Array<Notification.Record & { readonly thread: Notification.ThreadReference }> =
      [];
    for (const id of ids) {
      const found = yield* notifications.get(id);
      if (Option.isNone(found)) continue;
      const record = yield* decodeNotification(found.value);
      if (
        record.state._tag === "Pending" &&
        record.recipient._tag === "Agent" &&
        record.recipient.memberId === agent.memberId &&
        record.thread?.threadId === threadId &&
        record.participationId !== undefined
      )
        pending.push(Object.assign(record, { thread: record.thread }));
    }
    const [first] = pending;
    if (first === undefined || recipient._tag !== "Agent") return;
    // The agent must still be able to open the thread; otherwise its work waits, as a person's
    // notification waits in their inbox, until its access or participation is settled.
    const thread = yield* access.require(threadId).pipe(
      Effect.asSome,
      Effect.catchTags({
        "ThreadAccess.NotFound": () => Effect.succeedNone,
        "Authorization.Denied": () => Effect.succeedNone,
      }),
    );
    if (Option.isNone(thread)) return;
    const through = Math.max(...pending.map((record) => record.thread.sequence));
    const notificationIds = pending.map((record) => record.id);
    const [head, ...rest] = notificationIds;
    if (head === undefined) return;
    const acceptedAt = yield* DateTime.now;
    const active = yield* turns.findActive(agent.memberId, threadId);
    if (Option.isSome(active)) {
      // A turn still stopping takes no more; the work waits for the next one.
      if (active.value.status === "cancelling") return;
      yield* journal.publish(TurnFacts.InputAccepted, {
        workspaceId,
        groupId: active.value.groupId,
        threadId,
        turnId: active.value.id,
        acceptedThroughSequence: Math.max(active.value.acceptedThroughSequence, through),
        notificationIds: [head, ...rest],
        acceptedAt,
      });
      return;
    }
    // The turn continues from this agent's previous turn in the same participation, fixed now so
    // its history never changes: input starts where that turn stopped taking it in, and what it
    // accepted but never took in is still this turn's to handle. After joining, input starts just
    // before the participation began and history comes from the thread.
    const participationId = pending.at(-1)!.participationId!;
    const participation = yield* participations.get(participationId);
    if (Option.isNone(participation))
      return yield* new InvalidResponse({ message: "Notification participation is missing" });
    const joined = yield* decodeParticipation(participation.value);
    const latest = yield* turns.findLatest(agent.memberId, threadId);
    const previous = Option.filter(latest, (turn) => turn.participationId === participationId);
    const boundary = Option.isSome(previous)
      ? previous.value.incorporatedThroughSequence
      : joined.joinedAtSequence - 1;
    const inputAfterSequence = Math.min(
      boundary,
      ...pending.map((record) => record.thread.sequence - 1),
    );
    const created: Turn.Record = {
      id: Turn.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      groupId: thread.value.groupId,
      threadId,
      agentId: agent.id,
      memberId: agent.memberId,
      participationId,
      previousTurnId: Option.isSome(previous) ? previous.value.id : null,
      retryOf: null,
      status: "queued",
      inputAfterSequence,
      acceptedThroughSequence: through,
      incorporatedThroughSequence: inputAfterSequence,
      selection: null,
      messageIds: [],
      failure: null,
      cancelReason: null,
      createdAt: acceptedAt,
      startedAt: null,
      finishedAt: null,
    };
    yield* journal.publish(
      TurnFacts.Created,
      Object.assign({}, created, { notificationIds: [head, ...rest] as const }),
    );
  });

  /**
   * Stop the active turns of agents whose participation ended: a queued one at once, since nothing
   * runs it yet; a running one by asking, which execution confirms once it has stopped.
   */
  const stopDeparted = Effect.gen(function* () {
    const active = yield* turns.listActive(page);
    for (const turn of active) {
      if (turn.status === "cancelling") continue;
      const found = yield* participations.get(turn.participationId);
      const participating =
        Option.isSome(found) && (yield* decodeParticipation(found.value)).status === "active";
      if (participating) continue;
      yield* Effect.gen(function* () {
        const current = yield* turns.get(turn.id);
        if (Option.isNone(current) || !Turn.active(current.value.status)) return;
        if (current.value.status === "cancelling") return;
        const at = yield* DateTime.now;
        const where = {
          workspaceId,
          groupId: turn.groupId,
          threadId: turn.threadId,
          turnId: turn.id,
        };
        yield* journal.publish(
          TurnFacts.CancelRequested,
          Object.assign({}, where, { reason: "participation-ended" as const, requestedAt: at }),
        );
        if (current.value.status === "queued")
          yield* journal.publish(TurnFacts.Cancelled, Object.assign({}, where, { finishedAt: at }));
      }).pipe(journal.commit);
    }
    return active.length === page;
  });

  const run = Effect.gen(function* () {
    let more = yield* stopDeparted;
    for (const agent of yield* activeAgents) {
      const recipient = Notification.ofMember(
        agent.memberId,
        Identity.MemberReference.cases.Agent.make({ id: agent.id }),
      );
      const listed = yield* notifications.listPendingByRecipient(recipient, { limit: page });
      if (listed.length === page) more = true;
      const byThread = new Map<Turn.Record["threadId"], Array<Notification.Id>>();
      for (const stored of listed) {
        const threadId = stored.thread?.threadId;
        if (threadId === undefined) continue;
        byThread.set(threadId, [...(byThread.get(threadId) ?? []), stored.id]);
      }
      for (const [threadId, ids] of byThread)
        yield* acceptThread(agent, threadId, ids).pipe(asAgent(agent), journal.commit);
    }
    return more ? BackgroundProcess.continuing : BackgroundProcess.idle;
  }).pipe(Effect.provideService(Crypto.Crypto, crypto));

  return Service.of({ workspaceId, run });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

/**
 * Agents take work as it is asked of them: activity that requests an agent's work, and a turn
 * ending, after which work that waited for it can be accepted.
 */
export const process = BackgroundProcess.make("turn.accept", {
  wakesOn: [
    BackgroundProcess.on(ThreadActivityFacts.Recorded, (payload) =>
      payload.recipients.some((recipient) => recipient.requestsWork),
    ),
    BackgroundProcess.on(TurnFacts.Completed),
    BackgroundProcess.on(TurnFacts.Failed),
    BackgroundProcess.on(TurnFacts.Cancelled),
    BackgroundProcess.on(ThreadParticipationFacts.Ended),
    BackgroundProcess.on(GroupMembershipFacts.Removed),
  ],
  run: Effect.flatMap(Service, (acceptance) => acceptance.run),
});

export * as TurnAcceptance from "./acceptance.ts";
