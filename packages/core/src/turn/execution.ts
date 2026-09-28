import type { HarnessEvent } from "@amends/harness";
import { Context, Crypto, DateTime, Effect, Layer, Option, Schema } from "effect";
import type { PlatformError } from "effect";
import { Authorization } from "../authorization/authorization.ts";
import { Requirement } from "../authorization/requirement.ts";
import { Identity } from "../identity/identity.ts";
import { Actor } from "../identity/actor.ts";
import { Performer } from "../identity/performer.ts";
import { Journal } from "../journal/journal.ts";
import { Log } from "../journal/log.ts";
import type { Projection } from "../journal/projection.ts";
import { Publication } from "../journal/publication.ts";
import { Notification } from "../notification/notification.ts";
import { NotificationStore } from "../notification/store.ts";
import { ThreadAccess } from "../thread/access.ts";
import { ThreadMessage } from "../thread/message/message.ts";
import { ThreadMessagePermissions } from "../thread/message/permissions.ts";
import { ThreadMessagePublication } from "../thread/message/publication.ts";
import { ThreadParticipationAdmission } from "../thread/participation/admission.ts";
import { ThreadParticipation } from "../thread/participation/participation.ts";
import { NotActive, NotFound } from "./errors.ts";
import { TurnFacts } from "./facts.ts";
import { TurnLog } from "./log.ts";
import { TurnStore } from "./store.ts";
import { Turn } from "./turn.ts";

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
  | NotActive;
export type CloseError =
  | Error
  | Exclude<ThreadAccess.Error, ThreadAccess.NotFound | Authorization.Denied>
  | ThreadParticipationAdmission.ReadError
  | ThreadMessagePublication.Error;

/**
 * How closing went: the turn closed, publishing the agent's reply if it had one; its input is not
 * all taken in, so execution continues with what is pending; it stopped as asked; or the agent
 * could no longer post where it worked, which failed it.
 */
export type Closing =
  | { readonly _tag: "Closed"; readonly messageId: ThreadMessage.Id | null }
  | { readonly _tag: "InputPending" }
  | { readonly _tag: "Stopped" }
  | { readonly _tag: "Failed"; readonly reason: string };

/**
 * What execution records as it runs a turn: each step is its own commit, attributed to the turn's
 * agent. Execution is trusted: it runs what the agent accepted, and closing checks the agent's own
 * access before publishing for it.
 */
