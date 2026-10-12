/**
 * What a turn's job asks of the workspace, as no actor: accepting an agent's waiting work into a
 * turn, starting the turn with what the agent runs on and is told, showing readers drafts of the
 * step being written, and ending the turn by closing, failing, or confirming it stopped. It is
 * one of core's `JobServices`, which Cluster's `TurnRunner` calls through the gateway for each
 * turn job. It holds nothing in memory and runs no harness: the job runs the agent and writes the
 * participation's session log (`SessionLogStore`), and each change here is its own commit,
 * attributed to the turn's agent.
 *
 * @since 0.1.0
 */
import { Array, Context, Crypto, DateTime, Effect, Layer, Option, Result, Schema } from "effect";
import { Prompt } from "effect/ai";
import type * as Agent from "../agent/Agent.ts";
import * as AgentQuery from "../agent/AgentQuery.ts";
import * as Authorization from "../authorization/Authorization.ts";
import * as Requirement from "../authorization/Requirement.ts";
import * as ContactStore from "../channel/ContactStore.ts";
import * as Actor from "../identity/Actor.ts";
import * as Identity from "../identity/Identity.ts";
import * as Performer from "../identity/Performer.ts";
import * as Journal from "../journal/Journal.ts";
import * as Publication from "../journal/Publication.ts";
import * as Store from "../journal/Store.ts";
import * as Notification from "../notification/Notification.ts";
import * as NotificationStore from "../notification/NotificationStore.ts";
import * as SignalHub from "../signal/SignalHub.ts";
import * as TaskStore from "../task/TaskStore.ts";
import type * as Thread from "../thread/Thread.ts";
import * as ThreadActivityKind from "../thread/ThreadActivityKind.ts";
import * as ThreadActivityStore from "../thread/ThreadActivityStore.ts";
import * as ThreadCommand from "../thread/ThreadCommand.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as ThreadMessageActivity from "../thread/ThreadMessageActivity.ts";
import * as ThreadMessage from "../thread/ThreadMessage.ts";
import * as ThreadMessagePermissions from "../thread/ThreadMessagePermissions.ts";
import * as ThreadMessageStore from "../thread/ThreadMessageStore.ts";
import * as ThreadParticipation from "../thread/ThreadParticipation.ts";
import * as ThreadParticipationStore from "../thread/ThreadParticipationStore.ts";
import * as ThreadQuery from "../thread/ThreadQuery.ts";
import * as ThreadStore from "../thread/ThreadStore.ts";
import type * as Member from "../workspace/Member.ts";
import * as MemberStore from "../workspace/MemberStore.ts";
import * as TurnActivity from "./TurnActivity.ts";
import * as TurnCommand from "./TurnCommand.ts";
import * as TurnFacts from "./TurnFacts.ts";
import * as TurnPrompt from "./TurnPrompt.ts";
import * as SessionLogStore from "./SessionLogStore.ts";
import * as SessionStateStore from "./SessionStateStore.ts";
import * as TurnStore from "./TurnStore.ts";
import * as Turn from "./Turn.ts";
import * as CoreError from "../error/CoreError.ts";
import * as Operation from "../operation/Operation.ts";

/**
 * What every execution operation can fail with: a turn missing or not in the state the step needs
 * (`CoreError.Conflict` with `TurnNotActive`), and what its commit meets.
 *
 * @category errors
 * @since 0.1.0
 */
export type Error =
  | CoreError.NotFound
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What `accept` can fail with: `Error`, and the thread's access.
 *
 * @category errors
 * @since 0.1.0
 */
export type AcceptError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What `start` can fail with: `Error`, and what the agent runs on.
 *
 * @category errors
 * @since 0.1.0
 */
export type StartError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What `joinedConversation` can fail with: `Error`.
 *
 * @category errors
 * @since 0.1.0
 */
export type JoinedConversationError =
  | CoreError.NotFound
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What `close` can fail with: `Error`, and the agent's access to post its reply.
 *
 * @category errors
 * @since 0.1.0
 */
export type CloseError =
  | CoreError.NotFound
  | CoreError.Denied
  | CoreError.Conflict
  | CoreError.Invalid
  | CoreError.Unavailable
  | CoreError.Uncertain;

