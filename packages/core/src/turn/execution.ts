import { Context, Crypto, DateTime, Effect, Layer, Option, Result, Schema } from "effect";
import type { PlatformError } from "effect";
import { Prompt } from "effect/ai";
import type { Agent } from "../agent/agent.ts";
import { AgentQuery } from "../agent/query.ts";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Actor } from "../identity/actor.ts";
import { Identity } from "../identity/identity.ts";
import { Performer } from "../identity/performer.ts";
import { Journal } from "../journal/journal.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import { SignalHub } from "../signal/hub.ts";
import { ThreadActivityKind } from "../thread/activity/kind.ts";
import { ThreadActivityStore } from "../thread/activity/store.ts";
import { ThreadCommand } from "../thread/command.ts";
import { ThreadId } from "../thread/id.ts";
import { ThreadMessageActivity } from "../thread/message/activity.ts";
import { ThreadMessage } from "../thread/message/message.ts";
import { ThreadMessagePermissions } from "../thread/message/permissions.ts";
import { ThreadMessageStore } from "../thread/message/store.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { ThreadParticipationStore } from "../thread/participation/store.ts";
import { ThreadQuery } from "../thread/query.ts";
import { Member } from "../workspace/member/member.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { NotActive, NotFound } from "./errors.ts";
import { TurnActivity } from "./activity.ts";
import { TurnCommand } from "./command.ts";
import { TurnFacts } from "./facts.ts";
import { TurnPrompt } from "./prompt.ts";
import { SessionLogStore } from "./session-log-store.ts";
import { SessionStateStore } from "./session-state-store.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

export type Error =
  | TurnStore.Failure
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Projection.Error
  | SessionStateStore.Failure
  | NotFound
  | NotActive
  | TurnCommand.EndError;
export type AcceptError =
  | Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound | Authorization.Denied>
  | NotificationStore.Failure
  | MemberStore.Failure
  | SessionLogStore.Failure;
export type StartError =
  | Error
  | MemberStore.Failure
  | ThreadParticipationStore.Failure
  | ThreadActivityStore.Failure
  | ThreadMessageStore.Failure
  | AgentQuery.BuildError;
export type ReadError =
  | Error
  | MemberStore.Failure
  | ThreadParticipationStore.Failure
  | ThreadActivityStore.Failure
  | ThreadMessageStore.Failure;
export type CloseError =
  | Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound | Authorization.Denied>
  | ThreadQuery.ParticipantsError
  | ThreadCommand.Error;

/** An agent's turn job: the agent's membership, and the thread it works in. */
export const Job = Schema.Struct({ memberId: Member.Id, threadId: ThreadId.Id });
export interface Job extends Schema.Schema.Type<typeof Job> {}

/**
 * What a turn's job runs: nothing, since the turn ended as it stood or is not active; or the turn,
 * ready to run on what the agent is set up with now, with what the agent is told and the session
 * it resumes, if any.
 */
export const Start = Schema.TaggedUnion({
  Idle: {},
  Ready: {
    turn: Turn.Record,
    runnable: AgentQuery.Runnable,
    /**
     * The prompt: the thread's messages the agent was not told yet, through what the turn
     * accepted, each named by its author, and who asked when someone retried the turn.
     */
    prompt: Prompt.UserMessage,
    /** How many of the thread's messages the prompt tells. */
    messages: Schema.Int,
    /** What the participation's session resumes from, or none, when it starts anew. */
    resume: Schema.NullOr(SessionStateStore.Resume),
  },
});
export type Start = typeof Start.Type;

/**
 * How closing went: the turn completed, posting the agent's answer if it had one; it stopped as
 * it was asked to; or the agent could no longer post where it worked, which failed it.
 */
export const Closing = Schema.TaggedUnion({
  Closed: { messageIds: Schema.Array(ThreadMessage.Id) },
  Stopped: {},
  Failed: { reason: Schema.String },
});
export type Closing = typeof Closing.Type;