export interface Interface {
  readonly workspaceId: Turn.Record["workspaceId"];
  /** Take a queued turn to run with this selection; any other turn is NotActive. */
  readonly start: (turnId: Turn.Id, selection: Turn.Selection) => Effect.Effect<Turn.Record, Error>;
  /** Record a batch of input submitted for the thread through a position, once per batch. */
  readonly submitted: (
    turnId: Turn.Id,
    batch: { readonly batchId: HarnessEvent.BatchId; readonly throughSequence: number },
  ) => Effect.Effect<void, Error>;
  /**
   * Record what the harness reported, in order, and how far the turn's input is now taken in: a
   * batch counts once the harness confirms incorporating it.
   */
  readonly report: (
    turnId: Turn.Id,
    events: ReadonlyArray<HarnessEvent.Event>,
  ) => Effect.Effect<Turn.Record, Error>;
  /** Record that execution stopped before the turn finished, and why. */
  readonly interrupted: (
    turnId: Turn.Id,
    stop: { readonly reason: string; readonly retryable: boolean },
  ) => Effect.Effect<void, Error>;
  /** The turn's log, for execution to continue from. */
  readonly entries: (turnId: Turn.Id) => Effect.Effect<ReadonlyArray<TurnLog.Entry>, Error>;
  /**
   * Close a running turn once all its accepted input is taken in and no more work waits for its
   * agent on the thread: publish the agent's reply from its log, if it has one, to the thread's
   * current participants, and record completion, in one commit.
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
  const turns = yield* TurnStore.Service;
  const notifications = yield* NotificationStore.Service;
  const access = yield* ThreadAccess.Service;
  const admissions = yield* ThreadParticipationAdmission.Service;
  const publication = yield* ThreadMessagePublication.Service;
  const authorization = yield* Authorization.Service;
  const journal = yield* Journal.Service;
  const log = yield* Log.Service;
  const crypto = yield* Crypto.Crypto;
  const workspaceId = turns.workspaceId;
  if (
    [
      notifications.workspaceId,
      access.workspaceId,
      admissions.workspaceId,
      publication.workspaceId,
      authorization.workspaceId,
    ].some((id) => id !== workspaceId)
  )
    return yield* new InvalidResponse({ message: "Turn services belong to different workspaces" });

  const decodeTurn = Schema.decodeEffect(Schema.toType(Turn.Record));
  const load = Effect.fnUntraced(function* (turnId: Turn.Id) {
    const found = yield* turns.get(turnId);
    if (Option.isNone(found)) return yield* new NotFound({ turnId });
    const turn = yield* decodeTurn(found.value);
    if (turn.workspaceId !== workspaceId || turn.id !== turnId)
      return yield* new InvalidResponse({ message: "Turn store returned another turn" });
    return turn;
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

  const start = Effect.fn("TurnExecution.start")(function* (
    turnId: Turn.Id,
    selection: Turn.Selection,
  ) {
    const chosen = yield* Schema.decodeEffect(Schema.toType(Turn.Selection))(selection);
    return yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["queued"]);
        const startedAt = yield* DateTime.now;
        yield* journal.publish(
          TurnFacts.Started,
          Object.assign(where(turn), { selection: chosen, startedAt }),
        );
        return Turn.change(turn, { status: "running", selection: chosen, startedAt });
      }),
    );
  });

  const submitted = Effect.fn("TurnExecution.submitted")(function* (
    turnId: Turn.Id,
    batch: { readonly batchId: HarnessEvent.BatchId; readonly throughSequence: number },
  ) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running", "cancelling"]);
        if (
          batch.throughSequence <= turn.inputAfterSequence ||
          batch.throughSequence > turn.acceptedThroughSequence
        )
          return yield* new InvalidResponse({
            message: "A batch must cover input the turn accepted",
          });
        yield* TurnLog.open(log, turnId).append(
          { _tag: "Submitted", batchId: batch.batchId, throughSequence: batch.throughSequence },
          { idempotencyKey: submittedKey(batch.batchId) },
        );
      }),
    );
  });

  const report = Effect.fn("TurnExecution.report")(function* (
    turnId: Turn.Id,
    events: ReadonlyArray<HarnessEvent.Event>,
  ) {
    return yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running", "cancelling"]);
        const handle = TurnLog.open(log, turnId);
        if (events.length > 0)
          yield* handle.appendAll(events.map((event) => ({ _tag: "Harness" as const, event })));
        let through = turn.incorporatedThroughSequence;
        for (const event of events) {
          if (event._tag !== "InputIncorporated") continue;
          const found = yield* handle.getAppend(submittedKey(event.batch.id));
          const entry = Option.getOrUndefined(found)?.[0]?.payload;
          if (entry?._tag !== "Submitted")
            return yield* new InvalidResponse({
              message: "Incorporated input was never submitted",
            });
          through = Math.max(through, entry.throughSequence);
        }
        if (through === turn.incorporatedThroughSequence) return turn;
        yield* journal.publish(
          TurnFacts.InputIncorporated,
          Object.assign(where(turn), { incorporatedThroughSequence: through }),
        );
        return Turn.change(turn, { incorporatedThroughSequence: through });
      }),
    );
  });

  const interrupted = Effect.fn("TurnExecution.interrupted")(function* (
    turnId: Turn.Id,
    stop: { readonly reason: string; readonly retryable: boolean },
  ) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["running", "cancelling"]);
        const reason = yield* Schema.decodeEffect(Schema.NonEmptyString)(stop.reason);
        yield* TurnLog.open(log, turnId).append({
          _tag: "Interrupted",
          reason,
          retryable: stop.retryable,
        });
      }),
    );
  });

  const entries = Effect.fn("TurnExecution.entries")(function* (turnId: Turn.Id) {
    yield* load(turnId);
    const handle = TurnLog.open(log, turnId);
    const all: Array<TurnLog.Entry> = [];
    let after: Log.Position | undefined;
    for (;;) {
      const batches = yield* handle.read(
        after === undefined ? { limit: 100 } : { after, limit: 100 },
      );
      if (batches.length === 0) return all;
      for (const batch of batches) {
        for (const entry of batch.entries) all.push(entry.payload);
        after = batch.position;
      }
    }
  });

  const finish = Effect.fnUntraced(function* (
    turn: Turn.Record,
    outcome: { readonly _tag: "Failed"; readonly reason: string } | { readonly _tag: "Cancelled" },
  ) {
    const finishedAt = yield* DateTime.now;
    if (outcome._tag === "Cancelled")
      yield* journal.publish(TurnFacts.Cancelled, Object.assign(where(turn), { finishedAt }));
    else
      yield* journal.publish(
        TurnFacts.Failed,
        Object.assign(where(turn), {
          reason: yield* Schema.decodeEffect(Schema.NonEmptyString)(outcome.reason),
          finishedAt,
        }),
      );
  });

  const close = Effect.fn("TurnExecution.close")(function* (turnId: Turn.Id) {
    const log = yield* entries(turnId);
    return yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        if (turn.status === "cancelling") {
          yield* finish(turn, { _tag: "Cancelled" });
          return { _tag: "Stopped" } as const;
        }
        yield* require(turn, ["running"]);
        if (turn.incorporatedThroughSequence < turn.acceptedThroughSequence)
          return { _tag: "InputPending" } as const;
        // Work its agent has not accepted yet is still this turn's to consider before closing;
        // accepting it extends the turn, and execution takes it in.
        const waiting = yield* notifications.listPendingByThread(
          Notification.ofMember(turn.memberId, identityOf(turn)),
          turn.threadId,
          Number.MAX_SAFE_INTEGER,
        );
        if (waiting.length > 0) return { _tag: "InputPending" } as const;
        const reply = TurnLog.finalResponse(log);
        let messageId: ThreadMessage.Id | null = null;
        if (reply !== undefined) {
          const unable = (reason: string) =>
            Effect.gen(function* () {
              yield* finish(turn, { _tag: "Failed", reason });
              return { _tag: "Failed", reason } as const;
            });
          const thread = yield* access.require(turn.threadId).pipe(
            Effect.map(Option.some),
            Effect.catchTags({
              "ThreadAccess.NotFound": () => Effect.succeedNone,
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
          const current = yield* admissions.current(thread.value);
          const agent: ThreadParticipation.Reference = { _tag: "Member", memberId: turn.memberId };
          if (
            !current.some(
              (p) => ThreadParticipation.keyOf(p.participant) === ThreadParticipation.keyOf(agent),
            )
          )
            return yield* unable("The agent no longer takes part in this thread.");
          const text = yield* Schema.decodeEffect(ThreadMessage.Text)(reply).pipe(
            Effect.catchTag("SchemaError", () => Effect.succeed(undefined)),
          );
          if (text === undefined) return yield* unable("The agent's reply could not be posted.");
          const published = yield* publication.publish({
            threadId: turn.threadId,
            author: { _tag: "Member", memberId: turn.memberId },
            text,
            mentions: [],
            participants: current.map((p) => ThreadParticipation.referenceOf(p.participant)),
            occurredAt: yield* DateTime.now,
          });
          messageId = published.message.id;
        }
        yield* journal.publish(
          TurnFacts.Completed,
          Object.assign(where(turn), { messageId, finishedAt: yield* DateTime.now }),
        );
        return { _tag: "Closed", messageId } as const;
      }),
    );
  });

  const fail = Effect.fn("TurnExecution.fail")(function* (turnId: Turn.Id, reason: string) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["queued", "running", "cancelling"]);
        yield* finish(turn, { _tag: "Failed", reason });
      }),
    );
  });

  const stopped = Effect.fn("TurnExecution.stopped")(function* (turnId: Turn.Id) {
    yield* asAgent(turnId)((turn) =>
      Effect.gen(function* () {
        yield* require(turn, ["cancelling"]);
        yield* finish(turn, { _tag: "Cancelled" });
      }),
    );
  });

  return Service.of({
    workspaceId,
    start,
    submitted,
    report,
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
