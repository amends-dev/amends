import { Context, Crypto, DateTime, Effect, Layer, Option } from "effect";
import type { PlatformError, Schema } from "effect";
import type { Agent } from "../agent/agent.ts";
import { AgentStore } from "../agent/store.ts";
import type { Authorization } from "../authorization/authorization.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Performer } from "../identity/performer.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import { ThreadQuery } from "../thread/query.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import type { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { TurnActivity } from "./activity.ts";
import { TurnCommand } from "./command.ts";
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
  | TurnCommand.EndError;

/**
 * What an agent's job does, for one agent at a time: take the work asked of it into turns, and stop
 * its turns where it no longer takes part. Each change is its own commit that rechecks what it
 * acts on, so a run cut short is simply run again.
 */
export interface Interface {
  /**
   * Accept the agent's pending work, as the agent: each thread's notifications go into its active
   * turn there, or into a new one, settling them in the same commit. Work waits while an earlier
   * turn there is still stopping or belongs to a participation that ended; that turn's end asks
   * for this again. A member that is not an active agent has no work to accept.
   */
  readonly acceptWork: (memberId: Member.Id) => Effect.Effect<void, Error>;
  /**
   * Stop the member's active turns in threads it no longer takes part in: a queued one at once,
   * since nothing runs it yet; a running one by asking, which its turn job confirms once it has
   * stopped. An agent that left the workspace has its turns stopped too, since leaving ends its
   * participation.
   */
  readonly stopDepartedTurns: (memberId: Member.Id) => Effect.Effect<void, Error>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/agent-work/Service",
) {}

/** Who stops an agent's turns after it departs: the product, not a member. */
export const departurePerformer = Performer.Reference.cases.System.make({
  id: Performer.SystemId.make("departed-turns"),
});

/** How many notifications an agent's inbox is read by at a time. */
const page = 100;

