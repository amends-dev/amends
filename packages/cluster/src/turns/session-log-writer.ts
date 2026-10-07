/**
 * A turn's run writing its participation's session log, which takes part in no commit. It opens
 * the log for the turn, then appends each entry after the one it wrote last, so a run that finds
 * the log past what it wrote, as one another run replaced after Cluster moved its job, writes
 * nothing more and stops: it is `Superseded`.
 */
import {
  SessionLog,
  SessionLogStore,
  Turn,
  TurnExecution,
  type TurnPrompt,
} from "@amends/core/turn";
import type { Workspace } from "@amends/core/workspace";
import { Array, Effect, Option, Schema } from "effect";
import type { Prompt } from "effect/ai";
import { inWorkspace } from "./workspace.ts";

/** Another run of the turn wrote to its session log after this one: this one stops. */
export class Superseded extends Schema.TaggedError<Superseded>()("SessionLogWriter.Superseded", {
  turnId: Turn.Id,
}) {}

/** A turn ready to run, as its job starts it. */
export type Ready = Extract<TurnExecution.Start, { readonly _tag: "Ready" }>;

/** What a turn's run starts from, and writes first to the log. */
export interface Opening {
  /**
   * What the run writes first: the turn's prompt, after the conversation the agent joined when the
   * log is new, or that an earlier run of the turn stopped short.
   */
  readonly entries: Array.NonEmptyReadonlyArray<SessionLog.Entry>;
  /** The conversation before the turn, which the agent's session starts with. */
  readonly history: Prompt.Prompt;
  /** The prompt's texts, as the log first recorded them for the turn. */
  readonly prompt: Array.NonEmptyReadonlyArray<string>;
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
  joined: ReadonlyArray<TurnPrompt.Message>,
): Opening => {
  const turnId = ready.turn.id;
  const before = entries.filter((entry) => !SessionLog.isOfTurn(turnId)(entry));
  const prompted = entries.find((entry) => entry._tag === "Prompted" && entry.turnId === turnId);
  if (prompted?._tag === "Prompted")
    return {
      entries: [{ _tag: "Interrupted", turnId, reason: "Its run stopped short." }],
      history: SessionLog.historyOf(before),
      prompt: prompted.texts,
    };
  const joining: ReadonlyArray<SessionLog.Entry> =
    entries.length === 0 && joined.length > 0 ? [{ _tag: "Joined", conversation: joined }] : [];
  return {
    entries: Array.append(joining, {
      _tag: "Prompted",
      turnId,
      texts: ready.prompt,
      messages: ready.messages,
    }),
    history: SessionLog.historyOf([...before, ...joining]),
    prompt: ready.prompt,
  };
};

/** Entries read at a time. */
const pageSize = 500;

/** Every entry of the participation's log, oldest first. */
const readLog = Effect.fnUntraced(function* (participationId: Turn.Record["participationId"]) {
  const sessionLogStore = yield* SessionLogStore.Service;
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

/**
 * Open the participation's log for a run of `ready`: read it, write the run's opening, and
 * return what the run starts from, where its opening sits in the log, `append`, which writes more
 * after the run's last entry or fails with `Superseded`, writing none of it, and what the run
 * wrote so far, oldest first. An append is not cut short: a run stopped meanwhile stops after it.
 */
export const open = Effect.fn("SessionLogWriter.open")(function* (
  workspaceId: Workspace.Id,
  ready: Ready,
) {
  const participationId = ready.turn.participationId;
  const recorded = yield* inWorkspace(workspaceId, readLog(participationId));
  const entries = recorded.map(({ entry }) => entry);
  const joined =
    entries.length === 0
      ? yield* inWorkspace(
          workspaceId,
          Effect.flatMap(TurnExecution.Service, (turnExecution) =>
            turnExecution.joinedConversation(ready.turn.id),
          ),
        )
      : [];
  let head = recorded.at(-1)?.position ?? 0;
  const written: Array<SessionLog.Entry> = [];
  const append = Effect.fnUntraced(function* (more: Array.NonEmptyReadonlyArray<SessionLog.Entry>) {
    const appended = yield* inWorkspace(
      workspaceId,
      Effect.flatMap(SessionLogStore.Service, (sessionLogStore) =>
        sessionLogStore.append(participationId, more, head).pipe(
          Effect.asSome,
          Effect.catchTag("SessionLogStore.Conflict", () => Effect.succeedNone),
        ),
      ),
    );
    if (Option.isNone(appended)) return yield* new Superseded({ turnId: ready.turn.id });
    head = appended.value.at(-1)?.position ?? head;
    written.push(...more);
  }, Effect.uninterruptible);
  const opening = openingOf(entries, ready, joined);
  yield* append(opening.entries);
  return {
    opening,
    openedAt: head,
    append,
    written: (): ReadonlyArray<SessionLog.Entry> => [...written],
  };
});

export type Writer = Effect.Success<ReturnType<typeof open>>;

export * as SessionLogWriter from "./session-log-writer.ts";
