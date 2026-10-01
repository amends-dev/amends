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
import type { Event } from "../journal/event.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import { ThreadCommand } from "../thread/command.ts";
import type { ThreadId } from "../thread/id.ts";
import { ThreadQuery } from "../thread/query.ts";
import { ThreadStore } from "../thread/store.ts";
import { Thread } from "../thread/thread.ts";
import { ThreadActivityFacts } from "../thread/activity/facts.ts";
import type { ThreadMessageId } from "../thread/message/id.ts";
import { ThreadParticipationFacts } from "../thread/participation/facts.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { TurnActivity } from "./activity.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

/**
 * How a turn ended: completed with the replies it posted, failed and why, or stopped and why it
 * was asked to. Callers name the stop's reason, since the record they hold may predate the request.
 */
export type Ending =
  | { readonly outcome: "completed"; readonly messageIds: ReadonlyArray<ThreadMessageId.Id> }
  | { readonly outcome: "failed"; readonly reason: string }
  | { readonly outcome: "cancelled"; readonly cancelReason: Turn.CancelReason | null };

/** A turn's change, as its thread's timeline shows it. */
export type ActivityKind =
  | typeof TurnActivity.Created
  | typeof TurnActivity.Started
  | typeof TurnActivity.Stopping
  | typeof TurnActivity.Ended;

export type RecordError = ThreadCommand.Error | ThreadStore.Failure;
export type EndError = Projection.Error | Log.WriteError | RecordError;
export type AcceptError =
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
  | EndError;

export interface Interface {
  /**
   * Record a turn's change in its thread's timeline, in the caller's commit, caused by the turn
   * fact that reports it. It informs no one.
   */
  readonly recordActivity: <K extends ActivityKind>(
    thread: Thread.Record | ThreadId.Id,
    kind: K,
    details: K["details"]["Type"],
    cause: Event.Record,
  ) => Effect.Effect<void, RecordError, Store.Transaction | Publication.Service>;
  /**
   * End a turn in the caller's commit, everywhere it is told: its fact in the journal, its row in
   * its thread's timeline, and its agent's log for the thread, which so says how every turn there
   * ended. Callers check that the turn may end this way.
   */
  readonly endTurn: (
    turn: Turn.Record,
    ending: Ending,
  ) => Effect.Effect<void, EndError, Store.Transaction | Publication.Service>;
  /**
   * Ask an active turn to stop, in the caller's commit: a queued one ends cancelled at once, since
   * nothing runs it yet; a running one is marked stopping, which execution confirms once it has
   * stopped. Returns the turn as it now stands. Callers check it is active and not already stopping.
   */
  readonly requestStop: (
    turn: Turn.Record,
    reason: Turn.CancelReason,
  ) => Effect.Effect<Turn.Record, EndError, Store.Transaction | Publication.Service>;
  /**
   * Handle every agent's pending work, as that agent: accept each thread's notifications into its
   * active turn there, or into a new one, settling them in the same commit, and leave them waiting
   * while an earlier turn there is still stopping or belongs to a participation that ended.
   * Reports whether more is outstanding.
   */
  readonly acceptWork: Effect.Effect<BackgroundProcess.Outcome, AcceptError, Publication.Service>;
  /** Stop the turns of agents that no longer take part in their thread. */
  readonly stopDepartedTurns: Effect.Effect<
    BackgroundProcess.Outcome,
    AcceptError,
    Publication.Service
  >;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/command/Service",
) {}

/** How many notifications an agent's inbox is read by at a time, and threads accepted per run. */
const page = 100;