/** @category constructors */
export const make = Effect.fn("AgentWork.make")(function* () {
  const agentStore = yield* AgentStore.Service;
  const memberStore = yield* MemberStore.Service;
  const notificationStore = yield* NotificationStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const turnStore = yield* TurnStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const turnCommand = yield* TurnCommand.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  /** The agent with this membership, if it is an agent and still a member. */
  const findActiveAgent = Effect.fnUntraced(function* (memberId: Member.Id) {
    const agent = (yield* agentStore.list).find((stored) => stored.memberId === memberId);
    if (agent === undefined) return Option.none<Agent.Record>();
    const membership = yield* memberStore.get(memberId);
    return Option.isSome(membership) && membership.value.status === "active"
      ? Option.some(agent)
      : Option.none<Agent.Record>();
  });

  /**
   * Accept one thread's pending notifications for an agent, in one commit: recheck they are still
   * pending, then extend the active turn or create one.
   */
  const acceptThreadNotifications = Effect.fnUntraced(function* (
    agent: Agent.Record,
    threadId: Turn.Record["threadId"],
    ids: ReadonlyArray<Notification.Id>,
  ) {
    const pending: Array<Notification.Record & { readonly thread: Notification.ThreadReference }> =
      [];
    for (const id of ids) {
      const found = yield* notificationStore.get(id);
      if (Option.isNone(found)) continue;
      const record = found.value;
      if (
        Notification.State.isAnyOf(["Pending"])(record.state) &&
        Notification.Recipient.isAnyOf(["Agent"])(record.recipient) &&
        record.recipient.memberId === agent.memberId &&
        record.thread?.threadId === threadId &&
        record.participationId !== undefined
      )
        pending.push(Object.assign(record, { thread: record.thread }));
    }
    if (pending.length === 0) return;
    // The agent must still be able to open the thread; otherwise its work waits, as a person's
    // notification waits in their inbox, until its access or participation is settled.
    const thread = yield* threadQuery.requireAccess(threadId).pipe(
      Effect.asSome,
      Effect.catchTags({
        "ThreadQuery.NotFound": () => Effect.succeedNone,
        "Authorization.Denied": () => Effect.succeedNone,
      }),
    );
    if (Option.isNone(thread)) return;
    const through = Math.max(...pending.map((record) => record.thread.sequence));
    const notificationIds = pending.map((record) => record.id);
    const [head, ...rest] = notificationIds;
    if (head === undefined) return;
    const acceptedAt = yield* DateTime.now;
    const active = yield* turnStore.findActive(agent.memberId, threadId);
    if (Option.isSome(active)) {
      // A turn still stopping takes no more, nor does one whose participation ended, which is
      // stopped as departed: work asked of the agent since it took part anew belongs to that
      // participation. The work waits for the next turn, which the turn's end asks for.
      if (active.value.status === "cancelling") return;
      const participationId = active.value.participationId;
      if (pending.some((record) => record.participationId !== participationId)) return;
      const current = yield* threadParticipationStore.get(participationId);
      if (Option.isNone(current) || current.value.status !== "active") return;
      yield* journal.publish(TurnFacts.InputAccepted, {
        workspaceId,
        groupId: active.value.groupId,
        threadId,
        memberId: active.value.memberId,
        turnId: active.value.id,
        acceptedThroughSequence: Math.max(active.value.acceptedThroughSequence, through),
        notificationIds: [head, ...rest],
        acceptedAt,
      });
      return;
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
      ? TurnLog.read(yield* TurnLog.readTurnEntries(log, previous.value))
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
    yield* turnCommand.recordActivity(
      thread.value,
      TurnActivity.Created,
      { turnId: created.id, memberId: agent.memberId, retryOf: null },
      event,
    );
  });

  const acceptWork: Interface["acceptWork"] = Effect.fn("AgentWork.acceptWork")(
    function* (memberId: Member.Id) {
      const agent = yield* findActiveAgent(memberId);
      if (Option.isNone(agent)) return;
      const identity = Identity.MemberReference.cases.Agent.make({ id: agent.value.id });
      const actor = { workspaceId, memberId, identity };
      const provenance = yield* Publication.make(
        workspaceId,
        Performer.Reference.cases.Member.make({ memberId, identity }),
      );
      const recipient = Notification.ofMember(memberId, identity);
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
        for (const [threadId, ids] of byThread)
          yield* acceptThreadNotifications(agent.value, threadId, ids).pipe(
            Effect.provideService(Publication.Service, provenance),
            Effect.provideService(Actor.Service, actor),
            journal.commit,
          );
        const last = listed.at(-1);
        if (last === undefined || listed.length < page) return;
        after = { recordedAt: last.recordedAt, id: last.id };
      }
    },
    Effect.provideService(Crypto.Crypto, crypto),
  );

  const stopDepartedTurns: Interface["stopDepartedTurns"] = Effect.fn(
    "AgentWork.stopDepartedTurns",
  )(
    function* (memberId: Member.Id) {
      const active = (yield* turnStore.listActiveByMember(memberId)).filter(
        (turn) => turn.status !== "cancelling",
      );
      if (active.length === 0) return;
      const current = new Map(
        (yield* threadParticipationStore.getMany(active.map((turn) => turn.participationId))).map(
          (participation) => [participation.id as string, participation.status],
        ),
      );
      const provenance = yield* Publication.make(workspaceId, departurePerformer);
      for (const turn of active) {
        if (current.get(turn.participationId) === "active") continue;
        yield* Effect.gen(function* () {
          const found = yield* turnStore.get(turn.id);
          if (Option.isNone(found) || !Turn.active(found.value.status)) return;
          if (found.value.status === "cancelling") return;
          yield* turnCommand.requestStop(found.value, "participation-ended");
        }).pipe(Effect.provideService(Publication.Service, provenance), journal.commit);
      }
    },
    Effect.provideService(Crypto.Crypto, crypto),
  );

  return Service.of({ acceptWork, stopDepartedTurns });
});

/** @category layers */
export const layer = Layer.effect(Service, make());

export * as AgentWork from "./agent-work.ts";
