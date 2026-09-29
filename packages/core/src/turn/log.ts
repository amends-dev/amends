import { Environment } from "@amends/environment";
import { HarnessEvent, Transcript } from "@amends/harness";
import type { DateTime } from "effect";
import { Schema } from "effect";
import { Log } from "../journal/log.ts";
import type { ThreadParticipationId } from "../thread/participation/id.ts";
import { TurnId } from "./id.ts";
import type { Turn } from "./turn.ts";

const Of = { turnId: TurnId.Id };

/**
 * One entry of an agent's log for a thread, naming the turn that wrote it. Together the entries
 * are everything the agent did there: the input execution submitted, with the timeline position it
 * covers; what the harness reported, block by block, whichever harness ran it and wherever; what
 * the environment reported about itself; interruptions; input asked of a turn directly, such as a
 * retry; the thread's history before the first turn; and checkpoints that replace what came before.
 */
export const Entry = Schema.TaggedUnion({
  /** Input submitted as one batch, covering the thread's relevant input through a position. */
  Submitted: {
    ...Of,
    batchId: HarnessEvent.BatchId,
    throughSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
  },
  /** An event the harness reported. */
  Harness: { ...Of, event: HarnessEvent.Event },
  /** An event the environment reported about itself, such as becoming ready. */
  Environment: { ...Of, event: Environment.Lifecycle },
  /** Execution stopped before the turn finished; a retryable stop continues the same turn. */
  Interrupted: { ...Of, reason: Schema.NonEmptyString, retryable: Schema.Boolean },
  /** Input asked of the turn itself rather than through the thread, such as who retried it. */
  Requested: { ...Of, input: Transcript.Input },
  /** The thread's conversation before the agent's first turn, recorded by that turn. */
  History: { ...Of, items: Schema.Array(Transcript.Item) },
  /**
   * Everything before this entry, replaced: a summary of the older history, if one was written, and
   * the newest exchanges verbatim.
   */
  Checkpoint: {
    ...Of,
    summary: Schema.NullOr(Schema.NonEmptyString),
    kept: Schema.Array(Transcript.Item),
  },
});
export type Entry = typeof Entry.Type;

/** An entry as the log recorded it, with when. */
export interface Recorded {
  readonly entry: Entry;
  readonly at: DateTime.Utc;
}

/** An agent's log for one participation in a thread, apart from the workspace's journal. */
export const logId = (participationId: ThreadParticipationId.Id): Log.Id =>
  Log.Id.make(`turns:${participationId}`);

/** A typed handle on an agent's log for one participation in a thread. */
export const open = (log: Log.Interface, participationId: ThreadParticipationId.Id) =>
  log.open({ id: logId(participationId), schema: Entry });

/** An answer the turn owes its thread: the text of a finished response, verbatim. */
export interface Reply {
  readonly responseId: Transcript.ResponseId;
  readonly text: string;
}

/** Everything one turn's entries say, from one reading of them. */
export interface Reading {
  /** What the harness reported, in order. */
  readonly events: ReadonlyArray<HarnessEvent.Event>;
  /**
   * How far the harness has confirmed taking in the thread's input: the furthest position of a
   * submitted batch it incorporated, or `after` when it has taken none.
   */
  readonly incorporatedThrough: (after: number) => number;
  /** The transcript execution continues from, after `history`: an unfinished response is left out. */
  readonly transcript: (history: ReadonlyArray<Transcript.Item>) => ReadonlyArray<Transcript.Item>;
  /**
   * The view the work leaves, after `history`: what an unfinished response wrote stays, and calls
   * still pending are answered.
   */
  readonly view: (history: ReadonlyArray<Transcript.Item>) => ReadonlyArray<Transcript.Item>;
  /**
   * The answers the turn owes its thread, in order: every finished response with text and no tool
   * calls that more input followed, and the last one.
   */
  readonly replies: ReadonlyArray<Reply>;
  /** Input asked of the turn itself that no batch it submitted has taken in yet. */
  readonly requested: ReadonlyArray<Transcript.Input>;
  /** The entries the thread's readers see, oldest first. */
  readonly items: ReadonlyArray<Turn.LogItem>;
}

const hasText = (text: string) => /\S/u.test(text);