/** @category constructors */
export const make = Effect.fn("TurnCommand.make")(function* () {
  const agentStore = yield* AgentStore.Service;
  const memberStore = yield* MemberStore.Service;
  const notificationStore = yield* NotificationStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const threadStore = yield* ThreadStore.Service;
  const turnStore = yield* TurnStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const recordActivity: Interface["recordActivity"] = Effect.fnUntraced(
    function* (thread, kind, details, cause) {
      const found =
        typeof thread === "string" ? Option.getOrUndefined(yield* threadStore.get(thread)) : thread;
      if (found === undefined) return yield* Effect.die("A turn's thread is missing");
      const occurredAt = yield* DateTime.now;
      yield* threadCommand.publishActivity({
        thread: found,
        occurredAt,
        step: () => Effect.succeed({ value: undefined, kind, details, recipients: [], cause }),
      });
    },
  );

  const endTurn: Interface["endTurn"] = Effect.fnUntraced(function* (turn, ending) {
    const finishedAt = yield* DateTime.now;
    const where = {
      workspaceId: turn.workspaceId,
      groupId: turn.groupId,
      threadId: turn.threadId,
      turnId: turn.id,
    };
    const messageIds = ending.outcome === "completed" ? ending.messageIds : [];
    const reason = ending.outcome === "failed" ? ending.reason : null;
    const cancelReason = ending.outcome === "cancelled" ? ending.cancelReason : null;
    const event =
      ending.outcome === "completed"
        ? yield* journal.publish(
            TurnFacts.Completed,
            Object.assign(where, { messageIds, finishedAt }),
          )
        : ending.outcome === "failed"
          ? yield* journal.publish(
              TurnFacts.Failed,
              Object.assign(where, { reason: ending.reason, finishedAt }),
            )
          : yield* journal.publish(TurnFacts.Cancelled, Object.assign(where, { finishedAt }));
    yield* recordActivity(
      turn.threadId,
      TurnActivity.Ended,
      { turnId: turn.id, outcome: ending.outcome, messageIds, reason, cancelReason },
      event,
    );
    yield* TurnLog.open(log, turn.participationId).append({
      _tag: "Ended",
      turnId: turn.id,
      outcome: ending.outcome,
      reason,
      cancelReason,
      messageIds,
    });
  });

  const requestStop: Interface["requestStop"] = Effect.fnUntraced(function* (turn, reason) {
    const requestedAt = yield* DateTime.now;
    const requested = yield* journal.publish(TurnFacts.CancelRequested, {
      workspaceId,
      groupId: turn.groupId,
      threadId: turn.threadId,
      turnId: turn.id,
      reason,
      requestedAt,
    });
    if (turn.status === "queued") {
      yield* endTurn(turn, { outcome: "cancelled", cancelReason: reason });
      return Turn.change(turn, {
        status: "cancelled",
        cancelReason: reason,
        finishedAt: requestedAt,
      });
    }
    yield* recordActivity(
      turn.threadId,
      TurnActivity.Stopping,
      { turnId: turn.id, cancelReason: reason },
      requested,
    );
    return Turn.change(turn, { status: "cancelling", cancelReason: reason });
  });

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
    for (const stored of yield* agentStore.list) {
      const membership = yield* memberStore.get(stored.memberId);
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
      const found = yield* notificationStore.get(id);
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
    const active = yield* turnStore.findActive(agent.memberId, threadId);
    if (Option.isSome(active)) {
      // A turn still stopping takes no more, nor does one whose participation ended, which is
      // stopped as departed: work asked of the agent since it took part anew belongs to that
      // participation. The work waits for the next turn, which the turn's end wakes this for.
      if (active.value.status === "cancelling") return false;
      const participationId = active.value.participationId;
      if (pending.some((record) => record.participationId !== participationId)) return false;
      const current = yield* threadParticipationStore.get(participationId);
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
    const participation = yield* threadParticipationStore.get(participationId);
    if (Option.isNone(participation))
      return yield* Effect.die("A pending notification's participation is missing");
    const joined = participation.value;
    const latest = yield* turnStore.findLatest(agent.memberId, threadId);
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
    yield* recordActivity(
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
  const stopDepartedTurns = Effect.gen(function* () {
    for (const agent of yield* agentStore.list) {
      const active = (yield* turnStore.listActiveByMember(agent.memberId)).filter(
        (turn) => turn.status !== "cancelling",
      );
      if (active.length === 0) continue;
      const current = new Map(
        (yield* threadParticipationStore.getMany(active.map((turn) => turn.participationId))).map(
          (participation) => [participation.id as string, participation.status],
        ),
      );
      for (const turn of active) {
        if (current.get(turn.participationId) === "active") continue;
        yield* Effect.gen(function* () {
          const found = yield* turnStore.get(turn.id);
          if (Option.isNone(found) || !Turn.active(found.value.status)) return;
          if (found.value.status === "cancelling") return;
          yield* requestStop(found.value, "participation-ended");
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
  const acceptWork = Effect.gen(function* () {
    let accepted = 0;
    for (const agent of yield* activeAgents) {
      const recipient = Notification.ofMember(
        agent.memberId,
        Identity.MemberReference.cases.Agent.make({ id: agent.id }),
      );
      let after: NotificationStore.Cursor | undefined;
      for (;;) {
        const listed = yield* notificationStore.listPendingByRecipient(
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
    recordActivity,
    endTurn,
    requestStop,
    acceptWork,
    stopDepartedTurns: stopDepartedTurns.pipe(Effect.provideService(Crypto.Crypto, crypto)),
  });
});

/** Internal writes shared by turn operations, execution, and background work. @category layers */
export const layer = Layer.effect(Service, make());

/**
 * Agents take work as it is asked of them: activity that requests an agent's work, and a turn
 * ending, after which work that waited for it can be accepted.
 */
export const acceptWorkProcess = BackgroundProcess.make("turn.accept", {
  wakesOn: [
    BackgroundProcess.on(ThreadActivityFacts.Recorded, (payload) =>
      payload.recipients.some((recipient) => recipient.requestsWork),
    ),
    BackgroundProcess.on(TurnFacts.Completed),
    BackgroundProcess.on(TurnFacts.Failed),
    BackgroundProcess.on(TurnFacts.Cancelled),
  ],
  run: Effect.flatMap(Service, (turnCommand) => turnCommand.acceptWork),
});

/** Agents stop working where they no longer take part: after they unfollow a thread or leave a group. */
export const stopDepartedProcess = BackgroundProcess.make("turn.stop-departed", {
  wakesOn: [
    BackgroundProcess.on(ThreadParticipationFacts.Ended),
    BackgroundProcess.on(GroupMembershipFacts.Removed),
  ],
  run: Effect.flatMap(Service, (turnCommand) => turnCommand.stopDepartedTurns),
});

export * as TurnCommand from "./command.ts";
