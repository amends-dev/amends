import { Connection } from "../connection/connection.ts";
import { Environment as EnvironmentRuntime } from "@amends/environment";
import { type HarnessErrors, HarnessEvent } from "@amends/harness";
import { Transcript } from "@amends/harness";
import { type Redacted, Predicate } from "effect";
import { Context, Crypto, Data, DateTime, Effect, Layer, Option, Schema } from "effect";
import { type PlatformError } from "effect";
import { AgentStore } from "../agent/store.ts";
import { Authorization } from "../authorization/authorization.ts";
import { ConnectionCredentialStore } from "../connection/credential-store.ts";
import { ConnectionStore } from "../connection/store.ts";
import { EnvironmentCatalog } from "../environment/catalog.ts";
import { Environment } from "../environment/environment.ts";
import { EnvironmentStore } from "../environment/store.ts";
import { ThreadActivityKind } from "../thread/activity/kind.ts";
import type { ThreadActivity } from "../thread/activity/activity.ts";
import { ThreadActivityStore } from "../thread/activity/store.ts";
import { ThreadMessageActivity } from "../thread/message/activity.ts";
import { ThreadMessageStore } from "../thread/message/store.ts";
import { MemberStore } from "../workspace/member/store.ts";
import { SignalHub } from "../signal/hub.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Identity } from "../identity/identity.ts";
import { Actor } from "../identity/actor.ts";
import { Performer } from "../identity/performer.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Store } from "../journal/store.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import { ThreadQuery } from "../thread/query.ts";
import { ThreadMessage } from "../thread/message/message.ts";
import { ThreadMessagePermissions } from "../thread/message/permissions.ts";
import { ThreadCommand } from "../thread/command.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { NotActive, NotFound } from "./errors.ts";
import { TurnActivity } from "./activity.ts";
import { TurnCommand } from "./command.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

/** What a turn's runner or harness reported does not fit the turn it reported for. */
export class InvalidResponse extends Schema.TaggedError<InvalidResponse>()(
  "TurnExecution.InvalidResponse",
  { message: Schema.String },
) {}

export type Error =
  | TurnStore.Failure
  | NotificationStore.Failure
  | Log.ReadError
  | Log.WriteError
  | Schema.SchemaError
  | PlatformError.PlatformError
  | Projection.Error
  | InvalidResponse
  | NotFound
  | NotActive
  | TurnCommand.EndError;
export type PrepareError =
  | Error
  | AgentStore.Failure
  | ConnectionStore.Failure
  | ConnectionCredentialStore.Failure
  | EnvironmentStore.Failure
  | ThreadActivityStore.Failure
  | ThreadMessageStore.Failure
  | MemberStore.Failure;
export type CloseError =
  | Error
  | Exclude<ThreadQuery.AccessError, ThreadQuery.NotFound | Authorization.Denied>
  | ThreadQuery.ParticipantsError
  | ThreadCommand.Error;

/**
 * Everything execution needs to run a turn: the agent's instructions, the model access it runs
 * with and the connection's settings and key to reach it, its environment, the transcript it
 * continues, the input the harness has not taken in yet as one batch and piece by piece, its own
 * entries so far, how its attempts have gone, and what a provider last measured, from which
 * execution tells, against its model's limits, whether a checkpoint must come first. The key is
 * only ever handed to execution, redacted.
 */
export interface Plan {
  readonly turn: Turn.Record;
  /** The agent's instructions: as they were when the turn started, once it has. */
  readonly instructions: string;
  readonly selection: Turn.Selection;
  readonly connection: {
    /** The name its readers know it by, for wording what went wrong with it. */
    readonly name: string;
    readonly implementationId: string;
    readonly settings: Readonly<Record<string, string>>;
    readonly credential: Redacted.Redacted<string> | undefined;
  };
  readonly environment: Environment.Record;
  /** The running environment the turn's latest attempt worked in, to acquire again. */
  readonly reacquire: EnvironmentRuntime.Reference | undefined;
  /**
   * The harness session the turn last started there, and how many of its events the log has, for
   * a run to attach to when a run cut short left it at work.
   */
  readonly session: TurnLog.LatestSession | undefined;
  /**
   * What the turn continues from, before its own work, read from its agent's log for the thread
   * since the latest checkpoint; for the first turn there, the thread's messages before its input.
   */
  readonly history: ReadonlyArray<Transcript.Item>;
  /** The history followed by the turn's own work since the latest checkpoint. */
  readonly transcript: ReadonlyArray<Transcript.Item>;
  /**
   * Input the harness has not taken in: what was asked of the turn itself, such as a retry, then
   * the thread's input after what it took in, through what the turn accepted, if any.
   */
  readonly pending:
    | {
        /**
         * The batch's ID: the same input always gets the same one, so submitting it again after
         * a restart records it once.
         */
        readonly batchId: HarnessEvent.BatchId;
        /** How far the turn's input is taken in, which the batch follows. */
        readonly afterSequence: number;
        readonly throughSequence: number;
        readonly items: readonly [Transcript.Input, ...Array<Transcript.Input>];
      }
    | undefined;
  /** The turn's own entries. */
  readonly log: ReadonlyArray<TurnLog.Recorded>;
  /** Attempts to run the turn since it last got further. */
  readonly attempts: number;
  /** Why the turn last stopped short since it last got further. */
  readonly interruption: TurnLog.Interruption | undefined;
  /** The latest attempt died without recording why, as when its process did. */
  readonly diedLast: boolean;
  /** The thread's input the harness has not taken in, piece by piece, with where each came from. */
  readonly waiting: ReadonlyArray<TurnLog.Waiting>;
  /** Characters of input asked of the turn itself, which is always given and never summarized. */
  readonly fixed: number;
  /** What a provider last measured of the transcript since the latest checkpoint. */
  readonly measured: Transcript.Measured | undefined;
  /** How often the turn's model context proved full, and whether a checkpoint is owed for it. */
  readonly overflow: TurnLog.Overflow;
}