/**
 * What a turn's job runs: nothing, since the turn ended as it stood or is not active; or the turn,
 * ready to run on what the agent is set up with now, with what the agent is told and the session
 * it resumes, if any.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Start = Schema.TaggedUnion({
  Idle: {},
  Ready: {
    turn: Turn.Turn,
    runnable: AgentQuery.Runnable,
    /**
     * The prompt: the thread as it stands, then what told the agent since it was last prompted,
     * through what the turn accepted, each in its kind's words, and who asked when someone
     * retried the turn.
     */
    prompt: Prompt.UserMessage,
    /** How many of the thread's messages the prompt tells. */
    messages: Schema.Int,
    /** What the participation's session resumes from, or none, when it starts anew. */
    resume: Schema.NullOr(SessionStateStore.Resume),
  },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Start = typeof Start.Type;

/**
 * How closing went: the turn completed, posting the agent's answer if it had one; it stopped as
 * it was asked to; or the agent could no longer post where it worked, which failed it.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Closing = Schema.TaggedUnion({
  Closed: { messageIds: Schema.Array(ThreadMessage.Id) },
  Stopped: {},
  Failed: { reason: Schema.String },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Closing = typeof Closing.Type;

/**
 * What a turn's job asks of the workspace: commands and queries over data, which a job could call
 * from elsewhere. It accepts the agent's work into a turn, starts it with what the agent runs on and
 * is told, shows readers what the turn is writing, and ends it. The job runs the agent and keeps
 * the participation's session log; nothing here runs a harness, writes the log, or holds a turn
 * in memory. Each change is its own commit, attributed to the turn's agent. The job is trusted: it
 * runs what the agent accepted, and closing checks the agent's own access before posting for it.
 *
 * @category services
 * @since 0.1.0
 */
export class TurnExecution extends Context.Service<
  TurnExecution,
  {
    /**
     * The active turn in the thread of the agent of membership `memberId`, or, while it has none, a
     * new one that accepts the work its notifications from the thread ask for, settling them. None
     * while no work waits, or while the agent cannot open the thread, where the work waits, as a
     * person's notification waits in their inbox.
     */
    readonly accept: (
      memberId: Member.Id,
      threadId: ThreadId.Id,
    ) => Effect.Effect<Option.Option<Turn.Turn>, AcceptError>;
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
    ) => Effect.Effect<ReadonlyArray<Prompt.Message>, JoinedConversationError>;
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
    ) => Effect.Effect<void, Error>;
    /**
     * End a turn its job stopped, or that it was not running, keeping a session it started: one
     * asked to stop, or whose participation ended. Any other turn is left as it is.
     */
    readonly confirmStopped: (
      turnId: Turn.Id,
      stopped: { readonly resume?: SessionStateStore.Resume | undefined },
    ) => Effect.Effect<void, Error>;
  }
>()("@amends-dev/core/turn/TurnExecution") {}

/** How many activities one read takes; reads go on until the range is done. */
const pageSize = 100;

