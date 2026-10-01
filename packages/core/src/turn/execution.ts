import type { Environment as EnvironmentRuntime } from "@amends/environment";
import type { HarnessErrors, HarnessEvent } from "@amends/harness";
import { Transcript } from "@amends/harness";
import type { Redacted } from "effect";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
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
import { Signals } from "../signal/signals.ts";
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
export type Preparation =
  | { readonly _tag: "Finished" }
  | { readonly _tag: "Stopping" }
  | { readonly _tag: "Unrunnable"; readonly reason: string }
  | { readonly _tag: "Ready"; readonly plan: Plan };

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
 * How closing went: the turn closed, publishing the agent's reply if it had one; its input is not
 * all taken in, so execution continues with what is pending; it stopped as asked; or the agent
 * could no longer post where it worked, which failed it.
 */
export type Closing =
  | { readonly _tag: "Closed"; readonly messageIds: ReadonlyArray<ThreadMessage.Id> }
  | { readonly _tag: "InputPending" }
  | { readonly _tag: "Stopped" }
  | { readonly _tag: "Failed"; readonly reason: string };

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
  /** Record that execution begins a harness session for a running turn, or a summary for it. */
  readonly attempt: (turnId: Turn.Id, kind: "session" | "summary") => Effect.Effect<void, Error>;
  /**
   * Record a checkpoint for a running turn: the summary of the older history, the newest exchanges
   * verbatim, and how far through the thread the summary took in input the turn had not taken in.
   * The turn's history, and the next turn's, starts from it, at the position returned.
   */
  readonly checkpoint: (
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
  readonly submitted: (
    turnId: Turn.Id,
    batch: {
      readonly batchId: HarnessEvent.BatchId;
      readonly throughSequence: number;
      readonly items: readonly [Transcript.Input, ...Array<Transcript.Input>];
    },
  ) => Effect.Effect<readonly [Transcript.Input, ...Array<Transcript.Input>], Error>;
  /**
   * Record what the environment and its harness reported, in order. A batch the harness says it
   * took in must be one submitted, as it was recorded; it counts as taken in from then on.
   */
  readonly report: (
    turnId: Turn.Id,
    events: ReadonlyArray<EnvironmentRuntime.Event>,
  ) => Effect.Effect<void, Error>;
  /**
   * Show the turn's readers more of a response before it completes, as a signal: nothing is
   * recorded, and a turn no longer running shows nothing.
   */
  readonly draft: (
    turnId: Turn.Id,
    piece: {
      readonly responseId: string;
      readonly part: number;
      readonly offset: number;
      readonly text: string;
    },
  ) => Effect.Effect<void, Error>;
  /** Record that execution stopped before the turn finished, why in words, and what went wrong. */
  readonly interrupted: (
    turnId: Turn.Id,
    stop: {
      readonly reason: string;
      readonly retryable: boolean;
      readonly problem: HarnessErrors.Problem;
    },
  ) => Effect.Effect<void, Error>;
  /** The turn's own entries in its agent's log for the thread. */
  readonly entries: (turnId: Turn.Id) => Effect.Effect<ReadonlyArray<TurnLog.Recorded>, Error>;
  /**
   * Close a running turn once all its accepted input is taken in and no more work waits for its
   * agent on the thread: publish the replies its log owes, in order, each as its own message to
   * the thread's current participants, and record completion, in one commit.
   */
  readonly close: (turnId: Turn.Id) => Effect.Effect<Closing, CloseError>;
  /** The turn could not continue. */
  readonly fail: (turnId: Turn.Id, reason: string) => Effect.Effect<void, Error>;
  /** Execution stopped a turn asked to stop. */
  readonly stopped: (turnId: Turn.Id) => Effect.Effect<void, Error>;
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
  const signals = yield* Signals.Service;
  const turnCommand = yield* TurnCommand.Service;
  const crypto = yield* Crypto.Crypto;
  const { workspaceId } = yield* Store.Service;

  const load = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turnStore.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    return found.value;
  });
  const identityOf = (turn: Turn.Record) =>
    Identity.MemberReference.cases.Agent.make({ id: turn.agentId });
  /** Run a step as the turn's agent, attributed to it, in its own commit. */
  const asAgent =
    (turnId: Turn.Id) =>
    <A, E, R>(step: (turn: Turn.Record) => Effect.Effect<A, E, R>) =>
      Effect.gen(function* () {
        const turn = yield* load(turnId);
        const identity = identityOf(turn);
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
  const where = (turn: Turn.Record) => ({
    workspaceId,
    groupId: turn.groupId,
    threadId: turn.threadId,
    turnId: turn.id,
  });
  const require = (turn: Turn.Record, statuses: ReadonlyArray<Turn.Status>) =>
    statuses.includes(turn.status)
      ? Effect.void
      : Effect.fail(new NotActive({ turnId: turn.id, status: turn.status }));
  const submittedKey = (batchId: string) => Log.IdempotencyKey.make(`submitted:${batchId}`);

  /** Every thread message in a sequence range, oldest first, read a page at a time. */
  const messagesIn = Effect.fnUntraced(function* (
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
  const authorsOf = Effect.fnUntraced(function* (
    list: ReadonlyArray<{ readonly message: ThreadMessage.Record }>,
  ) {
    const memberIds = [
      ...new Set(
        list.flatMap(({ message }) =>
          message.author._tag === "Member" ? [message.author.memberId] : [],
        ),
      ),
    ];
    const named = new Map(
      (yield* memberStore.getMany(memberIds)).map((member) => [member.id as string, member.name]),
    );
    return (author: ThreadMessage.Author): Transcript.Author =>
      author._tag === "Member"
        ? { id: author.memberId, name: named.get(author.memberId) ?? "A member" }
        : { id: author.contactId, name: "A contact" };
  });

  /** The agent's log for the thread a turn belongs to. */
  const logOf = (turn: Turn.Record) => TurnLog.open(log, turn.participationId);
  /** The position just before one, to read from it: none before the first. */
  const before = (position: Log.Position | null): Log.Position | undefined =>
    position === null || position === 0 ? undefined : Log.Position.make(position - 1);
  /** A turn's own entries: from where it began until another turn's. */
  const ownRecords = (turn: Turn.Record) => TurnLog.entriesOf(log, turn);
  /** How far a turn's input is taken in, as its own entries say. */
  const incorporatedOf = Effect.fnUntraced(function* (turn: Turn.Record) {
    return TurnLog.read(yield* ownRecords(turn)).incorporatedThrough(turn.inputAfterSequence);
  });
  /**
   * What a turn continues from: its agent's log for the thread read from the latest checkpoint the
   * turn knew when it was created, or from the start while there was none, and far enough back
   * for the turn's own entries. Reading on finds any checkpoint the turn recorded since.
   */
  const contextOf = Effect.fnUntraced(function* (turn: Turn.Record) {
    const from =
      turn.historyFrom === null || turn.logAfter === null
        ? undefined
        : before(Log.Position.make(Math.min(turn.historyFrom, turn.logAfter + 1)));
    return TurnLog.context(yield* TurnLog.recordsAfter(log, turn.participationId, from), turn.id);
  });
  /** A message as the model is told it: from its author, in pieces when it is long. */
  const inputsOf = (
    message: ThreadMessage.Record,
    author: (author: ThreadMessage.Author) => Transcript.Author,
  ) =>
    TurnLog.pieces(message.text, pieceSize).map((text): Transcript.Input => ({
      _tag: "Input",
      author: author(message.author),
      content: [{ _tag: "Text", text }],
    }));
  /**
   * The thread's messages before a turn's input, as its agent's first history there: others' as
   * input and the agent's own as its responses, every message, in pieces when long.
   */
  const threadHistory = Effect.fnUntraced(function* (turn: Turn.Record) {
    const earlier = yield* messagesIn(turn, { through: turn.inputAfterSequence });
    const author = yield* authorsOf(earlier);
    return earlier.flatMap(({ message }): ReadonlyArray<Transcript.Item> =>
      message.author._tag === "Member" && message.author.memberId === turn.memberId
        ? TurnLog.pieces(message.text, pieceSize).map((text, index) => ({
            _tag: "Response",
            id: `message:${message.id}${index === 0 ? "" : `/${index}`}` as Transcript.ResponseId,
            parts: [{ _tag: "Text", text }],
          }))
        : inputsOf(message, author),
    );
  });

  const prepare = Effect.fn("TurnExecution.prepare")(function* (turnId: Turn.Id) {
    const turn = yield* load(turnId);
    if (!Turn.active(turn.status)) return { _tag: "Finished" } as const;
    if (turn.status === "cancelling") return { _tag: "Stopping" } as const;
    const unrunnable = (reason: string) => ({ _tag: "Unrunnable", reason }) as const;
    const agent = yield* agentStore.get(turn.agentId);
    if (Option.isNone(agent)) return unrunnable("The agent no longer exists.");
    const selection: Turn.Selection = turn.selection ?? {
      connectionId: agent.value.model.connectionId,
      model: agent.value.model.model,
      reasoning: agent.value.model.reasoning,
      environmentId: agent.value.environmentId,
    };
    const connection = yield* connectionStore.get(selection.connectionId);
    if (Option.isNone(connection) || connection.value.status !== "active")
      return unrunnable("The agent's model connection is no longer available.");
    const authentication = connection.value.authentication;
    let credential: Redacted.Redacted<string> | undefined;
    if (authentication._tag === "ApiKey") {
      if (authentication.credentialId === null)
        return unrunnable(`${connection.value.name} needs its API key.`);
      const stored = yield* connectionCredentialStore
        .get(authentication.credentialId)
        .pipe(Effect.catchTag("ConnectionCredentialStore.Unavailable", () => Effect.succeedNone));
      if (Option.isNone(stored))
        return unrunnable(`${connection.value.name}'s API key can't be read on this server.`);
      credential = stored.value.secret;
    }
    const environment = yield* environmentStore.get(selection.environmentId);
    if (Option.isNone(environment) || environment.value.status !== "active")
      return unrunnable("The agent's environment is no longer available.");
    if (Option.isNone(environmentCatalog.harness(environment.value.harnessId)))
      return unrunnable(
        `The ${environment.value.harnessId} harness is not installed on this server.`,
      );
    const context = yield* contextOf(turn);
    const incorporated = context.own.incorporatedThrough(turn.inputAfterSequence);
    const messages = (yield* messagesIn(turn, {
      after: incorporated,
      through: turn.acceptedThroughSequence,
    })).filter(
      ({ message }) =>
        !(message.author._tag === "Member" && message.author.memberId === turn.memberId),
    );
    const author = yield* authorsOf(messages);
    const waiting = messages.flatMap(({ sequence, message }) =>
      inputsOf(message, author).map((item): TurnLog.Waiting => ({ sequence, item })),
    );
    // Until the first turn of a participation starts, its history is the thread's, which starting
    // records in the agent's log.
    const seeded = context.begun ? undefined : yield* threadHistory(turn);
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
      history,
      transcript,
      pending:
        first === undefined
          ? undefined
          : {
              afterSequence: incorporated,
              throughSequence: waiting.length > 0 ? turn.acceptedThroughSequence : incorporated,
              items: [first, ...rest],
            },
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
    return { _tag: "Ready", plan } as const;
  });

  const start = Effect.fn("TurnExecution.start")(function* (
    turnId: Turn.Id,
    selection: Turn.Selection,
  ) {
    const chosen = yield* Schema.decodeEffect(Schema.toType(Turn.Selection))(selection);
    return yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["queued"]);
        const agent = yield* agentStore.get(turn.agentId);
        if (Option.isNone(agent)) return yield* Effect.die("A turn's agent is missing");
        // The first turn of a participation records the thread's history before its input, so
        // later turns read it from the agent's log rather than from the thread, in entries of a
        // bounded size however long the thread.
        const entries: Array<TurnLog.Entry> = [];
        if (!(yield* contextOf(turn)).begun) {
          const items = yield* threadHistory(turn);
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
        yield* logOf(turn).appendAll(entries);
        const startedAt = yield* DateTime.now;
        const event = yield* journal.publish(
          TurnFacts.Started,
          Object.assign(where(turn), { selection: chosen, startedAt }),
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

  const checkpoint = Effect.fn("TurnExecution.checkpoint")(function* (
    turnId: Turn.Id,
    recorded: {
      readonly summary: string;
      readonly kept: ReadonlyArray<Transcript.Item>;
      readonly through: number | null;
    },
  ) {
    return yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running"]);
        const summary = yield* Schema.decodeEffect(Schema.NonEmptyString)(recorded.summary);
        const through = recorded.through;
        if (
          through !== null &&
          (through <= (yield* incorporatedOf(turn)) || through > turn.acceptedThroughSequence)
        )
          return yield* new InvalidResponse({
            message: "A checkpoint can take in only input the turn accepted and has not taken in",
          });
        // The input the summary takes in counts as taken in from here on.
        const entry = yield* logOf(turn).append({
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
  const submittedBatch = Effect.fnUntraced(function* (
    turn: Turn.Record,
    batchId: HarnessEvent.BatchId,
  ) {
    const found = yield* logOf(turn).getAppend(submittedKey(batchId));
    const entry = Option.getOrUndefined(found)?.[0]?.payload;
    return entry?._tag === "Submitted" ? entry : undefined;
  });

  const submitted = Effect.fn("TurnExecution.submitted")(function* (
    turnId: Turn.Id,
    batch: {
      readonly batchId: HarnessEvent.BatchId;
      readonly throughSequence: number;
      readonly items: readonly [Transcript.Input, ...Array<Transcript.Input>];
    },
  ) {
    return yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running", "cancelling"]);
        // A batch submitted again, as after a restart, holds what it held the first time.
        const recorded = yield* submittedBatch(turn, batch.batchId);
        if (recorded !== undefined) return recorded.items;
        if (
          batch.throughSequence < (yield* incorporatedOf(turn)) ||
          batch.throughSequence > turn.acceptedThroughSequence
        )
          return yield* new InvalidResponse({
            message: "A batch must cover input the turn accepted",
          });
        yield* logOf(turn).append(
          {
            _tag: "Submitted",
            turnId: turn.id,
            batchId: batch.batchId,
            throughSequence: batch.throughSequence,
            items: batch.items,
          },
          { idempotencyKey: submittedKey(batch.batchId) },
        );
        return batch.items;
      }),
    );
  });

  const sameInput = Schema.toEquivalence(Schema.Array(Transcript.Input));

  const report = Effect.fn("TurnExecution.report")(function* (
    turnId: Turn.Id,
    events: ReadonlyArray<EnvironmentRuntime.Event>,
  ) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running", "cancelling"]);
        // Input the harness took in is a batch execution submitted, exactly as recorded.
        for (const event of events) {
          if (event._tag !== "Harness" || event.event._tag !== "InputIncorporated") continue;
          const recorded = yield* submittedBatch(turn, event.event.batch.id);
          if (recorded === undefined)
            return yield* new InvalidResponse({
              message: "Incorporated input was never submitted",
            });
          if (!sameInput(recorded.items, event.event.batch.items))
            return yield* new InvalidResponse({
              message: "The harness took in other input than it was given",
            });
        }
        if (events.length > 0)
          yield* logOf(turn).appendAll(
            events.map((event): TurnLog.Entry =>
              event._tag === "Harness"
                ? { _tag: "Harness", turnId: turn.id, event: event.event }
                : { _tag: "Environment", turnId: turn.id, event: event.event },
            ),
          );
      }),
    );
  });

  const attempt = Effect.fn("TurnExecution.attempt")(function* (
    turnId: Turn.Id,
    kind: "session" | "summary",
  ) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running", "cancelling"]);
        yield* logOf(turn).append({ _tag: "Attempt", turnId: turn.id, kind });
      }),
    );
  });

  const interrupted = Effect.fn("TurnExecution.interrupted")(function* (
    turnId: Turn.Id,
    stop: {
      readonly reason: string;
      readonly retryable: boolean;
      readonly problem: HarnessErrors.Problem;
    },
  ) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running", "cancelling"]);
        const reason = yield* Schema.decodeEffect(Schema.NonEmptyString)(stop.reason);
        yield* logOf(turn).append({
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

  const draft = Effect.fn("TurnExecution.draft")(function* (
    turnId: Turn.Id,
    piece: {
      readonly responseId: string;
      readonly part: number;
      readonly offset: number;
      readonly text: string;
    },
  ) {
    const turn = yield* load(turnId);
    if (turn.status !== "running" || piece.text === "" || piece.responseId === "") return;
    yield* signals.publish({
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

  const entries = Effect.fn("TurnExecution.entries")(function* (turnId: Turn.Id) {
    return yield* ownRecords(yield* load(turnId));
  });

  const close = Effect.fn("TurnExecution.close")(function* (turnId: Turn.Id) {
    return yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        if (turn.status === "cancelling") {
          yield* turnCommand.endTurn(turn, {
            outcome: "cancelled",
            cancelReason: turn.cancelReason,
          });
          return { _tag: "Stopped" } as const;
        }
        yield* require(turn, ["running"]);
        const reading = TurnLog.read(yield* ownRecords(turn));
        if (reading.incorporatedThrough(turn.inputAfterSequence) < turn.acceptedThroughSequence)
          return { _tag: "InputPending" } as const;
        // Work its agent has not accepted yet is still this turn's to consider before closing;
        // accepting it extends the turn, and execution takes it in.
        const waiting = yield* notificationStore.listPendingByThread(
          Notification.ofMember(turn.memberId, identityOf(turn)),
          turn.threadId,
          Number.MAX_SAFE_INTEGER,
        );
        if (waiting.length > 0) return { _tag: "InputPending" } as const;
        const messageIds: Array<ThreadMessage.Id> = [];
        if (reading.replies.length > 0) {
          const unable = (reason: string) =>
            Effect.gen(function* () {
              yield* turnCommand.endTurn(turn, { outcome: "failed", reason });
              return { _tag: "Failed", reason } as const;
            });
          const thread = yield* threadQuery.requireAccess(turn.threadId).pipe(
            Effect.asSome,
            Effect.catchTags({
              "ThreadQuery.NotFound": () => Effect.succeedNone,
              "Authorization.Denied": () => Effect.succeedNone,
            }),
          );
          if (Option.isNone(thread))
            return yield* unable("The agent can no longer open this thread.");
          const permitted = yield* authorization.permitted([
            Requirement.make(ThreadMessagePermissions.Publish, {
              _tag: "Thread",
              workspaceId,
              threadId: turn.threadId,
            }),
          ]);
          if (permitted[0] !== true)
            return yield* unable("The agent may no longer post in this thread.");
          const current = yield* threadQuery.currentParticipants(thread.value);
          const agent: ThreadParticipation.Reference = { _tag: "Member", memberId: turn.memberId };
          if (
            !current.some(
              (p) => ThreadParticipation.keyOf(p.participant) === ThreadParticipation.keyOf(agent),
            )
          )
            return yield* unable("The agent no longer takes part in this thread.");
          const texts: Array<typeof ThreadMessage.Text.Type> = [];
          for (const reply of reading.replies) {
            const text = yield* Schema.decodeEffect(ThreadMessage.Text)(reply.text).pipe(
              Effect.asSome,
              Effect.catchTag("SchemaError", () => Effect.succeedNone),
            );
            if (Option.isNone(text)) return yield* unable("The agent's reply could not be posted.");
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
        return { _tag: "Closed", messageIds } as const;
      }),
    );
  });

  const fail = Effect.fn("TurnExecution.fail")(function* (turnId: Turn.Id, reason: string) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["queued", "running", "cancelling"]);
        const failure = yield* Schema.decodeEffect(Schema.NonEmptyString)(reason);
        yield* turnCommand.endTurn(turn, { outcome: "failed", reason: failure });
      }),
    );
  });

  const stopped = Effect.fn("TurnExecution.stopped")(function* (turnId: Turn.Id) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["cancelling"]);
        yield* turnCommand.endTurn(turn, { outcome: "cancelled", cancelReason: turn.cancelReason });
      }),
    );
  });

  const get = Effect.fn("TurnExecution.get")(function* (turnId: Turn.Id) {
    return yield* load(turnId);
  });

  return Service.of({
    get,
    prepare,
    start,
    attempt,
    checkpoint,
    submitted,
    report,
    draft,
    interrupted,
    entries,
    close,
    fail,
    stopped,
  });
});

/** Internal service for execution: callers are trusted to run what agents accepted. @category layers */
export const layer = Layer.effect(Service, make());

export * as TurnExecution from "./execution.ts";