/**
 * What a turn needs next: nothing, since it finished; confirming that it stopped, since it was
 * asked to; failing it, since what it would run with is gone; or running it with its plan.
 */
export type Preparation = Data.TaggedEnum<{
  Finished: {};
  Stopping: {};
  Unrunnable: { readonly reason: string };
  Ready: { readonly plan: Plan };
}>;
export const Preparation = Data.taggedEnum<Preparation>();

/** How many activities one read takes; reads go on until the range is done. */
const pageSize = 100;
/**
 * How many characters of a message one piece holds: a longer message is given in pieces, so that
 * the older ones can be summarized when not everything fits, rather than the message cut.
 */
const pieceSize = 40_000;
/** How many characters of the thread's history one entry of the agent's log holds. */
const historyEntrySize = 200_000;

/**
 * The batch of input pending after `afterSequence`: its ID names the thread positions it covers,
 * and where the newest request of the turn itself it holds sits in the log, so two batches of
 * requests at one position stay apart.
 */
const pendingBatch = (
  turnId: Turn.Id,
  batch: {
    readonly afterSequence: number;
    readonly throughSequence: number;
    readonly requestedAt: Log.Position | undefined;
    readonly items: readonly [Transcript.Input, ...Array<Transcript.Input>];
  },
) => ({
  batchId: HarnessEvent.BatchId.make(
    `${turnId}/after:${batch.afterSequence}/through:${batch.throughSequence}` +
      (batch.requestedAt === undefined ? "" : `/requested:${batch.requestedAt}`),
  ),
  afterSequence: batch.afterSequence,
  throughSequence: batch.throughSequence,
  items: batch.items,
});

/**
 * How closing went: the turn closed, publishing the agent's reply if it had one; its input is not
 * all taken in, so execution continues with what is pending; it stopped as asked; or the agent
 * could no longer post where it worked, which failed it.
 */
export type Closing = Data.TaggedEnum<{
  Closed: { readonly messageIds: ReadonlyArray<ThreadMessage.Id> };
  InputPending: {};
  Stopped: {};
  Failed: { readonly reason: string };
}>;
export const Closing = Data.taggedEnum<Closing>();

/**
 * What execution records as it runs a turn: each step is its own commit, attributed to the turn's
 * agent. Execution is trusted: it runs what the agent accepted, and closing checks the agent's own
 * access before publishing for it.
 */
