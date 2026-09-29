import { Environment } from "@amends/environment";
import { HarnessEvent, Transcript } from "@amends/harness";
import type { DateTime } from "effect";
import { Schema } from "effect";
import { Log } from "../journal/log.ts";
import type { Turn } from "./turn.ts";

/**
 * One entry of a turn's own log: the input execution submitted, with the timeline position it
 * covers; what the harness reported, block by block, whichever harness ran it and wherever; what
 * the environment reported about itself; and interruptions. The log is everything the attempt did:
 * recovery, moving environments, closing, and the next turn all read it.
 */
export const Entry = Schema.TaggedUnion({
  /** Input submitted as one batch, covering the thread's relevant input through a position. */
  Submitted: {
    batchId: HarnessEvent.BatchId,
    throughSequence: Schema.Int.check(Schema.isGreaterThan(0)),
  },
  /** An event the harness reported. */
  Harness: { event: HarnessEvent.Event },
  /** An event the environment reported about itself, such as becoming ready. */
  Environment: { event: Environment.Lifecycle },
  /** Execution stopped before the turn finished; a retryable stop continues the same turn. */
  Interrupted: { reason: Schema.NonEmptyString, retryable: Schema.Boolean },
});
export type Entry = typeof Entry.Type;

/** An entry as the log recorded it, with when. */
export interface Recorded {
  readonly entry: Entry;
  readonly at: DateTime.Utc;
}

/** The log a turn's entries are appended to, apart from the workspace's journal. */
export const logId = (turnId: Turn.Id): Log.Id => Log.Id.make(`turn:${turnId}`);

/** A typed handle on a turn's log. */
export const open = (log: Log.Interface, turnId: Turn.Id) =>
  log.open({ id: logId(turnId), schema: Entry });

/** An answer the turn owes its thread: the text of a finished response, verbatim. */
export interface Reply {
  readonly responseId: Transcript.ResponseId;
  readonly text: string;
}

/** Everything a turn's log says, from one reading of it. */
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
   * The view the work leaves for the next turn, after `history`: what an unfinished response wrote
   * stays, and calls still pending are answered.
   */
  readonly view: (history: ReadonlyArray<Transcript.Item>) => ReadonlyArray<Transcript.Item>;
  /**
   * The answers the turn owes its thread, in order: every finished response with text and no tool
   * calls that more input followed, and the last one.
   */
  readonly replies: ReadonlyArray<Reply>;
  /** The entries the thread's readers see, oldest first. */
  readonly items: ReadonlyArray<Turn.LogItem>;
}

const hasText = (text: string) => /\S/u.test(text);

/** Read a turn's log once: what it holds for execution, for closing, and for its readers. */
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
      case "Environment":
        break;
      case "Harness": {
        const event = entry.event;
        events.push(event);
        if (event._tag === "InputIncorporated") {
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
    items: items.map((item) =>
      item._tag === "Responded" && owed.has(item.responseId) ? { ...item, reply: true } : item,
    ),
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
 * larger; nothing is summarized.
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

/** An input's text cut to `limit` characters, saying how much was left out. */
export const shorten = (text: string, limit: number): string =>
  text.length <= limit
    ? text
    : `${text.slice(0, limit)}\n\n[${text.length - limit} more characters were left out.]`;

export * as TurnLog from "./log.ts";
