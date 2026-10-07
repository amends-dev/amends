import { Agent, type Session, type StreamPart } from "@amends/harness-v2";
import { Context, Crypto, Data, DateTime, Effect, Layer, Option, Result, Schema } from "effect";
import type { PlatformError } from "effect";
import type { Prompt } from "effect/ai";
import type { AgentV2 } from "../agent-v2/agent.ts";
import { AgentV2Query } from "../agent-v2/query.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
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
import { SignalHub } from "../signal/hub.ts";
import { ThreadActivityKind } from "../thread/activity/kind.ts";
import { ThreadActivityStore } from "../thread/activity/store.ts";
import { ThreadCommand } from "../thread/command.ts";
import type { ThreadId } from "../thread/id.ts";
import { ThreadMessageActivity } from "../thread/message/activity.ts";
import { ThreadMessage } from "../thread/message/message.ts";
import { ThreadMessagePermissions } from "../thread/message/permissions.ts";
import { ThreadMessageStore } from "../thread/message/store.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { ThreadQuery } from "../thread/query.ts";
import type { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { NotActive, NotFound } from "./errors.ts";
import { TurnActivity } from "./activity.ts";
import { TurnCommand } from "./command.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnPrompt } from "./prompt.ts";
import { SessionStateStore } from "./session-state-store.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

export type Error =
  | TurnStore.Failure
  | Log.ReadError
  | Log.WriteError
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Projection.Error
  | SessionStateStore.Failure
  | NotFound
  | NotActive
  | TurnCommand.EndError;
export type StartError =
  | Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound | Authorization.Denied>
  | NotificationStore.Failure
  | MemberStore.Failure
  | ThreadParticipationStore.Failure
  | ThreadActivityStore.Failure
  | ThreadMessageStore.Failure
  | AgentV2Query.BuildError;
export type CloseError =
  | Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound | Authorization.Denied>
  | ThreadQuery.ParticipantsError
  | ThreadCommand.Error;

/** Where a turn's harness session starts: from the state its last turn saved, or anew. */
export type SessionStart =
  | { readonly resumeFrom: Session.SessionState }
  | {
      /** The participation's id, which names the session and the sandbox it works in. */
      readonly id: Agent.SessionId;
      /** The thread's messages before the agent took part, which the session starts with. */
      readonly history: Prompt.Prompt;
    };

/**
 * What a turn's job runs: nothing, since no work waits for the agent in the thread, or what
 * waited ended as it stood; or a turn, ready to run as the agent is set up for it.
 */
export type Start = Data.TaggedEnum<{
  Idle: {};
  Ready: {
    readonly turn: Turn.Record;
    readonly runnable: AgentV2Query.Runnable;
    readonly session: SessionStart;
    readonly prompt: Prompt.UserMessage;
  };
}>;
export const Start = Data.taggedEnum<Start>();

/**
 * How closing went: the turn completed, posting the agent's answer if it had one; it stopped as
 * it was asked to; or the agent could no longer post where it worked, which failed it.
 */
export type Closing = Data.TaggedEnum<{
  Closed: { readonly messageIds: ReadonlyArray<ThreadMessage.Id> };
  Stopped: {};
  Failed: { readonly reason: string };
}>;
export const Closing = Data.taggedEnum<Closing>();

/**
 * What a turn's job does with a turn: start it, record each step it takes, show what it is
 * writing, and end it. Each change is its own commit, attributed to the turn's agent. Execution is
 * trusted: it runs what the agent accepted, and closing checks the agent's own access before
 * posting for it.
 */
export interface Interface {
  /**
   * Start the agent's work in the thread: its active turn, or, while it has none, a new one that
   * accepts the work its notifications from the thread ask for, settling them. A turn asked to
   * stop, or whose participation ended, ends as it stands. A turn starts on what `AgentV2Query`
   * selects for it, kept when it runs again, and a turn that cannot run fails. A queued turn
   * starts, recording the prompt in its log; a running one, which a run cut short left, runs
   * again from its prompt, which its log notes.
   */
  readonly start: (job: {
    readonly memberId: Member.Id;
    readonly threadId: ThreadId.Id;
  }) => Effect.Effect<Start, StartError>;
  /** Record a step the turn finished, which `id` names as its drafts did. */
  readonly recordStep: (
    turnId: Turn.Id,
    step: { readonly id: string; readonly step: StreamPart.Step },
  ) => Effect.Effect<void, Error>;
  /**
   * Show the turn's readers more of a step before it finishes, as a signal: nothing is recorded,
   * and a turn no longer running shows nothing.
   */
  readonly showDraft: (
    turnId: Turn.Id,
    piece: {
      readonly responseId: string;
      readonly part: number;
      readonly offset: number;
      readonly text: string;
    },
  ) => Effect.Effect<void, Error>;
  /**
   * Close a turn whose harness turn finished, with the session as it left it: post its answer,
   * the text of its last step, as the agent's reply to the thread's current participants, save
   * the session, and record completion, in one commit. A turn asked to stop meanwhile stops
   * instead, keeping the session.
   */
  readonly close: (
    turnId: Turn.Id,
    state: Session.SessionState,
  ) => Effect.Effect<Closing, CloseError>;
  /** The turn could not go on, for `reason`; a session it started is saved as it was left. */
  readonly fail: (
    turnId: Turn.Id,
    failure: { readonly reason: string; readonly state?: Session.SessionState | undefined },
  ) => Effect.Effect<void, Error | ThreadParticipationStore.Failure>;
  /**
   * End a turn its job stopped, or that it was not running, keeping a session it started: one
   * asked to stop, or whose participation ended. Any other turn is left as it is.
   */
  readonly confirmStopped: (
    turnId: Turn.Id,
    state: Session.SessionState | undefined,
  ) => Effect.Effect<void, Error | ThreadParticipationStore.Failure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/execution/Service",
) {}

/** How many activities one read takes; reads go on until the range is done. */
const pageSize = 100;

/** Why the agent cannot run, as the turn that failed for it says. */
const describeIssue = (issue: AgentV2.Issue): string => {
  switch (issue._tag) {
    case "Removed":
      return `The connection for the agent's ${issue.part} was removed.`;
    case "Uninstalled":
      return `The integration of the agent's ${issue.part} connection is not installed here.`;
    case "Invalid":
      return issue.description;
    case "SandboxRequired":
      return "The agent's harness works only in a sandbox, and the agent has none.";
    case "NoHarness":
      return "No connection gives a harness the agent can run on.";
  }
};

/** @category constructors */
export const make = Effect.fn("TurnExecution.make")(function* () {
  const turnStore = yield* TurnStore.Service;
  const sessionStateStore = yield* SessionStateStore.Service;
  const notificationStore = yield* NotificationStore.Service;
  const memberStore = yield* MemberStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const turnCommand = yield* TurnCommand.Service;
  const agentV2Query = yield* AgentV2Query.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const signalHub = yield* SignalHub.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const requireTurn = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turnStore.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    return found.value;
  });
  const requireStatus = (turn: Turn.Record, statuses: ReadonlyArray<Turn.Status>) =>
    statuses.includes(turn.status)
      ? Effect.void
      : Effect.fail(new NotActive({ turnId: turn.id, status: turn.status }));

  /** Run `step` as the agent `identity` of membership `memberId`, attributed to it, in its own commit. */
  const asAgent =
    (memberId: Member.Id, identity: Identity.MemberReference) =>
    <A, E, R>(step: Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const provenance = yield* Publication.make(
          workspaceId,
          Performer.Reference.cases.Member.make({ memberId, identity }),
        );
        return yield* step.pipe(
          Effect.provideService(Publication.Service, provenance),
          Effect.provideService(Actor.Service, { workspaceId, memberId, identity }),
        );
      }).pipe(Effect.provideService(Crypto.Crypto, crypto), journal.commit);
  /** Run `step` with the turn as stored, as its agent, in its own commit. */
  const asTurnAgent =
    (turnId: Turn.Id) =>
    <A, E, R>(step: (turn: Turn.Record) => Effect.Effect<A, E, R>) =>
      Effect.flatMap(requireTurn(turnId), (stored) =>
        asAgent(
          stored.memberId,
          Identity.MemberReference.cases.Agent.make({ id: stored.agentId }),
        )(Effect.flatMap(requireTurn(turnId), step)),
      );

  /** Whether the participation the turn's input came through has ended. */
  const hasDeparted = Effect.fnUntraced(function* (turn: Turn.Record) {
    const participation = yield* threadParticipationStore.get(turn.participationId);
    return Option.isNone(participation) || participation.value.status !== "active";
  });

  /** Keep the session the turn left, which the agent's next turn in the thread resumes. */
  const saveSession = (turn: Turn.Record, state: Session.SessionState) =>
    turn.selection === null
      ? Effect.die("A turn that ran a session has no selection")
      : sessionStateStore.set(turn.participationId, {
          state,
          promptedThroughSequence: turn.acceptedThroughSequence,
          selection: turn.selection,
        });

  /** The thread's messages in a range of positions, oldest first, read a page at a time. */
  const readMessagesBetween = Effect.fnUntraced(function* (
    threadId: ThreadId.Id,
    range: { readonly after: number; readonly through: number },
  ) {
    if (range.through < 1 || range.after >= range.through) return [];
    const published: Array<ThreadActivityKind.Activity<typeof ThreadMessageActivity.Published>> =
      [];
    let after = range.after;
    for (;;) {
      const page = yield* threadActivityStore.readPage(threadId, {
        afterSequence: after,
        beforeSequence: range.through + 1,
        from: "oldest",
        limit: pageSize,
      });
      for (const activity of page)
        if (ThreadActivityKind.is(ThreadMessageActivity.Published)(activity))
          published.push(
            yield* Effect.orDie(
              ThreadActivityKind.decode(ThreadMessageActivity.Published, activity),
            ),
          );
      const last = page.at(-1);
      if (last === undefined || page.length < pageSize || last.sequence >= range.through) break;
      after = last.sequence;
    }
    const found = new Map(
      (yield* threadMessageStore.getMany(published.map(({ details }) => details.messageId))).map(
        (message) => [message.id as string, message],
      ),
    );
    return published.flatMap(({ details }) => {
      const message = found.get(details.messageId);
      return message === undefined ? [] : [message];
    });
  });

  /** What members are called, as the agent is told; a member without a name is "A member". */
  const readNames = Effect.fnUntraced(function* (memberIds: ReadonlyArray<Member.Id>) {
    const members = yield* memberStore.getMany([...new Set(memberIds)]);
    const names = new Map(members.map((member) => [member.id as string, member.name]));
    return (memberId: Member.Id) => names.get(memberId) ?? "A member";
  });

  /** The thread's messages in a range, as the agent `memberId` is told them. */
  const readSaid = Effect.fnUntraced(function* (
    memberId: Member.Id,
    threadId: ThreadId.Id,
    range: { readonly after: number; readonly through: number },
  ) {
    const messages = yield* readMessagesBetween(threadId, range);
    const nameOf = yield* readNames(
      messages.flatMap(({ author }) =>
        ThreadMessage.Author.isAnyOf(["Member"])(author) ? [author.memberId] : [],
      ),
    );
    return messages.map(({ author, text }): TurnPrompt.Said =>
      ThreadMessage.Author.isAnyOf(["Member"])(author)
        ? { author: nameOf(author.memberId), own: author.memberId === memberId, text }
        : { author: "A contact", own: false, text },
    );
  });

  /**
   * Accept the agent's pending work in the thread into a new turn, settling the notifications
   * that ask for it, or none while none is pending or the agent can no longer open the thread,
   * where the work waits, as a person's notification waits in their inbox.
   */
  const acceptWork = Effect.fnUntraced(function* (
    member: Member.Record & { readonly identity: { readonly _tag: "Agent" } },
    threadId: ThreadId.Id,
  ) {
    const pending = (yield* notificationStore.listPendingByThread(
      Notification.ofMember(member.id, member.identity),
      threadId,
      Number.MAX_SAFE_INTEGER,
    )).flatMap((record) =>
      record.thread === undefined || record.participationId === undefined
        ? []
        : [
            {
              id: record.id,
              sequence: record.thread.sequence,
              participationId: record.participationId,
            },
          ],
    );
    const latest = pending.at(-1);
    if (latest === undefined) return undefined;
    // Notifications of an ended participation are settled with it, so all pending are the current one's.
    const accepted = pending.filter(
      ({ participationId }) => participationId === latest.participationId,
    );
    const thread = yield* threadQuery.requireAccess(threadId).pipe(
      Effect.asSome,
      Effect.catchTags({
        "ThreadQuery.NotFound": () => Effect.succeedNone,
        "Authorization.Denied": () => Effect.succeedNone,
      }),
    );
    if (Option.isNone(thread)) return undefined;
    const [head, ...rest] = accepted.map(({ id }) => id);
    if (head === undefined) return undefined;
    const createdAt = yield* DateTime.now;
    const created: Turn.Record = {
      id: Turn.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      groupId: thread.value.groupId,
      threadId,
      agentId: member.identity.id,
      memberId: member.id,
      participationId: latest.participationId,
      retry: null,
      status: "queued",
      acceptedThroughSequence: Math.max(...accepted.map(({ sequence }) => sequence)),
      selection: null,
      messageIds: [],
      failure: null,
      cancelReason: null,
      createdAt,
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
      { turnId: created.id, memberId: member.id, retryOf: null },
      event,
    );
    return created;
  });

  /** End `turn` as it stands, so its job has nothing to run: `Idle`. */
  const endAsIdle = (turn: Turn.Record, ending: TurnCommand.Ending) =>
    Effect.as(turnCommand.endTurn(turn, ending), Start.Idle());

  /** What `turn` runs on: its selection once started, and otherwise what is selected now. */
  const selectionOf = Effect.fnUntraced(function* (turn: Turn.Record) {
    if (turn.selection !== null) return turn.selection;
    const saved = yield* sessionStateStore.get(turn.participationId);
    return yield* agentV2Query.select(
      turn.memberId,
      Option.getOrUndefined(Option.map(saved, ({ selection }) => selection)),
    );
  });

  const start: Interface["start"] = Effect.fn("TurnExecution.start")(function* (job) {
    const member = yield* memberStore.get(job.memberId);
    if (
      Option.isNone(member) ||
      member.value.status !== "active" ||
      !Identity.MemberReference.isAnyOf(["Agent"])(member.value.identity)
    )
      return Start.Idle();
    const agent = Object.assign(member.value, { identity: member.value.identity });
    return yield* asAgent(
      agent.id,
      agent.identity,
    )(
      Effect.gen(function* () {
        const active = yield* turnStore.findActive(agent.id, job.threadId);
        const turn = Option.isSome(active) ? active.value : yield* acceptWork(agent, job.threadId);
        if (turn === undefined) return Start.Idle();
        if (turn.status === "cancelling")
          return yield* endAsIdle(turn, {
            outcome: "cancelled",
            cancelReason: turn.cancelReason ?? "requested",
          });
        if (yield* hasDeparted(turn))
          return yield* endAsIdle(turn, {
            outcome: "cancelled",
            cancelReason: "participation-ended",
          });
        const failWithIssues = (incomplete: { readonly issues: ReadonlyArray<AgentV2.Issue> }) =>
          endAsIdle(turn, {
            outcome: "failed",
            reason: incomplete.issues.map(describeIssue).join(" "),
          });
        const ready = yield* Effect.gen(function* () {
          const selection = yield* selectionOf(turn);
          const runnable = yield* agentV2Query.buildRunnable(turn.memberId, selection);
          return { selection, runnable };
        }).pipe(
          Effect.map(Option.some),
          Effect.catchTags({
            "AgentV2Service.Incomplete": (incomplete) =>
              Effect.as(failWithIssues(incomplete), Option.none()),
            "AgentV2Query.NotFound": () =>
              Effect.as(
                endAsIdle(turn, { outcome: "failed", reason: "The agent can no longer run." }),
                Option.none(),
              ),
          }),
        );
        if (Option.isNone(ready)) return Start.Idle();
        const { selection, runnable } = ready.value;

        const participation = yield* threadParticipationStore.get(turn.participationId);
        if (Option.isNone(participation))
          return yield* Effect.die("A turn's participation is missing");
        const saved = yield* sessionStateStore.get(turn.participationId);
        const promptedThrough = Option.match(saved, {
          onNone: () => participation.value.joinedAtSequence - 1,
          onSome: ({ promptedThroughSequence }) => promptedThroughSequence,
        });
        const said = yield* readSaid(turn.memberId, turn.threadId, {
          after: promptedThrough,
          through: turn.acceptedThroughSequence,
        });
        const retriedBy =
          turn.retry === null ? undefined : (yield* readNames([turn.retry.by]))(turn.retry.by);
        const prompt = TurnPrompt.promptOf(said, retriedBy);
        // Nothing to say, as when what the turn accepted was all the agent's own.
        if (prompt === undefined)
          return yield* endAsIdle(turn, { outcome: "completed", messageIds: [] });
        const session: SessionStart = Option.isSome(saved)
          ? { resumeFrom: saved.value.state }
          : {
              id: Agent.SessionId.make(turn.participationId),
              history: TurnPrompt.historyOf(
                yield* readSaid(turn.memberId, turn.threadId, {
                  after: 0,
                  through: promptedThrough,
                }),
              ),
            };

        const handle = TurnLog.open(log, turn.id);
        if (turn.status === "running") {
          yield* handle.append({
            _tag: "Interrupted",
            reason: "The turn's run stopped before it finished, and it runs again from its prompt.",
          });
          return Start.Ready({ turn, runnable, session, prompt });
        }
        const startedAt = yield* DateTime.now;
        const event = yield* journal.publish(TurnFacts.Started, {
          workspaceId,
          groupId: turn.groupId,
          threadId: turn.threadId,
          memberId: turn.memberId,
          turnId: turn.id,
          selection,
          startedAt,
        });
        yield* turnCommand.recordActivity(
          turn.threadId,
          TurnActivity.Started,
          { turnId: turn.id },
          event,
        );
        yield* handle.append({
          _tag: "Prompted",
          messages: said.filter(({ own }) => !own).length,
        });
        return Start.Ready({
          turn: Turn.change(turn, { status: "running", selection, startedAt }),
          runnable,
          session,
          prompt,
        });
      }),
    );
  });

  const recordStep: Interface["recordStep"] = Effect.fn("TurnExecution.recordStep")(
    function* (turnId, recorded) {
      const id = yield* Schema.decodeEffect(Schema.NonEmptyString)(recorded.id);
      yield* asTurnAgent(turnId)((turn) =>
        Effect.gen(function* () {
          yield* requireStatus(turn, ["running", "cancelling"]);
          yield* TurnLog.open(log, turn.id).append({ _tag: "Step", id, step: recorded.step });
        }),
      );
    },
  );

  const showDraft: Interface["showDraft"] = Effect.fn("TurnExecution.showDraft")(
    function* (turnId, piece) {
      const turn = yield* requireTurn(turnId);
      if (turn.status !== "running" || piece.text === "" || piece.responseId === "") return;
      yield* signalHub.publish({
        _tag: "TurnDraft",
        workspaceId,
        groupId: turn.groupId,
        threadId: turn.threadId,
        turnId: turn.id,
        responseId: piece.responseId,
        part: piece.part,
        offset: piece.offset,
        text: piece.text,
      });
    },
  );

  /**
   * The participants the agent's reply in the turn's thread goes to, or why it cannot post there
   * now.
   */
  const readReplyParticipants = Effect.fnUntraced(function* (turn: Turn.Record) {
    const thread = yield* threadQuery.requireAccess(turn.threadId).pipe(
      Effect.asSome,
      Effect.catchTags({
        "ThreadQuery.NotFound": () => Effect.succeedNone,
        "Authorization.Denied": () => Effect.succeedNone,
      }),
    );
    if (Option.isNone(thread)) return Result.fail("The agent can no longer open this thread.");
    const [mayPublish] = yield* authorization.permitted([
      Requirement.make(ThreadMessagePermissions.Publish, {
        _tag: "Thread",
        workspaceId,
        threadId: turn.threadId,
      }),
    ]);
    if (mayPublish !== true) return Result.fail("The agent may no longer post in this thread.");
    const current = yield* threadQuery.currentParticipants(thread.value);
    const agent: ThreadParticipation.Reference = { _tag: "Member", memberId: turn.memberId };
    if (
      !current.some(
        (p) => ThreadParticipation.keyOf(p.participant) === ThreadParticipation.keyOf(agent),
      )
    )
      return Result.fail("The agent no longer takes part in this thread.");
    return Result.succeed(current.map((p) => ThreadParticipation.referenceOf(p.participant)));
  });

  const close: Interface["close"] = Effect.fn("TurnExecution.close")(function* (turnId, state) {
    return yield* asTurnAgent(turnId)((turn) =>
      Effect.gen(function* () {
        if (turn.status === "cancelling") {
          yield* saveSession(turn, state);
          yield* turnCommand.endTurn(turn, {
            outcome: "cancelled",
            cancelReason: turn.cancelReason ?? "requested",
          });
          return Closing.Stopped();
        }
        yield* requireStatus(turn, ["running"]);
        yield* saveSession(turn, state);
        const answer = TurnLog.answerOf(
          (yield* TurnLog.readEntries(log, turn.id)).map(({ entry }) => entry),
        );
        const failTurn = (reason: string) =>
          Effect.as(
            turnCommand.endTurn(turn, { outcome: "failed", reason }),
            Closing.Failed({ reason }),
          );
        // An answer of only space is no reply, as no message holds it.
        if (!/\S/u.test(answer)) {
          yield* turnCommand.endTurn(turn, { outcome: "completed", messageIds: [] });
          return Closing.Closed({ messageIds: [] });
        }
        const participants = yield* readReplyParticipants(turn);
        if (Result.isFailure(participants)) return yield* failTurn(participants.failure);
        const text = yield* Schema.decodeEffect(ThreadMessage.Text)(answer).pipe(
          Effect.asSome,
          Effect.catchTag("SchemaError", () => Effect.succeedNone),
        );
        if (Option.isNone(text)) return yield* failTurn("The agent's reply could not be posted.");
        const published = yield* threadCommand.publishMessage({
          messageId: ThreadMessage.Id.make(yield* crypto.randomUUIDv4),
          threadId: turn.threadId,
          author: { _tag: "Member", memberId: turn.memberId },
          text: text.value,
          mentions: [],
          participants: participants.success,
          occurredAt: yield* DateTime.now,
          turnId: turn.id,
        });
        const messageIds = [published.message.id];
        yield* turnCommand.endTurn(turn, { outcome: "completed", messageIds });
        return Closing.Closed({ messageIds });
      }),
    );
  });

  const fail: Interface["fail"] = Effect.fn("TurnExecution.fail")(function* (turnId, failure) {
    const reason = yield* Schema.decodeEffect(Schema.NonEmptyString)(failure.reason);
    yield* asTurnAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["queued", "running", "cancelling"]);
        if (failure.state !== undefined) yield* saveSession(turn, failure.state);
        yield* turnCommand.endTurn(turn, { outcome: "failed", reason });
      }),
    );
  });

  const confirmStopped: Interface["confirmStopped"] = Effect.fn("TurnExecution.confirmStopped")(
    function* (turnId, state) {
      yield* asTurnAgent(turnId)((turn) =>
        Effect.gen(function* () {
          if (!Turn.active(turn.status)) return;
          const cancelReason =
            turn.status === "cancelling"
              ? (turn.cancelReason ?? "requested")
              : (yield* hasDeparted(turn))
                ? "participation-ended"
                : undefined;
          if (cancelReason === undefined) return;
          if (state !== undefined) yield* saveSession(turn, state);
          yield* turnCommand.endTurn(turn, { outcome: "cancelled", cancelReason });
        }),
      );
    },
  );

  return Service.of({ start, recordStep, showDraft, close, fail, confirmStopped });
});

/** Internal service for turn jobs: callers are trusted to run what agents accepted. @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnExecution from "./execution.ts";