export interface Interface {
  /** The turn as stored, for execution to watch while it runs. */
  readonly get: (turnId: Turn.Id) => Effect.Effect<Turn.Record, Error>;
  /**
   * What a turn needs to run now, from the stores: its model access from the agent's current
   * configuration until it starts, then what it started with.
   */
  readonly prepare: (turnId: Turn.Id) => Effect.Effect<Preparation, PrepareError>;
  /**
   * Take a queued turn to run with this selection and the agent's instructions now, which the turn
   * keeps; any other turn is NotActive. The first turn of a participation records the thread's
   * history before its input in the agent's log.
   */
  readonly start: (
    turnId: Turn.Id,
    selection: Turn.Selection,
  ) => Effect.Effect<Turn.Record, PrepareError>;
  /**
   * Record that execution starts a harness session with this ID, before starting it: the events
   * recorded after are that session's.
   */
  readonly recordSession: (turnId: Turn.Id, sessionId: string) => Effect.Effect<void, Error>;
  /**
   * The running environment the turn last acquired, and its environment as stored now, whatever
   * its status, for releasing one a run that ended short left behind. None when it acquired none.
   */
  readonly readAcquiredEnvironment: (
    turnId: Turn.Id,
  ) => Effect.Effect<
    | { readonly environment: Environment.Record; readonly reference: EnvironmentRuntime.Reference }
    | undefined,
    Error | EnvironmentStore.Failure
  >;
  /** Record that execution begins a harness session for a running turn, or a summary for it. */
  readonly recordAttempt: (
    turnId: Turn.Id,
    kind: "session" | "summary",
  ) => Effect.Effect<void, Error>;
  /**
   * Record a checkpoint for a running turn: the summary of the older history, the newest exchanges
   * verbatim, and how far through the thread the summary took in input the turn had not taken in.
   * The turn's history, and the next turn's, starts from it, at the position returned.
   */
  readonly recordCheckpoint: (
    turnId: Turn.Id,
    checkpoint: {
      readonly summary: string;
      readonly kept: ReadonlyArray<Transcript.Item>;
      readonly through: number | null;
    },
  ) => Effect.Effect<Log.Position, Error>;
  /**
   * Record a batch of input submitted through a position of the thread, once per batch: the
   * position its thread input reaches, or where the turn's input stands when it holds only what was
   * asked of the turn itself. The first record of a batch stands: the items returned are what the
   * batch holds, which execution hands the harness.
   */
  readonly recordSubmission: (
    turnId: Turn.Id,
    batch: {
      readonly batchId: HarnessEvent.BatchId;
      readonly throughSequence: number;
      readonly items: readonly [Transcript.Input, ...Array<Transcript.Input>];
    },
  ) => Effect.Effect<readonly [Transcript.Input, ...Array<Transcript.Input>], Error>;
  /**
   * Record what the harness reported, in order. A batch the harness says it took in must be one
   * submitted, as it was recorded; it counts as taken in from then on.
   */
  readonly recordEvents: (
    turnId: Turn.Id,
    events: ReadonlyArray<HarnessEvent.Event>,
  ) => Effect.Effect<void, Error>;
  /**
   * Record the running environment an attempt works in, as spawning acquired it, so a later attempt
   * acquires the same one again. When a new sandbox took the place of the one the turn worked in,
   * the agent is told its earlier files are gone, with its next input.
   */
  readonly recordEnvironment: (
    turnId: Turn.Id,
    acquired: {
      readonly reference: EnvironmentRuntime.Reference;
      readonly filesystem: EnvironmentRuntime.Filesystem;
    },
  ) => Effect.Effect<void, Error>;
  /**
   * Show the turn's readers more of a response before it completes, as a signal: nothing is
   * recorded, and a turn no longer running shows nothing.
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
  /** Record that execution stopped before the turn finished, why in words, and what went wrong. */
  readonly recordInterruption: (
    turnId: Turn.Id,
    stop: {
      readonly reason: string;
      readonly retryable: boolean;
      readonly problem: HarnessErrors.Problem;
    },
  ) => Effect.Effect<void, Error>;
  /** The turn's own entries in its agent's log for the thread. */
  readonly readEntries: (turnId: Turn.Id) => Effect.Effect<ReadonlyArray<TurnLog.Recorded>, Error>;
  /**
   * Close a running turn once all its accepted input is taken in and no more work waits for its
   * agent on the thread: publish the replies its log owes, in order, each as its own message to
   * the thread's current participants, and record completion, in one commit.
   */
  readonly close: (turnId: Turn.Id) => Effect.Effect<Closing, CloseError>;
  /** The turn could not continue. */
  readonly fail: (turnId: Turn.Id, reason: string) => Effect.Effect<void, Error>;
  /** Execution stopped a turn asked to stop. */
  readonly confirmStopped: (turnId: Turn.Id) => Effect.Effect<void, Error>;
}

export class Service extends Context.Service<Service, Interface>()(
  "@amends/core/turn/execution/Service",
) {}

