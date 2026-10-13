/**
 * A turn's run writing its participation's session log, which takes part in no commit. It opens
 * the log for the turn, then appends each entry after the one it wrote last, so a run that finds
 * the log past what it wrote, as one another run replaced after Cluster moved its job, writes
 * nothing more and stops: it is `Superseded`. It calls the workspace's session log store and turn
 * execution, and leaves entering the workspace to `TurnRunner`, which opens one for each run of a
 * turn.
 */
import { SessionLog, SessionLogStore, Turn, TurnExecution } from "@amends-dev/core/turn";
import { Agent, type Session } from "@amends-dev/harness";
import * as Array from "effect/Array";
import * as Effect from "effect/Effect";
import * as Ref from "effect/Ref";
import * as Schema from "effect/Schema";
import type * as Prompt from "effect/ai/Prompt";

/**
 * Another run of the turn wrote to its session log after this one: this one stops.
 */
export class Superseded extends Schema.TaggedError<Superseded>()("SessionLogWriter.Superseded", {
  turnId: Turn.Id,
}) {}

/**
 * A turn ready to run, as its job starts it: the `Ready` of `TurnExecution.Start`.
 */
export type Ready = Extract<TurnExecution.Start, { readonly _tag: "Ready" }>;

/**
 * What a turn's run starts from, and writes first to the log.
 */
export interface Opening {
  /**
   * What the run writes first: the turn's prompt, after the conversation the agent joined when the
   * log is new, or that an earlier run of the turn stopped short.
   */
  readonly entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>;
  /** The conversation before the turn, which the agent's session starts with. */
  readonly history: Prompt.Prompt;
  /** The turn's prompt, as the log first recorded it. */
  readonly prompt: Prompt.UserMessage;
  /**
   * What the session resumes from: the turn as the agent that last started it keeps it, when that
   * run said what continues the turn, for this run to continue after the steps the log has; or
   * else what the participation's last turn left the session as. None for one that starts anew.
   */
  readonly resumeFrom: Session.SessionState | undefined;
}

/**
 * How a run of `ready` opens the log that holds `entries`. A turn whose prompt the log has
 * already, as a run cut short leaves it, runs again from that prompt, noting that the earlier run
 * stopped. Otherwise the turn's prompt follows, after `joined`, the conversation the agent joined,
 * when the log is new.
 */
export const openingOf = (
  entries: ReadonlyArray<SessionLog.Entry>,
  ready: Ready,
  joined: ReadonlyArray<Prompt.Message>,
): Opening => {
  const turnId = ready.turn.id;
  const id = Agent.SessionId.make(ready.turn.participationId);
  const before = entries.filter((entry) => !SessionLog.isOfTurn(turnId)(entry));
  const prompted = entries.find((entry) => entry._tag === "Prompted" && entry.turnId === turnId);
  if (prompted?._tag === "Prompted") {
    const history = SessionLog.historyOf(before);
    return {
      entries: [{ _tag: "Interrupted", turnId, reason: "Its run stopped short." }],
      history,
      prompt: prompted.prompt,
      resumeFrom:
        unfinishedTurnOf(entries, turnId, prompted.prompt, id, history) ??
        sessionStateOf(ready, id, history),
    };
  }
  const joining: ReadonlyArray<SessionLog.Entry> =
    entries.length === 0 && joined.length > 0 ? [{ _tag: "Joined", conversation: joined }] : [];
  const history = SessionLog.historyOf([...before, ...joining]);
  return {
    entries: Array.append(joining, {
      _tag: "Prompted",
      turnId,
      prompt: ready.prompt,
      messages: ready.messages,
    }),
    history,
    prompt: ready.prompt,
    resumeFrom: sessionStateOf(ready, id, history),
  };
};

/** The session as the participation's last turn left it, or none for one that starts anew. */
const sessionStateOf = (
  ready: Ready,
  id: Agent.SessionId,
  history: Prompt.Prompt,
): Session.SessionState | undefined =>
  ready.resume === null ? undefined : { id, history, ...ready.resume };

