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
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import { ThreadQuery } from "../thread/query.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import { ThreadParticipationFacts } from "../thread/participation/facts.ts";

import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { TurnActivity } from "./activity.ts";
import { TurnActivityRecorder } from "./activity-recorder.ts";
import { TurnEnding } from "./ending.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

export type Error =
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound | Authorization.Denied>
  | AgentStore.Failure
  | MemberStore.Failure
  | NotificationStore.Failure
  | NotificationStore.Conflict
  | ThreadParticipationStore.Failure
  | TurnStore.Failure
  | TurnStore.Conflict
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Log.ReadError
  | Log.WriteError
  | TurnActivityRecorder.Error
  | TurnEnding.Error
  | Projection.Error;

export interface Interface {
  /**
   * Handle every agent's pending work, as that agent: accept each thread's notifications into its
   * active turn there, or into a new one, settling them in the same commit, and leave them waiting
   * while an earlier turn there is still stopping or belongs to a participation that ended.
   * Reports whether more is outstanding.
   */
  readonly run: Effect.Effect<BackgroundProcess.Outcome, Error, Publication.Service>;
  /** Stop the turns of agents that no longer take part in their thread. */
  readonly stopDeparted: Effect.Effect<BackgroundProcess.Outcome, Error, Publication.Service>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/acceptance/Service",
) {}

/** How many notifications an agent's inbox is read by at a time, and threads accepted per run. */
const page = 100;