/** @category constructors */
export const make = Effect.fn("TurnExecution.make")(function* () {
  const turnStore = yield* TurnStore.Service;
  const notificationStore = yield* NotificationStore.Service;
  const threadQuery = yield* ThreadQuery.Service;
  const threadCommand = yield* ThreadCommand.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const agentStore = yield* AgentStore.Service;
  const connectionStore = yield* ConnectionStore.Service;
  const connectionCredentialStore = yield* ConnectionCredentialStore.Service;
  const environmentStore = yield* EnvironmentStore.Service;
  const environmentCatalog = yield* EnvironmentCatalog.Service;
  const threadActivityStore = yield* ThreadActivityStore.Service;
  const threadMessageStore = yield* ThreadMessageStore.Service;
  const memberStore = yield* MemberStore.Service;
  const signalHub = yield* SignalHub.Service;
  const turnCommand = yield* TurnCommand.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const requireTurn = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turnStore.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    return found.value;
  });
  const agentIdentityOf = (turn: Turn.Record) =>
    Identity.MemberReference.cases.Agent.make({ id: turn.agentId });
  /** Run a step as the turn's agent, attributed to it, in its own commit. */
  const runAsAgent =
    (turnId: Turn.Id) =>
    <A, E, R>(step: (turn: Turn.Record) => Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const turn = yield* requireTurn(turnId);
        const identity = agentIdentityOf(turn);
        const provenance = yield* Publication.make(
          workspaceId,
          Performer.Reference.cases.Member.make({ memberId: turn.memberId, identity }),
        );
        return yield* step(turn).pipe(
          Effect.provideService(Publication.Service, provenance),
          Effect.provideService(Actor.Service, {
            workspaceId,
            memberId: turn.memberId,
            identity,
          }),
        );
      }).pipe(Effect.provideService(Crypto.Crypto, crypto), journal.commit);
  const factFieldsOf = (turn: Turn.Record) => ({
    workspaceId,
    groupId: turn.groupId,
    threadId: turn.threadId,
    memberId: turn.memberId,
    turnId: turn.id,
  });
  const requireStatus = (turn: Turn.Record, statuses: ReadonlyArray<Turn.Status>) =>
    statuses.includes(turn.status)
      ? Effect.void
      : Effect.fail(new NotActive({ turnId: turn.id, status: turn.status }));
  const submissionKeyOf = (batchId: string) => Log.IdempotencyKey.make(`submitted:${batchId}`);

  /** Every thread message in a sequence range, oldest first, read a page at a time. */
  const readMessagesBetween = Effect.fnUntraced(function* (
    turn: Turn.Record,
    range: { readonly after?: number; readonly through: number },
  ) {
    if (range.through < 1 || (range.after !== undefined && range.after >= range.through)) return [];
    const all: Array<ThreadActivity.Record> = [];
    let after = range.after ?? 0;
    for (;;) {
      const page = yield* threadActivityStore.readPage(turn.threadId, {
        afterSequence: after,
        beforeSequence: range.through + 1,
        from: "oldest",
        limit: pageSize,
      });
      all.push(...page);
      const last = page.at(-1);
      if (last === undefined || page.length < pageSize || last.sequence >= range.through) break;
      after = last.sequence;
    }
    const published = all
      .filter(ThreadActivityKind.is(ThreadMessageActivity.Published))
      .toSorted((left, right) => left.sequence - right.sequence);
    const ids = yield* Effect.forEach(published, (activity) =>
      Effect.map(
        ThreadActivityKind.decode(ThreadMessageActivity.Published, activity),
        (decoded) => ({
          sequence: activity.sequence,
          messageId: decoded.details.messageId,
        }),
      ),
    ).pipe(Effect.orDie);
    const found = new Map(
      (yield* threadMessageStore.getMany(ids.map((entry) => entry.messageId))).map((message) => [
        message.id as string,
        message,
      ]),
    );
    return ids.flatMap((entry) => {
      const message = found.get(entry.messageId);
      return message === undefined ? [] : [{ sequence: entry.sequence, message }];
    });
  });
  /** Who said something, as the model is told: a member by name, or a contact. */
  const nameAuthors = Effect.fnUntraced(function* (
    list: ReadonlyArray<{ readonly message: ThreadMessage.Record }>,
  ) {
    const memberIds = [
      ...new Set(
        list.flatMap(({ message }) =>
          ThreadMessage.Author.isAnyOf(["Member"])(message.author) ? [message.author.memberId] : [],
        ),
      ),
    ];
    const named = new Map(
      (yield* memberStore.getMany(memberIds)).map((member) => [member.id as string, member.name]),
    );
    return (author: ThreadMessage.Author): Transcript.Author =>
      ThreadMessage.Author.isAnyOf(["Member"])(author)
        ? { id: author.memberId, name: named.get(author.memberId) ?? "A member" }
        : { id: author.contactId, name: "A contact" };
  });

  /** The agent's log for the thread a turn belongs to. */
  const openAgentLog = (turn: Turn.Record) => TurnLog.open(log, turn.participationId);
  /** The position just before one, to read from it: none before the first. */
  const positionBefore = (position: Log.Position | null): Log.Position | undefined =>
    position === null || position === 0 ? undefined : Log.Position.make(position - 1);
  /** A turn's own entries: from where it began until another turn's. */
  const readOwnEntries = (turn: Turn.Record) => TurnLog.readTurnEntries(log, turn);
  /** How far a turn's input is taken in, as its own entries say. */
  const readIncorporatedThrough = Effect.fnUntraced(function* (turn: Turn.Record) {
    return TurnLog.read(yield* readOwnEntries(turn)).incorporatedThrough(turn.inputAfterSequence);
  });
  /**
   * What a turn continues from: its agent's log for the thread read from the latest checkpoint the
   * turn knew when it was created, or from the start while there was none, and far enough back
   * for the turn's own entries. Reading on finds any checkpoint the turn recorded since.
   */
  const readContext = Effect.fnUntraced(function* (turn: Turn.Record) {
    const from =
      turn.historyFrom === null || turn.logAfter === null
        ? undefined
        : positionBefore(Log.Position.make(Math.min(turn.historyFrom, turn.logAfter + 1)));
    return TurnLog.buildContext(
      yield* TurnLog.readRecordsAfter(log, turn.participationId, from),
      turn.id,
    );
  });
  /** A message as the model is told it: from its author, in pieces when it is long. */
  const toInputs = (
    message: ThreadMessage.Record,
    author: (author: ThreadMessage.Author) => Transcript.Author,
  ) =>
    TurnLog.splitIntoPieces(message.text, pieceSize).map((text): Transcript.Input => ({
      _tag: "Input",
      author: author(message.author),
      content: [{ _tag: "Text", text }],
    }));
  /**
   * The thread's messages before a turn's input, as its agent's first history there: others' as
   * input and the agent's own as its responses, every message, in pieces when long.
   */
  const readThreadHistory = Effect.fnUntraced(function* (turn: Turn.Record) {
    const earlier = yield* readMessagesBetween(turn, { through: turn.inputAfterSequence });
    const author = yield* nameAuthors(earlier);
    return earlier.flatMap(({ message }): ReadonlyArray<Transcript.Item> =>
      ThreadMessage.Author.isAnyOf(["Member"])(message.author) &&
      message.author.memberId === turn.memberId
        ? TurnLog.splitIntoPieces(message.text, pieceSize).map((text, index) => ({
            _tag: "Response",
            id: `message:${message.id}${index === 0 ? "" : `/${index}`}` as Transcript.ResponseId,
            parts: [{ _tag: "Text", text }],
          }))
        : toInputs(message, author),
    );
  });

  const prepare = Effect.fn("TurnExecution.prepare")(function* (turnId: Turn.Id) {
    const turn = yield* requireTurn(turnId);
    if (!Turn.active(turn.status)) return Preparation.Finished();
    if (turn.status === "cancelling") return Preparation.Stopping();
    const agent = yield* agentStore.get(turn.agentId);
    if (Option.isNone(agent))
      return Preparation.Unrunnable({ reason: "The agent no longer exists." });
    const selection: Turn.Selection = turn.selection ?? {
      connectionId: agent.value.model.connectionId,
      model: agent.value.model.model,
      reasoning: agent.value.model.reasoning,
      environmentId: agent.value.environmentId,
    };
    const connection = yield* connectionStore.get(selection.connectionId);
    if (Option.isNone(connection) || connection.value.status !== "active")
      return Preparation.Unrunnable({
        reason: "The agent's model connection is no longer available.",
      });
    const authentication = connection.value.authentication;
    let credential: Redacted.Redacted<string> | undefined;
    if (Connection.Authentication.isAnyOf(["ApiKey"])(authentication)) {
      if (authentication.credentialId === null)
        return Preparation.Unrunnable({ reason: `${connection.value.name} needs its API key.` });
      const stored = yield* connectionCredentialStore
        .get(authentication.credentialId)
        .pipe(Effect.catchTag("ConnectionCredentialStore.Unavailable", () => Effect.succeedNone));
      if (Option.isNone(stored))
        return Preparation.Unrunnable({
          reason: `${connection.value.name}'s API key can't be read on this server.`,
        });
      credential = stored.value.secret;
    }
    const environment = yield* environmentStore.get(selection.environmentId);
    if (Option.isNone(environment) || environment.value.status !== "active")
      return Preparation.Unrunnable({ reason: "The agent's environment is no longer available." });
    if (Option.isNone(environmentCatalog.harness(environment.value.harnessId)))
      return Preparation.Unrunnable({
        reason: `The ${environment.value.harnessId} harness is not installed on this server.`,
      });
    const context = yield* readContext(turn);
    const incorporated = context.own.incorporatedThrough(turn.inputAfterSequence);
    const messages = (yield* readMessagesBetween(turn, {
      after: incorporated,
      through: turn.acceptedThroughSequence,
    })).filter(
      ({ message }) =>
        !(
          ThreadMessage.Author.isAnyOf(["Member"])(message.author) &&
          message.author.memberId === turn.memberId
        ),
    );
    const author = yield* nameAuthors(messages);
    const waiting = messages.flatMap(({ sequence, message }) =>
      toInputs(message, author).map((item): TurnLog.Waiting => ({ sequence, item })),
    );
    // Until the first turn of a participation starts, its history is the thread's, which starting
    // records in the agent's log.
    const seeded = context.begun ? undefined : yield* readThreadHistory(turn);
    const history = seeded ?? context.history;
    const transcript = seeded === undefined ? context.transcript : context.own.transcript(seeded);
    const [first, ...rest] = [...context.own.requested, ...waiting.map(({ item }) => item)];
    const plan: Plan = {
      turn,
      instructions: context.own.started?.instructions ?? agent.value.instructions,
      selection,
      connection: {
        name: connection.value.name,
        implementationId: connection.value.implementationId,
        settings: connection.value.settings,
        credential,
      },
      environment: environment.value,
      reacquire: context.own.environment,
      session: context.own.session,
      history,
      transcript,
      pending:
        first === undefined
          ? undefined
          : pendingBatch(turn.id, {
              afterSequence: incorporated,
              throughSequence: waiting.length > 0 ? turn.acceptedThroughSequence : incorporated,
              requestedAt: context.own.requested.length > 0 ? context.own.requestedAt : undefined,
              items: [first, ...rest],
            }),
      log: context.entries,
      attempts: context.own.attempts,
      interruption: context.own.interruption,
      diedLast: context.own.diedLast,
      waiting,
      // What a request asks of the turn itself is always given.
      fixed: Transcript.characters(context.own.requested),
      measured: context.measured,
      overflow: context.own.overflow,
    };
    return Preparation.Ready({ plan });
  });

  const start = Effect.fn("TurnExecution.start")(function* (
    turnId: Turn.Id,
    selection: Turn.Selection,
  ) {
    const chosen = yield* Schema.decodeEffect(Schema.toType(Turn.Selection))(selection);
    return yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["queued"]);
        const agent = yield* agentStore.get(turn.agentId);
        if (Option.isNone(agent)) return yield* Effect.die("A turn's agent is missing");
        // The first turn of a participation records the thread's history before its input, so
        // later turns read it from the agent's log rather than from the thread, in entries of a
        // bounded size however long the thread.
        const entries: Array<TurnLog.Entry> = [];
        if (!(yield* readContext(turn)).begun) {
          const items = yield* readThreadHistory(turn);
          let held: Array<Transcript.Item> = [];
          for (const item of items) {
            if (held.length > 0 && Transcript.characters([...held, item]) > historyEntrySize) {
              entries.push({ _tag: "History", turnId: turn.id, items: held });
              held = [];
            }
            held.push(item);
          }
          entries.push({ _tag: "History", turnId: turn.id, items: held });
        }
        entries.push({
          _tag: "Started",
          turnId: turn.id,
          selection: chosen,
          instructions: agent.value.instructions,
        });
        yield* openAgentLog(turn).appendAll(entries);
        const startedAt = yield* DateTime.now;
        const event = yield* journal.publish(
          TurnFacts.Started,
          Object.assign(factFieldsOf(turn), { selection: chosen, startedAt }),
        );
        yield* turnCommand.recordActivity(
          turn.threadId,
          TurnActivity.Started,
          { turnId: turn.id },
          event,
        );
        return Turn.change(turn, { status: "running", selection: chosen, startedAt });
      }),
    );
  });

  const recordCheckpoint = Effect.fn("TurnExecution.recordCheckpoint")(function* (
    turnId: Turn.Id,
    recorded: {
      readonly summary: string;
      readonly kept: ReadonlyArray<Transcript.Item>;
      readonly through: number | null;
    },
  ) {
    return yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["running"]);
        const summary = yield* Schema.decodeEffect(Schema.NonEmptyString)(recorded.summary);
        const through = recorded.through;
        if (
          through !== null &&
          (through <= (yield* readIncorporatedThrough(turn)) ||
            through > turn.acceptedThroughSequence)
        )
          return yield* new InvalidResponse({
            message: "A checkpoint can take in only input the turn accepted and has not taken in",
          });
        // The input the summary takes in counts as taken in from here on.
        const entry = yield* openAgentLog(turn).append({
          _tag: "Checkpoint",
          turnId: turn.id,
          summary,
          kept: recorded.kept,
          through,
        });
        return entry.position;
      }),
    );
  });

  /** The batch as the turn's log recorded it, if it did. */
  const findSubmittedBatch = Effect.fnUntraced(function* (
    turn: Turn.Record,
    batchId: HarnessEvent.BatchId,
  ) {
    const found = yield* openAgentLog(turn).getAppend(submissionKeyOf(batchId));
    const entry = Option.getOrUndefined(found)?.[0]?.payload;
    return Predicate.isTagged(entry, "Submitted") ? entry : undefined;
  });

  const recordSubmission = Effect.fn("TurnExecution.recordSubmission")(function* (
    turnId: Turn.Id,
    batch: {
      readonly batchId: HarnessEvent.BatchId;
      readonly throughSequence: number;
      readonly items: readonly [Transcript.Input, ...Array<Transcript.Input>];
    },
  ) {
    return yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["running", "cancelling"]);
        // A batch submitted again, as after a restart, holds what it held the first time.
        const recorded = yield* findSubmittedBatch(turn, batch.batchId);
        if (recorded !== undefined) return recorded.items;
        if (
          batch.throughSequence < (yield* readIncorporatedThrough(turn)) ||
          batch.throughSequence > turn.acceptedThroughSequence
        )
          return yield* new InvalidResponse({
            message: "A batch must cover input the turn accepted",
          });
        yield* openAgentLog(turn).append(
          {
            _tag: "Submitted",
            turnId: turn.id,
            batchId: batch.batchId,
            throughSequence: batch.throughSequence,
            items: batch.items,
          },
          { idempotencyKey: submissionKeyOf(batch.batchId) },
        );
        return batch.items;
      }),
    );
  });

  const sameInput = Schema.toEquivalence(Schema.Array(Transcript.Input));

  const recordEvents = Effect.fn("TurnExecution.recordEvents")(function* (
    turnId: Turn.Id,
    events: ReadonlyArray<HarnessEvent.Event>,
  ) {
    yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["running", "cancelling"]);
        // Input the harness took in is a batch execution submitted, exactly as recorded.
        for (const event of events) {
          if (!HarnessEvent.Event.isAnyOf(["InputIncorporated"])(event)) continue;
          const recorded = yield* findSubmittedBatch(turn, event.batch.id);
          if (recorded === undefined)
            return yield* new InvalidResponse({
              message: "Incorporated input was never submitted",
            });
          if (!sameInput(recorded.items, event.batch.items))
            return yield* new InvalidResponse({
              message: "The harness took in other input than it was given",
            });
        }
        if (events.length > 0)
          yield* openAgentLog(turn).appendAll(
            events.map((event): TurnLog.Entry => ({ _tag: "Harness", turnId: turn.id, event })),
          );
      }),
    );
  });

  const recordEnvironment = Effect.fn("TurnExecution.recordEnvironment")(function* (
    turnId: Turn.Id,
    acquired: {
      readonly reference: EnvironmentRuntime.Reference;
      readonly filesystem: EnvironmentRuntime.Filesystem;
    },
  ) {
    yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["running", "cancelling"]);
        const previous = TurnLog.read(yield* readOwnEntries(turn)).environment;
        const entries: Array<TurnLog.Entry> = [
          { _tag: "Environment", turnId: turn.id, ...acquired },
        ];
        if (TurnLog.lostFiles(previous, acquired))
          entries.push({ _tag: "Requested", turnId: turn.id, input: TurnLog.lostFilesNote });
        yield* openAgentLog(turn).appendAll(entries);
      }),
    );
  });

  const recordSession = Effect.fn("TurnExecution.recordSession")(function* (
    turnId: Turn.Id,
    sessionId: string,
  ) {
    yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["running", "cancelling"]);
        const id = yield* Schema.decodeEffect(Schema.NonEmptyString)(sessionId);
        yield* openAgentLog(turn).append({ _tag: "Session", turnId: turn.id, sessionId: id });
      }),
    );
  });

  const readAcquiredEnvironment = Effect.fn("TurnExecution.readAcquiredEnvironment")(function* (
    turnId: Turn.Id,
  ) {
    const turn = yield* requireTurn(turnId);
    const reference = TurnLog.read(yield* readOwnEntries(turn)).environment;
    if (reference === undefined) return undefined;
    const environment = yield* environmentStore.get(Environment.Id.make(reference.definitionId));
    return Option.isNone(environment) ? undefined : { environment: environment.value, reference };
  });

  const recordAttempt = Effect.fn("TurnExecution.recordAttempt")(function* (
    turnId: Turn.Id,
    kind: "session" | "summary",
  ) {
    yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["running", "cancelling"]);
        yield* openAgentLog(turn).append({ _tag: "Attempt", turnId: turn.id, kind });
      }),
    );
  });

  const recordInterruption = Effect.fn("TurnExecution.recordInterruption")(function* (
    turnId: Turn.Id,
    stop: {
      readonly reason: string;
      readonly retryable: boolean;
      readonly problem: HarnessErrors.Problem;
    },
  ) {
    yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["running", "cancelling"]);
        const reason = yield* Schema.decodeEffect(Schema.NonEmptyString)(stop.reason);
        yield* openAgentLog(turn).append({
          _tag: "Interrupted",
          turnId: turn.id,
          reason,
          retryable: stop.retryable,
          problem: stop.problem,
        });
        return turn;
      }),
    );
  });

  const showDraft = Effect.fn("TurnExecution.showDraft")(function* (
    turnId: Turn.Id,
    piece: {
      readonly responseId: string;
      readonly part: number;
      readonly offset: number;
      readonly text: string;
    },
  ) {
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
  });

  const readEntries = Effect.fn("TurnExecution.readEntries")(function* (turnId: Turn.Id) {
    return yield* readOwnEntries(yield* requireTurn(turnId));
  });

  const close = Effect.fn("TurnExecution.close")(function* (turnId: Turn.Id) {
    return yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        if (turn.status === "cancelling") {
          yield* turnCommand.endTurn(turn, {
            outcome: "cancelled",
            cancelReason: turn.cancelReason,
          });
          return Closing.Stopped();
        }
        yield* requireStatus(turn, ["running"]);
        const reading = TurnLog.read(yield* readOwnEntries(turn));
        if (reading.incorporatedThrough(turn.inputAfterSequence) < turn.acceptedThroughSequence)
          return Closing.InputPending();
        // Work its agent has not accepted yet is still this turn's to consider before closing;
        // accepting it extends the turn, and execution takes it in.
        const waiting = yield* notificationStore.listPendingByThread(
          Notification.ofMember(turn.memberId, agentIdentityOf(turn)),
          turn.threadId,
          Number.MAX_SAFE_INTEGER,
        );
        if (waiting.length > 0) return Closing.InputPending();
        const messageIds: Array<ThreadMessage.Id> = [];
        if (reading.replies.length > 0) {
          const failTurn = (reason: string) =>
            Effect.gen(function* () {
              yield* turnCommand.endTurn(turn, { outcome: "failed", reason });
              return Closing.Failed({ reason });
            });
          const thread = yield* threadQuery.requireAccess(turn.threadId).pipe(
            Effect.asSome,
            Effect.catchTags({
              "ThreadQuery.NotFound": () => Effect.succeedNone,
              "Authorization.Denied": () => Effect.succeedNone,
            }),
          );
          if (Option.isNone(thread))
            return yield* failTurn("The agent can no longer open this thread.");
          const permitted = yield* authorization.permitted([
            Requirement.make(ThreadMessagePermissions.Publish, {
              _tag: "Thread",
              workspaceId,
              threadId: turn.threadId,
            }),
          ]);
          if (permitted[0] !== true)
            return yield* failTurn("The agent may no longer post in this thread.");
          const current = yield* threadQuery.currentParticipants(thread.value);
          const agent: ThreadParticipation.Reference = { _tag: "Member", memberId: turn.memberId };
          if (
            !current.some(
              (p) => ThreadParticipation.keyOf(p.participant) === ThreadParticipation.keyOf(agent),
            )
          )
            return yield* failTurn("The agent no longer takes part in this thread.");
          const texts: Array<typeof ThreadMessage.Text.Type> = [];
          for (const reply of reading.replies) {
            const text = yield* Schema.decodeEffect(ThreadMessage.Text)(reply.text).pipe(
              Effect.asSome,
              Effect.catchTag("SchemaError", () => Effect.succeedNone),
            );
            if (Option.isNone(text))
              return yield* failTurn("The agent's reply could not be posted.");
            texts.push(text.value);
          }
          // Each answer is its own message, in the order the agent gave them.
          for (const text of texts) {
            const published = yield* threadCommand.publishMessage({
              messageId: ThreadMessage.Id.make(yield* crypto.randomUUIDv4),
              threadId: turn.threadId,
              author: { _tag: "Member", memberId: turn.memberId },
              text,
              mentions: [],
              participants: current.map((p) => ThreadParticipation.referenceOf(p.participant)),
              occurredAt: yield* DateTime.now,
              turnId: turn.id,
            });
            messageIds.push(published.message.id);
          }
        }
        yield* turnCommand.endTurn(turn, { outcome: "completed", messageIds });
        return Closing.Closed({ messageIds });
      }),
    );
  });

  const fail = Effect.fn("TurnExecution.fail")(function* (turnId: Turn.Id, reason: string) {
    yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["queued", "running", "cancelling"]);
        const failure = yield* Schema.decodeEffect(Schema.NonEmptyString)(reason);
        yield* turnCommand.endTurn(turn, { outcome: "failed", reason: failure });
      }),
    );
  });

  const confirmStopped = Effect.fn("TurnExecution.confirmStopped")(function* (turnId: Turn.Id) {
    yield* runAsAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* requireStatus(turn, ["cancelling"]);
        yield* turnCommand.endTurn(turn, { outcome: "cancelled", cancelReason: turn.cancelReason });
      }),
    );
  });

  const get = Effect.fn("TurnExecution.get")(function* (turnId: Turn.Id) {
    return yield* requireTurn(turnId);
  });

  return Service.of({
    get,
    prepare,
    start,
    recordAttempt,
    recordCheckpoint,
    recordSubmission,
    recordEvents,
    recordEnvironment,
    recordSession,
    readAcquiredEnvironment,
    showDraft,
    recordInterruption,
    readEntries,
    close,
    fail,
    confirmStopped,
  });
});

/** Internal service for execution: callers are trusted to run what agents accepted. @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnExecution from "./execution.ts";