/**
 * The session with the turn unfinished, as the agent that last started the turn keeps it: what
 * that run said continues the turn, and the steps the log has since. None when it said nothing.
 */
const unfinishedTurnOf = (
  entries: ReadonlyArray<SessionLog.Entry>,
  turnId: Turn.Id,
  prompt: Prompt.UserMessage,
  id: Agent.SessionId,
  history: Prompt.Prompt,
): Session.SessionState | undefined => {
  const startedAt = entries.findLastIndex(
    (entry) => entry._tag === "Started" && entry.turnId === turnId,
  );
  const started = entries[startedAt];
  if (started?._tag !== "Started" || started.agentState === undefined) return undefined;
  const steps = entries
    .slice(startedAt + 1)
    .flatMap((entry) => (entry._tag === "Step" && entry.turnId === turnId ? [entry.step] : []));
  return {
    id,
    history,
    agent: started.agent,
    unfinishedTurn: {
      prompt,
      responseFormat: { type: "text" },
      steps,
      agentState: started.agentState,
    },
  };
};

/** Entries read at a time. */
const pageSize = 500;

/** Every entry of the participation's log, oldest first, read a page at a time. */
const readLog = Effect.fnUntraced(function* (participationId: Turn.Turn["participationId"]) {
  const sessionLogStore = yield* SessionLogStore.SessionLogStore;
  const recorded: Array<SessionLog.Recorded> = [];
  for (;;) {
    const page = yield* sessionLogStore.read(participationId, {
      after: recorded.at(-1)?.position ?? 0,
      limit: pageSize,
    });
    recorded.push(...page);
    if (page.length < pageSize) return recorded;
  }
});

/** Where a run's last entry sits in the log, and what the run wrote so far. */
interface Written {
  readonly head: number;
  readonly entries: ReadonlyArray<SessionLog.Entry>;
}

/**
 * Open the participation's log for a run of `ready`: read it, write the run's opening, and
 * return what the run starts from, where its opening sits in the log, `append`, which writes more
 * after the run's last entry or fails with `Superseded`, writing none of it, and the turn's
 * entries, those read and those the run wrote so far, oldest first. An append is not cut short: a
 * run stopped meanwhile stops after it.
 */
export const open = Effect.fn("SessionLogWriter.open")(function* (ready: Ready) {
  const { participationId, id: turnId } = ready.turn;
  const recorded = yield* readLog(participationId);
  const entries = recorded.map(({ entry }) => entry);
  const joined =
    entries.length === 0
      ? yield* TurnExecution.TurnExecution.use((turnExecution) =>
          turnExecution.joinedConversation(turnId),
        )
      : [];
  const written = yield* Ref.make<Written>({ head: recorded.at(-1)?.position ?? 0, entries: [] });
  const append = Effect.fnUntraced(function* (more: Array.NonEmptyReadonlyArray<SessionLog.Entry>) {
    const { head } = yield* Ref.get(written);
    const sessionLogStore = yield* SessionLogStore.SessionLogStore;
    const appended = yield* sessionLogStore
      .append(participationId, more, head)
      .pipe(Effect.catchTag("SessionLogStore.Overtaken", () => new Superseded({ turnId })));
    yield* Ref.update(written, (before) => ({
      head: appended.at(-1)?.position ?? before.head,
      entries: [...before.entries, ...more],
    }));
  }, Effect.uninterruptible);
  const opening = openingOf(entries, ready, joined);
  yield* append(opening.entries);
  const { head: openedAt } = yield* Ref.get(written);
  const read = entries.filter(SessionLog.isOfTurn(turnId));
  return {
    opening,
    openedAt,
    append,
    /** The turn's entries: those read and those the run wrote so far, oldest first. */
    turnEntries: Effect.map(Ref.get(written), ({ entries }) => [...read, ...entries]),
  };
});

/**
 * What `open` returns: the run's `opening`, where it sits in the log (`openedAt`), `append`, and
 * `turnEntries`.
 */
export type Writer = Effect.Success<ReturnType<typeof open>>;