/** Read one turn's entries once: what they hold for execution, for closing, and for its readers. */
export const read = (records: Iterable<Recorded>): Reading => {
  const events: Array<HarnessEvent.Event> = [];
  const covers = new Map<string, number>();
  let through: number | undefined;
  const items: Array<Turn.LogItem> = [];
  /** Each response's completed blocks, and its readers' entry once it wrote text. */
  const responses = new Map<
    string,
    {
      readonly blocks: Map<number, Transcript.ResponsePart>;
      item: (Turn.LogItem & { readonly _tag: "Responded" }) | undefined;
    }
  >();
  const replies: Array<Reply> = [];
  const requested: Array<Transcript.Input> = [];
  let takenIn = false;
  let answer: Reply | undefined;
  const partsOf = (blocks: Map<number, Transcript.ResponsePart>) =>
    [...blocks.entries()].toSorted(([left], [right]) => left - right);

  for (const { entry, at } of records) {
    switch (entry._tag) {
      case "Submitted":
        covers.set(entry.batchId, entry.throughSequence);
        break;
      case "Interrupted":
        items.push({ _tag: "Interrupted", at, reason: entry.reason, retryable: entry.retryable });
        break;
      case "Requested":
        requested.push(entry.input);
        break;
      case "Environment":
      case "History":
      case "Checkpoint":
        break;
      case "Harness": {
        const event = entry.event;
        events.push(event);
        if (event._tag === "InputIncorporated") {
          takenIn = true;
          const covered = covers.get(event.batch.id);
          if (covered !== undefined) through = Math.max(through ?? covered, covered);
          if (answer !== undefined) replies.push(answer);
          answer = undefined;
          items.push({ _tag: "InputTaken", at, messages: event.batch.items.length });
        } else if (event._tag === "BlockCompleted") {
          const response = responses.get(event.responseId) ?? {
            blocks: new Map(),
            item: undefined,
          };
          responses.set(event.responseId, response);
          response.blocks.set(event.part, event.block);
          if (event.block._tag !== "Text") break;
          const texts = partsOf(response.blocks).filter(([, part]) => part._tag === "Text");
          const text = HarnessEvent.textOf(texts.map(([, part]) => part));
          if (!hasText(text)) break;
          const updated = {
            _tag: "Responded" as const,
            at,
            responseId: event.responseId,
            text,
            parts: texts.map(([index]) => index),
            reply: false,
          };
          if (response.item === undefined) items.push(updated);
          else items[items.indexOf(response.item)] = updated;
          response.item = updated;
        } else if (event._tag === "ResponseFinished") {
          const parts = partsOf(responses.get(event.responseId)?.blocks ?? new Map()).map(
            ([, part]) => part,
          );
          const text = HarnessEvent.textOf(parts);
          answer =
            parts.some((part) => part._tag === "ToolCall") || !hasText(text)
              ? undefined
              : { responseId: event.responseId, text };
        }
        break;
      }
    }
  }
  if (answer !== undefined) replies.push(answer);
  const owed = new Set<string>(replies.map((reply) => reply.responseId));
  return {
    events,
    incorporatedThrough: (after) => Math.max(after, through ?? after),
    transcript: (history) => HarnessEvent.transcript(events, history, { unfinished: "omit" }),
    view: (history) => HarnessEvent.transcript(events, history, { unfinished: "keep" }),
    replies,
    // A turn's requests go with the first batch it submits.
    requested: takenIn ? [] : requested,
    items: items.map((item) =>
      item._tag === "Responded" && owed.has(item.responseId) ? { ...item, reply: true } : item,
    ),
  };
};

/** Who a checkpoint's summary speaks as, so the model reads it apart from what people said. */
export const checkpointAuthor: Transcript.Author = {
  id: "checkpoint",
  name: "Summary of the earlier conversation",
};

/** What a checkpoint puts in place of the history before it. */
export const opening = (checkpoint: {
  readonly summary: string | null;
  readonly kept: ReadonlyArray<Transcript.Item>;
}): ReadonlyArray<Transcript.Item> => [
  {
    _tag: "Input",
    author: checkpointAuthor,
    content: [
      {
        _tag: "Text",
        text:
          checkpoint.summary ??
          "Earlier messages in this thread were left out to fit the conversation; what follows is the most recent part.",
      },
    ],
  },
  ...checkpoint.kept,
];

/** A response without its reasoning, which serves only the turn that produced it. */
const withoutReasoning = (item: Transcript.Item): Transcript.Item =>
  item._tag === "Response"
    ? { ...item, parts: item.parts.filter((part) => part._tag !== "Reasoning") }
    : item;

/** What a turn continues from, read from its agent's log for the thread. */
export interface Context {
  /** Everything before the turn's own work since the latest checkpoint. */
  readonly history: ReadonlyArray<Transcript.Item>;
  /** The history followed by the turn's own work since the latest checkpoint: what it continues. */
  readonly transcript: ReadonlyArray<Transcript.Item>;
  /** The turn's own entries, read once. */
  readonly own: Reading;
  /** The turn's own entries, as recorded. */
  readonly entries: ReadonlyArray<Recorded>;
  /** Whether the log held anything before the turn, such as the thread's earlier history. */
  readonly begun: boolean;
}