/**
 * What a turn's job asks of the workspace: commands and queries over data, which a job could call
 * from elsewhere. It accepts the agent's work into a turn, starts it with what the agent runs on and
 * is told, shows readers what the turn is writing, and ends it. The job runs the agent and keeps
 * the participation's session log; nothing here runs a harness, writes the log, or holds a turn
 * in memory. Each change is its own commit, attributed to the turn's agent. The job is trusted: it
 * runs what the agent accepted, and closing checks the agent's own access before posting for it.
 */
export interface Interface {
  /**
   * The agent's active turn in the thread, or, while it has none, a new one that accepts the work
   * its notifications from the thread ask for, settling them. None while no work waits, or while
   * the agent cannot open the thread, where the work waits, as a person's notification waits in
   * their inbox.
   */
  readonly accept: (job: Job) => Effect.Effect<Option.Option<Turn.Record>, AcceptError>;
  /**
   * Start the turn: one asked to stop, or whose participation ended, ends as it stands; one that
   * cannot run on what `AgentQuery` selects for it, kept when it runs again, fails; and one with
   * nothing to tell the agent completes. Otherwise it is ready to run, and a queued turn starts.
   * A turn that is no longer active is `Idle`.
   */
  readonly start: (turnId: Turn.Id) => Effect.Effect<Start, StartError>;
  /**
   * The conversation the turn's agent joined in the thread: the thread's messages before its
   * participation, which its session starts with when its session log is new.
   */
  readonly joinedConversation: (
    turnId: Turn.Id,
  ) => Effect.Effect<ReadonlyArray<Prompt.Message>, ReadError>;
  /**
   * Show the turn's readers more of a step before it finishes, as a signal: nothing is recorded,
   * and a turn no longer running shows nothing. A reader who starts following midway sees the step
   * from the next draft that starts at its beginning.
   */
  readonly showDraft: (turnId: Turn.Id, draft: Turn.Draft) => Effect.Effect<void, Error>;
  /**
   * Close a turn whose harness turn finished: post `reply`, the text of its last step, as the
   * agent's message to the thread's current participants, keep what its session resumes from, and
   * record completion, in one commit. A turn asked to stop meanwhile stops instead, keeping the
   * session.
   */
  readonly close: (
    turnId: Turn.Id,
    closing: { readonly reply: string; readonly resume: SessionStateStore.Resume },
  ) => Effect.Effect<Closing, CloseError>;
  /** The turn could not go on, for `reason`; a session it started is kept as it was left. */
  readonly fail: (
    turnId: Turn.Id,
    failure: { readonly reason: string; readonly resume?: SessionStateStore.Resume | undefined },
  ) => Effect.Effect<void, Error | ThreadParticipationStore.Failure>;
  /**
   * End a turn its job stopped, or that it was not running, keeping a session it started: one
   * asked to stop, or whose participation ended. Any other turn is left as it is.
   */
  readonly confirmStopped: (
    turnId: Turn.Id,
    stopped: { readonly resume?: SessionStateStore.Resume | undefined },
  ) => Effect.Effect<void, Error | ThreadParticipationStore.Failure>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/execution/Service",
) {}

/** How many activities one read takes; reads go on until the range is done. */
const pageSize = 100;