/**
 * The execution over the workspace's stores, the turn and thread commands, `AgentQuery`, the
 * journal, and the signal hub.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("TurnExecution.make")(function* () {
  const turnStore = yield* TurnStore.TurnStore;
  const sessionStateStore = yield* SessionStateStore.SessionStateStore;
  const sessionLogStore = yield* SessionLogStore.SessionLogStore;
  const notificationStore = yield* NotificationStore.NotificationStore;
  const memberStore = yield* MemberStore.MemberStore;
  const contactStore = yield* ContactStore.ContactStore;
  const taskStore = yield* TaskStore.TaskStore;
  const threadStore = yield* ThreadStore.ThreadStore;
  const threadParticipationStore = yield* ThreadParticipationStore.ThreadParticipationStore;
  const threadActivityStore = yield* ThreadActivityStore.ThreadActivityStore;
  const threadMessageStore = yield* ThreadMessageStore.ThreadMessageStore;
  const threadQuery = yield* ThreadQuery.ThreadQuery;
  const threadCommand = yield* ThreadCommand.ThreadCommand;
  const turnCommand = yield* TurnCommand.TurnCommand;
  const agentQuery = yield* AgentQuery.AgentQuery;
  const authorization = yield* Authorization.Authorization;
  const journal = yield* Journal.Journal;
  const signalHub = yield* SignalHub.SignalHub;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Store;

  const requireTurn = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turnStore.get(turnId);
    if (Option.isNone(found))
      return yield* new CoreError.NotFound({ resource: "Turn", id: turnId });
    return found.value;
  });

  /** `step`, attributed to the agent `identity` of membership `memberId`, which it runs as. */
  const attributed = <A, E, R>(
    memberId: Member.Id,
    identity: Identity.MemberReference,
    step: Effect.Effect<A, E, R>,
  ) =>
    Effect.flatMap(
      Publication.make(workspaceId, Performer.Reference.cases.Member.make({ memberId, identity })),
      (provenance) =>
        step.pipe(
          Effect.provideService(Publication.Publication, provenance),
          Effect.provideService(Actor.Actor, { workspaceId, memberId, identity }),
        ),
    );
  /** Run `step` in its own commit, as the agent `identity` of membership `memberId`. */
  const asAgent = <A, E, R>(
    memberId: Member.Id,
    identity: Identity.MemberReference,
    step: Effect.Effect<A, E, R>,
  ) =>
    attributed(memberId, identity, step).pipe(
      Effect.provideService(Crypto.Crypto, crypto),
      journal.commit,
    );
  /** Run `step` with the turn as stored, in its own commit, as the turn's agent. */
  const asTurnAgent = <A, E, R>(
    turnId: Turn.Id,
    step: (turn: Turn.Turn) => Effect.Effect<A, E, R>,
  ) =>
    Effect.flatMap(requireTurn(turnId), (turn) =>
      attributed(
        turn.memberId,
        Identity.MemberReference.cases.Agent.make({ id: turn.agentId }),
        step(turn),
      ),
    ).pipe(Effect.provideService(Crypto.Crypto, crypto), journal.commit);

  /** Why the turn was asked to stop; `requested` when the record predates the request. */
  const reasonAskedToStop = (turn: Turn.Turn) => turn.cancelReason ?? "requested";

  /** Whether the participation the turn's input came through has ended. */
  const hasDeparted = Effect.fnUntraced(function* (turn: Turn.Turn) {
    const participation = yield* threadParticipationStore.get(turn.participationId);
    return Option.isNone(participation) || participation.value.status !== "active";
  });

  /** The participation the turn's input came through, which outlasts it. */
  const requireParticipation = Effect.fnUntraced(function* (turn: Turn.Turn) {
    const participation = yield* threadParticipationStore.get(turn.participationId);
    if (Option.isNone(participation)) return yield* Effect.die("A turn's participation is missing");
    return participation.value;
  });

  // TODO: Keep a turn `suspendTurn` left unfinished, which the next run continues, once the turn
  // job suspends turns; the session log has its prompt and the steps it finished.
  /** Keep what the agent's next turn in the thread resumes the session from. */
  const saveSession = (turn: Turn.Turn, resume: SessionStateStore.Resume) =>
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

  /**
   * What the thread's people are called, as the agent is told them; a member without a name is
   * "A member", and a contact no longer found "A contact".
   */
  const readNames = Effect.fnUntraced(function* (people: ReadonlyArray<ThreadMessage.Author>) {
    const memberIds = new Set<Member.Id>();
    const contactIds = new Set<Identity.ContactId>();
    for (const person of people)
      if (ThreadMessage.Author.isAnyOf(["Member"])(person)) memberIds.add(person.memberId);
      else contactIds.add(person.contactId);
    const members = yield* memberStore.getMany([...memberIds]);
    const contacts = yield* contactStore.getMany([...contactIds]);
    const memberNames = new Map(members.map((member) => [member.id as string, member.name]));
    const contactNames = new Map(contacts.map((contact) => [contact.id as string, contact.name]));
    return {
      member: (memberId) => memberNames.get(memberId) ?? "A member",
      contact: (contactId) => contactNames.get(contactId) ?? "A contact",
    } satisfies TurnPrompt.Names;
  });

  /** The thread's messages in a range, as the agent `memberId` is told them. */
  const readInputs = Effect.fnUntraced(function* (
    memberId: Member.Id,
    threadId: ThreadId.Id,
    range: { readonly after: number; readonly through: number },
  ) {
    const messages = yield* readMessagesBetween(threadId, range);
    const names = yield* readNames(messages.map(({ author }) => author));
    // A deleted message has no text to tell; what the agent was told of it stays in its log.
    return messages.flatMap(({ author, content }): ReadonlyArray<TurnPrompt.Input> => {
      if (!ThreadMessage.Content.isAnyOf(["Text"])(content)) return [];
      const { text } = content;
      return ThreadMessage.Author.isAnyOf(["Member"])(author)
        ? [{ author: names.member(author.memberId), own: author.memberId === memberId, text }]
        : [{ author: names.contact(author.contactId), own: false, text }];
    });
  });

  /**
   * The thread's timeline items in a range of positions that told the agent, oldest first: those
   * at the positions of its notifications there, whatever their state, resolved as the agent reads
   * the timeline.
   */
  const readTold = Effect.fnUntraced(function* (
    turn: Turn.Turn,
    range: { readonly after: number; readonly through: number },
  ) {
    if (range.through < 1 || range.after >= range.through) return [];
    const told = yield* notificationStore.listByThread(
      Notification.ofMember(
        turn.memberId,
        Identity.MemberReference.cases.Agent.make({ id: turn.agentId }),
      ),
      turn.threadId,
      { afterSequence: range.after, throughSequence: range.through },
    );
    const sequences = new Set(
      told.flatMap((record) => (record.thread === undefined ? [] : [record.thread.sequence])),
    );
    if (sequences.size === 0) return [];
    const items: Array<Thread.TimelineItem> = [];
    const through = Math.max(...sequences);
    let after = Math.min(...sequences) - 1;
    for (;;) {
      const page = yield* threadQuery.readTimeline(turn.threadId, {
        afterSequence: after,
        beforeSequence: through + 1,
        from: "oldest",
        limit: pageSize,
      });
      for (const item of page) if (sequences.has(item.activity.sequence)) items.push(item);
      const last = page.at(-1);
      if (last === undefined || page.length < pageSize || last.activity.sequence >= through) break;
      after = last.activity.sequence;
    }
    return items;
  });

  /** The thread as it stands, for the agent: its title, and its task when it is one. */
  const readContext = Effect.fnUntraced(function* (threadId: ThreadId.Id) {
    const thread = yield* threadStore.get(threadId);
    const task = yield* taskStore.get(threadId);
    return {
      title: Option.isSome(thread) ? thread.value.title : null,
      task: Option.getOrUndefined(task),
    } satisfies TurnPrompt.Context;
  });

  /**
   * Accept the pending work in the thread of the agent `identity` of membership `memberId` into a
   * new turn, settling the notifications that ask for it, or none while none is pending or the
   * agent can no longer open the thread.
   */
  const acceptWork = Effect.fnUntraced(function* (
    memberId: Member.Id,
    identity: Extract<Identity.MemberReference, { readonly _tag: "Agent" }>,
    threadId: ThreadId.Id,
  ) {
    const pending = (yield* notificationStore.listPendingByThread(
      Notification.ofMember(memberId, identity),
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
      Effect.catchTag("CoreError.NotFound", () => Effect.succeedNone),
      Effect.catchReason("CoreError.Denied", "NotGranted", () => Effect.succeedNone),
    );
    if (Option.isNone(thread)) return undefined;
    const notificationIds = accepted.map(({ id }) => id);
    if (!Array.isReadonlyArrayNonEmpty(notificationIds)) return undefined;
    const created = Turn.queued({
      id: Turn.Id.make(yield* crypto.randomUUIDv4),
      workspaceId,
      groupId: thread.value.groupId,
      threadId,
      agentId: identity.id,
      memberId,
      participationId: latest.participationId,
      retry: null,
      acceptedThroughSequence: Math.max(...accepted.map(({ sequence }) => sequence)),
      logAfter: yield* sessionLogStore.head(latest.participationId),
      createdAt: yield* DateTime.now,
    });
    const event = yield* journal.publish(
      TurnFacts.Created,
      Object.assign({}, created, { notificationIds }),
    );
    yield* turnCommand.recordActivity(
      threadId,
      TurnActivity.Created,
      { turnId: created.id, memberId, retryOf: null },
      event,
    );
    return created;
  });

  /** End `turn` as it stands, so its job has nothing to run: `Idle`. */
  const endAsIdle = (turn: Turn.Turn, ending: TurnCommand.Ending) =>
    Effect.as(turnCommand.endTurn(turn, ending), Start.cases.Idle.make({}));

  /**
   * End `turn` stopped for `cancelReason`, keeping what its session resumes from, if it ran one.
   */
  const endStopped = Effect.fnUntraced(function* (
    turn: Turn.Turn,
    cancelReason: Turn.CancelReason,
    resume: SessionStateStore.Resume | undefined,
  ) {
    if (resume !== undefined) yield* saveSession(turn, resume);
    yield* turnCommand.endTurn(turn, { outcome: "cancelled", cancelReason });
  });

  /** What `turn` runs on: its selection once started, and otherwise what is selected now. */
  const selectionOf = Effect.fnUntraced(function* (turn: Turn.Turn) {
    if (turn.selection !== null) return turn.selection;
    const saved = yield* sessionStateStore.get(turn.participationId);
    return yield* agentQuery.select(
      turn.memberId,
      Option.getOrUndefined(Option.map(saved, ({ selection }) => selection)),
    );
  });

  const accept: TurnExecution["Service"]["accept"] = Effect.fn("TurnExecution.accept")(function* (
    memberId,
    threadId,
  ) {
    const member = yield* memberStore.get(memberId);
    if (Option.isNone(member) || member.value.status !== "active") return Option.none();
    const { identity } = member.value;
    if (!Identity.MemberReference.isAnyOf(["Agent"])(identity)) return Option.none();
    return yield* asAgent(
      memberId,
      identity,
      Effect.gen(function* () {
        const active = yield* turnStore.findActive(memberId, threadId);
        if (Option.isSome(active)) return active;
        return Option.fromUndefinedOr(yield* acceptWork(memberId, identity, threadId));
      }),
    );
  }, Operation.report);

  /**
   * Ready `turn` to run on `selection`, in the caller's commit, with what the agent is told now,
   * or end it at once when it has nothing to tell the agent. Starting a queued turn records it.
   */
  const readyTurn = Effect.fnUntraced(function* (
    turn: Turn.Turn,
    selection: Agent.Selection,
    runnable: AgentQuery.Runnable,
  ) {
    const participation = yield* requireParticipation(turn);
    const saved = yield* sessionStateStore.get(turn.participationId);
    const items = yield* readTold(turn, {
      after: Option.match(saved, {
        onNone: () => participation.joinedAtSequence - 1,
        onSome: ({ promptedThroughSequence }) => promptedThroughSequence,
      }),
      through: turn.acceptedThroughSequence,
    });
    const context = yield* readContext(turn.threadId);
    const retriedBy: ReadonlyArray<ThreadMessage.Author> =
      turn.retry === null ? [] : [{ _tag: "Member", memberId: turn.retry.by }];
    const names = yield* readNames([...TurnPrompt.peopleOf(context, items), ...retriedBy]);
    const prompt = TurnPrompt.promptOf(context, items, {
      self: turn.memberId,
      names,
      retriedBy: turn.retry === null ? undefined : names.member(turn.retry.by),
    });
    // Nothing to say, as when what told the agent has no words for it.
    if (prompt === undefined)
      return yield* endAsIdle(turn, { outcome: "completed", messageIds: [] });
    const ready = {
      runnable,
      prompt,
      messages: TurnPrompt.countMessages(items),
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

  const start: TurnExecution["Service"]["start"] = Effect.fn("TurnExecution.start")(function* (
    turnId,
  ) {
    return yield* asTurnAgent(
      turnId,
      Effect.fnUntraced(function* (turn) {
        if (!Turn.active(turn.status)) return Start.cases.Idle.make({});
        if (turn.status === "cancelling")
          return yield* endAsIdle(turn, {
            outcome: "cancelled",
            cancelReason: reasonAskedToStop(turn),
          });
        if (yield* hasDeparted(turn))
          return yield* endAsIdle(turn, {
            outcome: "cancelled",
            cancelReason: "participation-ended",
          });
        return yield* Effect.gen(function* () {
          const selection = yield* selectionOf(turn);
          const runnable = yield* agentQuery.buildRunnable(turn.memberId, selection);
          return yield* readyTurn(turn, selection, runnable);
        }).pipe(
          // The agent's membership ended, or the thread is gone or closed to the agent: the turn
          // fails rather than tells nothing.
          Effect.catchReason("CoreError.Denied", "NotGranted", () =>
            endAsIdle(turn, {
              outcome: "failed",
              reason: "The agent can no longer read the thread.",
            }),
          ),
          // The agent cannot run on what is selected for it: the turn fails, saying why.
          Effect.catchTags({
            "CoreError.Invalid": ({ reason }) =>
              endAsIdle(turn, { outcome: "failed", reason: reason.message }),
            "CoreError.NotFound": ({ resource }) =>
              endAsIdle(turn, {
                outcome: "failed",
                reason:
                  resource === "Agent"
                    ? "The agent can no longer run."
                    : "The agent can no longer read the thread.",
              }),
          }),
        );
      }),
    );
  }, Operation.report);

  const joinedConversation: TurnExecution["Service"]["joinedConversation"] = Effect.fn(
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
  }, Operation.report);

  const showDraft: TurnExecution["Service"]["showDraft"] = Effect.fn("TurnExecution.showDraft")(
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
    Operation.report,
  );

  /**
   * The participants the agent's reply in the turn's thread goes to, or why it cannot post there
   * now.
   */
  const readReplyParticipants = Effect.fnUntraced(function* (turn: Turn.Turn) {
    const thread = yield* threadQuery.requireAccess(turn.threadId).pipe(
      Effect.asSome,
      Effect.catchTag("CoreError.NotFound", () => Effect.succeedNone),
      Effect.catchReason("CoreError.Denied", "NotGranted", () => Effect.succeedNone),
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

  /** End `turn` failed for `reason`, as closing reports it. */
  const closeFailed = (turn: Turn.Turn, reason: string) =>
    Effect.as(
      turnCommand.endTurn(turn, { outcome: "failed", reason }),
      Closing.cases.Failed.make({ reason }),
    );

  const close: TurnExecution["Service"]["close"] = Effect.fn("TurnExecution.close")(function* (
    turnId,
    { reply, resume },
  ) {
    return yield* asTurnAgent(
      turnId,
      Effect.fnUntraced(function* (turn) {
        if (turn.status === "cancelling") {
          yield* endStopped(turn, reasonAskedToStop(turn), resume);
          return Closing.cases.Stopped.make({});
        }
        if (turn.status !== "running")
          return yield* new CoreError.Conflict({
            reason: new CoreError.TurnNotActive({ turnId: turn.id, status: turn.status }),
          });
        yield* saveSession(turn, resume);
        // A reply of only space is none, as no message holds it.
        if (!/\S/u.test(reply)) {
          yield* turnCommand.endTurn(turn, { outcome: "completed", messageIds: [] });
          return Closing.cases.Closed.make({ messageIds: [] });
        }
        const participants = yield* readReplyParticipants(turn);
        if (Result.isFailure(participants)) return yield* closeFailed(turn, participants.failure);
        const text = Schema.decodeOption(ThreadMessage.Text)(reply);
        if (Option.isNone(text))
          return yield* closeFailed(turn, "The agent's reply could not be posted.");
        const published = yield* threadCommand.publishMessage({
          messageId: ThreadMessage.Id.make(yield* crypto.randomUUIDv4),
          threadId: turn.threadId,
          author: { _tag: "Member", memberId: turn.memberId },
          text: text.value,
          mentions: [],
          participants: participants.success,
          occurredAt: yield* DateTime.now,
          via: { _tag: "Turn", turnId: turn.id },
        });
        const messageIds = [published.message.id];
        yield* turnCommand.endTurn(turn, { outcome: "completed", messageIds });
        return Closing.cases.Closed.make({ messageIds });
      }),
    );
  }, Operation.report);

  const fail: TurnExecution["Service"]["fail"] = Effect.fn("TurnExecution.fail")(function* (
    turnId,
    failure,
  ) {
    const reason = yield* Schema.decodeEffect(Schema.NonEmptyString)(failure.reason);
    yield* asTurnAgent(
      turnId,
      Effect.fnUntraced(function* (turn) {
        if (!Turn.active(turn.status))
          return yield* new CoreError.Conflict({
            reason: new CoreError.TurnNotActive({ turnId: turn.id, status: turn.status }),
          });
        if (failure.resume !== undefined) yield* saveSession(turn, failure.resume);
        yield* turnCommand.endTurn(turn, { outcome: "failed", reason });
      }),
    );
  }, Operation.report);

  const confirmStopped: TurnExecution["Service"]["confirmStopped"] = Effect.fn(
    "TurnExecution.confirmStopped",
  )(function* (turnId, { resume }) {
    yield* asTurnAgent(
      turnId,
      Effect.fnUntraced(function* (turn) {
        if (!Turn.active(turn.status)) return;
        if (turn.status === "cancelling")
          return yield* endStopped(turn, reasonAskedToStop(turn), resume);
        if (yield* hasDeparted(turn)) return yield* endStopped(turn, "participation-ended", resume);
      }),
    );
  }, Operation.report);

  return TurnExecution.of({
    accept,
    start,
    joinedConversation,
    showDraft,
    close,
    fail,
    confirmStopped,
  });
});

/**
 * Internal service for turn jobs: callers are trusted to run what agents accepted.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(TurnExecution, make());
