import { StreamPart } from "@amends/harness-v2";
import type { DateTime } from "effect";
import { Effect, Schema } from "effect";
import { Log } from "../journal/log.ts";
import { ThreadMessageId } from "../thread/message/id.ts";
import type { TurnId } from "./id.ts";
import { Turn } from "./turn.ts";

/**
 * One entry of a turn's log, which its thread's readers follow: what the agent was prompted with,
 * each step the turn took, each time its run stopped short and ran again, and how it ended. Each
 * turn has a log of its own, and only its job writes there, one run at a time.
 */
export const Entry = Schema.TaggedUnion({
  /** The turn's job started it, prompting the agent with the thread's `messages` it took in. */
  Prompted: { messages: Schema.Int },
  /** A step of the turn finished, its parts added up. `id` names it, as its drafts do. */
  Step: { id: Schema.NonEmptyString, step: StreamPart.Step },
  /** The turn's run stopped before the turn ended, and it runs again from its prompt. */
  Interrupted: { reason: Schema.NonEmptyString },
  /** The turn ended: completed with the reply it posted, failed and why, or stopped and why. */
  Ended: {
    outcome: Turn.Outcome,
    reason: Schema.NullOr(Schema.String),
    cancelReason: Schema.NullOr(Turn.CancelReason),
    messageIds: Schema.Array(ThreadMessageId.Id),
  },
});
export type Entry = typeof Entry.Type;

/** A turn's log, apart from the workspace's journal. */
export const logId = (turnId: TurnId.Id): Log.Id => Log.Id.make(`turn:${turnId}`);

/** A typed handle on a turn's log. */
export const open = (log: Log.Interface, turnId: TurnId.Id) =>
  log.open({ id: logId(turnId), schema: Entry });

/** How many batches one read of a log takes; reads go on until the log is done. */
const readPage = 100;

/** Every entry of a turn's log, oldest first, with when it was recorded. */
export const readEntries = Effect.fnUntraced(function* (log: Log.Interface, turnId: TurnId.Id) {
  const handle = open(log, turnId);
  const entries: Array<{ readonly entry: Entry; readonly at: DateTime.Utc }> = [];
  let after: Log.Position | undefined;
  for (;;) {
    const batches = yield* handle.read(
      after === undefined ? { limit: readPage } : { after, limit: readPage },
    );
    if (batches.length === 0) return entries;
    for (const batch of batches) {
      for (const entry of batch.entries)
        entries.push({ entry: entry.payload, at: entry.recordedAt });
      after = batch.position;
    }
  }
});

/** A step's text, as the parts it wrote it in, joined. */
const textOf = (step: StreamPart.Step) =>
  step.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");

/**
 * What a turn answers, from its log: the text of the last step of its latest run that has any
 * parts, as harness-v2 answers a turn. Empty when that step wrote nothing.
 */
export const answerOf = (entries: ReadonlyArray<Entry>): string => {
  let answer = "";
  for (const entry of entries) {
    if (entry._tag === "Prompted" || entry._tag === "Interrupted") answer = "";
    else if (entry._tag === "Step" && entry.step.parts.length > 0) answer = textOf(entry.step);
  }
  return answer;
};

/** Reads a turn's entries as they come: `add` each in order, and `items` says what they show. */
export interface Reader {
  readonly add: (recorded: { readonly entry: Entry; readonly at: DateTime.Utc }) => void;
  readonly items: () => ReadonlyArray<Turn.LogItem>;
}

/**
 * Each entry as its readers see it: the prompt as the messages it took in, each step that wrote
 * text as a response, and each run that stopped short. The response the turn posted is its reply,
 * once the turn ends; steps that only called tools show nothing yet.
 */
export const reader = (): Reader => {
  const items: Array<Turn.LogItem> = [];
  /** Where the latest run's last response sits among the items. */
  let lastResponse: number | undefined;
  const add: Reader["add"] = ({ entry, at }) => {
    switch (entry._tag) {
      case "Prompted":
        lastResponse = undefined;
        items.push({ _tag: "InputTaken", at, messages: entry.messages });
        return;
      case "Step": {
        const text = textOf(entry.step);
        if (text === "") return;
        lastResponse = items.length;
        items.push({
          _tag: "Responded",
          at,
          responseId: entry.id,
          text,
          parts: entry.step.parts.flatMap((part, index) => (part.type === "text" ? [index] : [])),
          reply: false,
        });
        return;
      }
      case "Interrupted":
        lastResponse = undefined;
        items.push({ _tag: "Interrupted", at, reason: entry.reason, retryable: true });
        return;
      case "Ended": {
        const response = lastResponse === undefined ? undefined : items[lastResponse];
        if (
          entry.messageIds.length > 0 &&
          lastResponse !== undefined &&
          response?._tag === "Responded"
        )
          items[lastResponse] = { ...response, reply: true };
        return;
      }
    }
  };
  return { add, items: () => [...items] };
};

export * as TurnLog from "./log.ts";