/** Why the agent cannot run, as the turn that failed for it says. */
const describeIssue = (issue: Agent.Issue): string => {
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
  const sessionLogStore = yield* SessionLogStore.Service;
  const notificationStore = yield* NotificationStore.Service;
  const memberStore = yield* MemberStore.Service;
  const threadParticipationStore = yield* ThreadParticipationStore.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const turnCommand = yield* TurnCommand.Service;
  const agentQuery = yield* AgentQuery.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
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

  /** The participation the turn's input came through, which outlasts it. */
  const requireParticipation = Effect.fnUntraced(function* (turn: Turn.Record) {
    const participation = yield* threadParticipationStore.get(turn.participationId);
    if (Option.isNone(participation)) return yield* Effect.die("A turn's participation is missing");
    return participation.value;
  });

  // TODO: Keep a turn `suspendTurn` left unfinished, which the next run continues, once the turn
  // job suspends turns; the session log has its prompt and the steps it finished.
  /** Keep what the agent's next turn in the thread resumes the session from. */
  const saveSession = (turn: Turn.Record, resume: SessionStateStore.Resume) =>
    turn.selection === null
      ? Effect.die("A turn that ran a session has no selection")
      : sessionStateStore.set(turn.participationId, {
          agent: resume.agent,
          ...(resume.agentState === undefined ? {} : { agentState: resume.agentState }),
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
  const readInputs = Effect.fnUntraced(function* (
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
    return messages.map(({ author, text }): TurnPrompt.Input =>
      ThreadMessage.Author.isAnyOf(["Member"])(author)
        ? { author: nameOf(author.memberId), own: author.memberId === memberId, text }
        : { author: "A contact", own: false, text },
    );
  });

  /**
   * Accept the agent's pending work in the thread into a new turn, settling the notifications
   * that ask for it, or none while none is pending or the agent can no longer open the thread.
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
      logAfter: yield* sessionLogStore.head(latest.participationId),
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
    Effect.as(turnCommand.endTurn(turn, ending), Start.cases.Idle.make({}));

  /** What `turn` runs on: its selection once started, and otherwise what is selected now. */
  const selectionOf = Effect.fnUntraced(function* (turn: Turn.Record) {
    if (turn.selection !== null) return turn.selection;
    const saved = yield* sessionStateStore.get(turn.participationId);
    return yield* agentQuery.select(
      turn.memberId,
      Option.getOrUndefined(Option.map(saved, ({ selection }) => selection)),
    );
  });

  const accept: Interface["accept"] = Effect.fn("TurnExecution.accept")(function* (job) {
    const member = yield* memberStore.get(job.memberId);
    if (
      Option.isNone(member) ||
      member.value.status !== "active" ||
      !Identity.MemberReference.isAnyOf(["Agent"])(member.value.identity)
    )
      return Option.none();
    const agent = Object.assign(member.value, { identity: member.value.identity });
    return yield* asAgent(
      agent.id,
      agent.identity,
    )(
      Effect.gen(function* () {
        const active = yield* turnStore.findActive(agent.id, job.threadId);
        if (Option.isSome(active)) return active;
        return Option.fromUndefinedOr(yield* acceptWork(agent, job.threadId));
      }),
    );
  });

  /**
   * Ready `turn` to run on `selection`, in the caller's commit, with what the agent is told now,
   * or end it at once when it has nothing to tell the agent. Starting a queued turn records it.
   */
  const readyTurn = Effect.fnUntraced(function* (
    turn: Turn.Record,
    selection: Agent.Selection,
    runnable: AgentQuery.Runnable,
  ) {
    const participation = yield* requireParticipation(turn);
    const saved = yield* sessionStateStore.get(turn.participationId);
    const inputs = yield* readInputs(turn.memberId, turn.threadId, {
      after: Option.match(saved, {
        onNone: () => participation.joinedAtSequence - 1,
        onSome: ({ promptedThroughSequence }) => promptedThroughSequence,
      }),
      through: turn.acceptedThroughSequence,
    });
    const retriedBy =
      turn.retry === null ? undefined : (yield* readNames([turn.retry.by]))(turn.retry.by);
    const prompt = TurnPrompt.promptOf(inputs, retriedBy);
    // Nothing to say, as when what the turn accepted was all the agent's own.
    if (prompt === undefined)
      return yield* endAsIdle(turn, { outcome: "completed", messageIds: [] });
    const ready = {
      runnable,
      prompt,
      messages: inputs.filter(({ own }) => !own).length,
      resume: Option.match(saved, {
        onNone: () => null,
        onSome: ({ agent, agentState }): SessionStateStore.Resume =>
          agentState === undefined ? { agent } : { agent, agentState },
      }),
    };
    if (turn.status === "running") return Start.cases.Ready.make({ turn, ...ready });
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
    return Start.cases.Ready.make({
      turn: Turn.change(turn, { status: "running", selection, startedAt }),
      ...ready,
    });
  });

  const start: Interface["start"] = Effect.fn("TurnExecution.start")(function* (turnId) {
    return yield* asTurnAgent(turnId)((turn) =>
      Effect.gen(function* () {
        if (!Turn.active(turn.status)) return Start.cases.Idle.make({});
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
        const failWithIssues = (incomplete: { readonly issues: ReadonlyArray<Agent.Issue> }) =>
          endAsIdle(turn, {
            outcome: "failed",
            reason: incomplete.issues.map(describeIssue).join(" "),
          });
        const built = yield* Effect.gen(function* () {
          const selection = yield* selectionOf(turn);
          const runnable = yield* agentQuery.buildRunnable(turn.memberId, selection);
          return { selection, runnable };
        }).pipe(
          Effect.asSome,
          Effect.catchTags({
            "AgentService.Incomplete": (incomplete) =>
              Effect.as(failWithIssues(incomplete), Option.none()),
            "AgentQuery.NotFound": () =>
              Effect.as(
                endAsIdle(turn, { outcome: "failed", reason: "The agent can no longer run." }),
                Option.none(),
              ),
          }),
        );
        if (Option.isNone(built)) return Start.cases.Idle.make({});
        return yield* readyTurn(turn, built.value.selection, built.value.runnable);
      }),
    );
  });

  const joinedConversation: Interface["joinedConversation"] = Effect.fn(
    "TurnExecution.joinedConversation",
  )(function* (turnId) {
    const turn = yield* requireTurn(turnId);
    const participation = yield* requireParticipation(turn);
    return TurnPrompt.conversationOf(
      yield* readInputs(turn.memberId, turn.threadId, {
        after: 0,
        through: participation.joinedAtSequence - 1,
      }),
    );
  });

  const showDraft: Interface["showDraft"] = Effect.fn("TurnExecution.showDraft")(
    function* (turnId, draft) {
      const turn = yield* requireTurn(turnId);
      if (turn.status !== "running" || draft.text === "") return;
      yield* signalHub.publish({
        _tag: "TurnDraft",
        workspaceId,
        groupId: turn.groupId,
        threadId: turn.threadId,
        turnId: turn.id,
        draft,
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

  const close: Interface["close"] = Effect.fn("TurnExecution.close")(function* (
    turnId,
    { reply, resume },
  ) {
    return yield* asTurnAgent(turnId)((turn) =>
      Effect.gen(function* () {
        if (turn.status === "cancelling") {
          yield* saveSession(turn, resume);
          yield* turnCommand.endTurn(turn, {
            outcome: "cancelled",
            cancelReason: turn.cancelReason ?? "requested",
          });
          return Closing.cases.Stopped.make({});
        }
        yield* requireStatus(turn, ["running"]);
        yield* saveSession(turn, resume);
        const failTurn = (reason: string) =>
          Effect.as(
            turnCommand.endTurn(turn, { outcome: "failed", reason }),
            Closing.cases.Failed.make({ reason }),
          );
        // A reply of only space is none, as no message holds it.
        if (!/\S/u.test(reply)) {
          yield* turnCommand.endTurn(turn, { outcome: "completed", messageIds: [] });
          return Closing.cases.Closed.make({ messageIds: [] });
        }
        const participants = yield* readReplyParticipants(turn);
        if (Result.isFailure(participants)) return yield* failTurn(participants.failure);
        const text = yield* Schema.decodeEffect(ThreadMessage.Text)(reply).pipe(
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
        return Closing.cases.Closed.make({ messageIds });
      }),
    );
  });

  const fail: Interface["fail"] = Effect.fn("TurnExecution.fail")(function* (turnId, failure) {
    const reason = yield* Schema.decodeEffect(Schema.NonEmptyString)(failure.reason);
    yield* asTurnAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["queued", "running", "cancelling"]);
        if (failure.resume !== undefined) yield* saveSession(turn, failure.resume);
        yield* turnCommand.endTurn(turn, { outcome: "failed", reason });
      }),
    );
  });

  const confirmStopped: Interface["confirmStopped"] = Effect.fn("TurnExecution.confirmStopped")(
    function* (turnId, { resume }) {
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
          if (resume !== undefined) yield* saveSession(turn, resume);
          yield* turnCommand.endTurn(turn, { outcome: "cancelled", cancelReason });
        }),
      );
    },
  );

  return Service.of({
    accept,
    start,
    joinedConversation,
    showDraft,
    close,
    fail,
    confirmStopped,
  });
});

/** Internal service for turn jobs: callers are trusted to run what agents accepted. @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnExecution from "./execution.ts";