/** @category constructors */
export const make = Effect.fn("TurnAcceptance.make")(function* () {
  const agents = yield* AgentStore.Service;
  const members = yield* MemberStore.Service;
  const notifications = yield* NotificationStore.Service;
  const participations = yield* ThreadParticipationStore.Service;
  const turns = yield* TurnStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const activity = yield* TurnActivityRecorder.Service;
  const ending = yield* TurnEnding.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

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
      const record = found.value;
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
    if (first === undefined || recipient._tag !== "Agent") return false;
    // The agent must still be able to open the thread; otherwise its work waits, as a person's
    // notification waits in their inbox, until its access or participation is settled.
    const thread = yield* threadQuery.requireAccess(threadId).pipe(
      Effect.asSome,
      Effect.catchTags({
        "ThreadQuery.NotFound": () => Effect.succeedNone,
        "Authorization.Denied": () => Effect.succeedNone,
      }),
    );
    if (Option.isNone(thread)) return false;
    const through = Math.max(...pending.map((record) => record.thread.sequence));
    const notificationIds = pending.map((record) => record.id);
    const [head, ...rest] = notificationIds;
    if (head === undefined) return false;
    const acceptedAt = yield* DateTime.now;
    const active = yield* turns.findActive(agent.memberId, threadId);
    if (Option.isSome(active)) {
      // A turn still stopping takes no more, nor does one whose participation ended, which is
      // stopped as departed: work asked of the agent since it took part anew belongs to that
      // participation. The work waits for the next turn, which the turn's end wakes this for.
      if (active.value.status === "cancelling") return false;
      const participationId = active.value.participationId;
      if (pending.some((record) => record.participationId !== participationId)) return false;
      const current = yield* participations.get(participationId);
      if (Option.isNone(current) || current.value.status !== "active") return false;
      yield* journal.publish(TurnFacts.InputAccepted, {
        workspaceId,
        groupId: active.value.groupId,
        threadId,
        turnId: active.value.id,
        acceptedThroughSequence: Math.max(active.value.acceptedThroughSequence, through),
        notificationIds: [head, ...rest],
        acceptedAt,
      });
      return true;
    }
    // Input starts where this agent's previous turn in the same participation stopped taking it
    // in, as its entries say, so what it accepted but never took in is still this turn's to
    // handle; after joining, just before the participation began. The turn's entries follow what
    // the agent's log for the thread holds now, and its history starts from that log's latest
    // checkpoint: the previous turn's own, or the one it started from.
    const participationId = pending.at(-1)!.participationId!;
    const participation = yield* participations.get(participationId);
    if (Option.isNone(participation))
      return yield* Effect.die("A pending notification's participation is missing");
    const joined = participation.value;
    const latest = yield* turns.findLatest(agent.memberId, threadId);
    const previous = Option.filter(latest, (turn) => turn.participationId === participationId);
    const prior = Option.isSome(previous)
      ? TurnLog.read(yield* TurnLog.entriesOf(log, previous.value))
      : undefined;
    const boundary = Option.isSome(previous)
      ? prior!.incorporatedThrough(previous.value.inputAfterSequence)
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
      logAfter: Option.getOrNull(yield* TurnLog.open(log, participationId).head),
      historyFrom: Option.isSome(previous)
        ? (prior!.checkpoint ?? previous.value.historyFrom)
        : null,
      retryOf: null,
      status: "queued",
      inputAfterSequence,
      acceptedThroughSequence: through,
      selection: null,
      messageIds: [],
      failure: null,
      cancelReason: null,
      createdAt: acceptedAt,
      startedAt: null,
      finishedAt: null,
    };
    const event = yield* journal.publish(
      TurnFacts.Created,
      Object.assign({}, created, { notificationIds: [head, ...rest] as const }),
    );
    yield* activity.record(
      thread.value,
      TurnActivity.Created,
      { turnId: created.id, memberId: agent.memberId, retryOf: null },
      event,
    );
    return true;
  });

  /**
   * Stop the active turns of agents whose participation ended: a queued one at once, since nothing
   * runs it yet; a running one by asking, which execution confirms once it has stopped. Each
   * agent's own active turns are checked, including agents no longer members, since leaving the
   * workspace ends their participation too. Every run handles all of them.
   */
  const stopDeparted = Effect.gen(function* () {
    for (const agent of yield* agents.list) {
      const active = (yield* turns.listActiveByMember(agent.memberId)).filter(
        (turn) => turn.status !== "cancelling",
      );
      if (active.length === 0) continue;
      const current = new Map(
        (yield* participations.getMany(active.map((turn) => turn.participationId))).map(
          (participation) => [participation.id as string, participation.status],
        ),
      );
      for (const turn of active) {
        if (current.get(turn.participationId) === "active") continue;
        yield* Effect.gen(function* () {
          const found = yield* turns.get(turn.id);
          if (Option.isNone(found) || !Turn.active(found.value.status)) return;
          if (found.value.status === "cancelling") return;
          const at = yield* DateTime.now;
          const where = {
            workspaceId,
            groupId: turn.groupId,
            threadId: turn.threadId,
            turnId: turn.id,
          };
          const requested = yield* journal.publish(
            TurnFacts.CancelRequested,
            Object.assign({}, where, { reason: "participation-ended" as const, requestedAt: at }),
          );
          if (found.value.status !== "queued")
            yield* activity.record(
              turn.threadId,
              TurnActivity.Stopping,
              { turnId: turn.id, cancelReason: "participation-ended" },
              requested,
            );
          else
            yield* ending.end(found.value, {
              outcome: "cancelled",
              cancelReason: "participation-ended",
            });
        }).pipe(journal.commit);
      }
    }
    return BackgroundProcess.idle;
  });

  /**
   * Accept every active agent's pending work, reading each agent's inbox a page at a time. Work
   * that waits is passed over, not read again in the same run. After accepting work for `page`
   * threads the run stops and reports more outstanding, which only accepting can cause, so a run
   * that finds only waiting work ends idle rather than running again at once.
   */
  const run = Effect.gen(function* () {
    let accepted = 0;
    for (const agent of yield* activeAgents) {
      const recipient = Notification.ofMember(
        agent.memberId,
        Identity.MemberReference.cases.Agent.make({ id: agent.id }),
      );
      let after: NotificationStore.Cursor | undefined;
      for (;;) {
        const listed = yield* notifications.listPendingByRecipient(
          recipient,
          after === undefined ? { limit: page } : { after, limit: page },
        );
        const byThread = new Map<Turn.Record["threadId"], Array<Notification.Id>>();
        for (const stored of listed) {
          const threadId = stored.thread?.threadId;
          if (threadId === undefined) continue;
          byThread.set(threadId, [...(byThread.get(threadId) ?? []), stored.id]);
        }
        for (const [threadId, ids] of byThread) {
          if (yield* acceptThread(agent, threadId, ids).pipe(asAgent(agent), journal.commit))
            accepted += 1;
          if (accepted >= page) return BackgroundProcess.continuing;
        }
        const last = listed.at(-1);
        if (last === undefined || listed.length < page) break;
        after = { recordedAt: last.recordedAt, id: last.id };
      }
    }
    return BackgroundProcess.idle;
  }).pipe(Effect.provideService(Crypto.Crypto, crypto));

  return Service.of({
    run,
    stopDeparted: stopDeparted.pipe(Effect.provideService(Crypto.Crypto, crypto)),
  });
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
  ],
  run: Effect.flatMap(Service, (acceptance) => acceptance.run),
});

/** Agents stop working where they no longer take part: after they unfollow a thread or leave a group. */
export const departures = BackgroundProcess.make("turn.stop-departed", {
  wakesOn: [
    BackgroundProcess.on(ThreadParticipationFacts.Ended),
    BackgroundProcess.on(GroupMembershipFacts.Removed),
  ],
  run: Effect.flatMap(Service, (acceptance) => acceptance.stopDeparted),
});

export * as TurnAcceptance from "./acceptance.ts";