/**
 * Read an agent's log for a thread for one of its turns: from the latest checkpoint, if any, each
 * earlier turn's entries as the view it left, without reasoning, then this turn's own work, which
 * continues. `records` must reach back to the latest checkpoint and to the turn's first entry.
 */
export const context = (records: ReadonlyArray<Recorded>, turnId: Turn.Id): Context => {
  let items: ReadonlyArray<Transcript.Item> = [];
  let segment: { readonly turnId: string; readonly events: Array<HarnessEvent.Event> } | undefined;
  const flush = () => {
    if (segment === undefined || segment.turnId === turnId) return;
    const before = items.length;
    const folded = HarnessEvent.transcript(segment.events, items, { unfinished: "keep" });
    items = [...folded.slice(0, before), ...folded.slice(before).map(withoutReasoning)];
    segment = undefined;
  };
  let current: Array<HarnessEvent.Event> = [];
  const own: Array<Recorded> = [];
  let begun = false;
  for (const record of records) {
    const entry = record.entry;
    if (entry.turnId === turnId) own.push(record);
    else begun = true;
    switch (entry._tag) {
      case "Checkpoint":
        items = opening(entry);
        segment = undefined;
        current = [];
        begun = true;
        break;
      case "History":
        flush();
        items = [...items, ...entry.items];
        if (entry.turnId === turnId) begun = true;
        break;
      case "Harness":
        if (entry.turnId === turnId) {
          flush();
          current.push(entry.event);
        } else {
          if (segment !== undefined && segment.turnId !== entry.turnId) flush();
          segment ??= { turnId: entry.turnId, events: [] };
          segment.events.push(entry.event);
        }
        break;
      case "Submitted":
      case "Environment":
      case "Interrupted":
      case "Requested":
        break;
    }
  }
  flush();
  return {
    history: items,
    transcript: HarnessEvent.transcript(current, items, { unfinished: "omit" }),
    own: read(own),
    entries: own,
    begun,
  };
};

/** How much a transcript holds, in characters, as a model reads it. */
export const size = (items: ReadonlyArray<Transcript.Item>): number => {
  let total = 0;
  for (const item of items)
    switch (item._tag) {
      case "Input":
        for (const part of item.content) total += part.text.length;
        break;
      case "ToolResult":
        for (const part of item.content) total += part.text.length;
        if (item.structured !== undefined) total += JSON.stringify(item.structured).length;
        break;
      case "Response":
        for (const part of item.parts)
          total += part._tag === "ToolCall" ? JSON.stringify(part.params).length : part.text.length;
        break;
    }
  return total;
};

/**
 * The newest part of a transcript that fits `budget` characters, starting at an input so that no
 * response is separated from its tool results. The last exchange stays even when it alone is
 * larger.
 */
export const fit = (
  items: ReadonlyArray<Transcript.Item>,
  budget: number,
): ReadonlyArray<Transcript.Item> => {
  if (size(items) <= budget) return items;
  let start: number | undefined;
  let total = 0;
  for (let index = items.length - 1; index >= 0; index--) {
    total += size([items[index]!]);
    if (items[index]!._tag !== "Input") continue;
    if (total > budget && start !== undefined) break;
    start = index;
  }
  return start === undefined ? [] : items.slice(start);
};

/** What a checkpoint would do: summarize the older part of a transcript and keep the rest. */
export interface Compaction {
  readonly summarize: ReadonlyArray<Transcript.Item>;
  readonly kept: ReadonlyArray<Transcript.Item>;
}

/**
 * Whether a transcript and the input waiting for it outgrow `budget` characters, and if so what a
 * checkpoint keeps: the newest exchanges within `keep` characters. Nothing is proposed when all
 * that would be summarized is an earlier summary, since summarizing it again frees nothing.
 */
export const compaction = (
  transcript: ReadonlyArray<Transcript.Item>,
  waiting: number,
  limits: { readonly budget: number; readonly keep: number },
): Compaction | undefined => {
  if (size(transcript) + waiting <= limits.budget) return undefined;
  const kept = fit(transcript, limits.keep);
  const summarize = transcript.slice(0, transcript.length - kept.length);
  const onlySummary = summarize.every(
    (item) => item._tag === "Input" && item.author.id === checkpointAuthor.id,
  );
  return onlySummary ? undefined : { summarize, kept };
};

/** An input's text cut to `limit` characters, saying how much was left out. */
export const shorten = (text: string, limit: number): string =>
  text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n\n[${text.length - limit} more characters were left out.]`;

export * as TurnLog from "./log.ts";
