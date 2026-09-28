import { HarnessEvent } from "@amends/harness";
import { Schema } from "effect";
import { Log } from "../journal/log.ts";
import type { Turn } from "./turn.ts";

/**
 * One entry of a turn's own log: the input execution submitted, with the timeline position it
 * covers; what the harness reported, whichever harness ran it and wherever; and interruptions.
 * The log is the attempt's history: recovery, moving environments, and closing all read it.
 */
export const Entry = Schema.TaggedUnion({
  /** Input submitted as one batch, covering the thread's relevant input through a position. */
  Submitted: {
    batchId: HarnessEvent.BatchId,
    throughSequence: Schema.Int.check(Schema.isGreaterThan(0)),
  },
  /** An event the harness reported. */
  Harness: { event: HarnessEvent.Event },
  /** Execution stopped before the turn finished; a retryable stop continues the same turn. */
  Interrupted: { reason: Schema.NonEmptyString, retryable: Schema.Boolean },
});
export type Entry = typeof Entry.Type;

/** The log a turn's entries are appended to, apart from the workspace's journal. */
export const logId = (turnId: Turn.Id): Log.Id => Log.Id.make(`turn:${turnId}`);

/** A typed handle on a turn's log. */
export const open = (log: Log.Interface, turnId: Turn.Id) =>
  log.open({ id: logId(turnId), schema: Entry });

/** The harness events a log recorded, in order. */
export const events = (entries: Iterable<Entry>): ReadonlyArray<HarnessEvent.Event> =>
  [...entries].flatMap((entry) => (entry._tag === "Harness" ? [entry.event] : []));

/**
 * How far the harness has confirmed taking in the thread's input: the furthest position of a
 * submitted batch it incorporated, or `after` when it has taken none.
 */
export const incorporatedThrough = (entries: Iterable<Entry>, after: number): number => {
  const covers = new Map<string, number>();
  let through = after;
  for (const entry of entries) {
    if (entry._tag === "Submitted") covers.set(entry.batchId, entry.throughSequence);
    else if (entry._tag === "Harness" && entry.event._tag === "InputIncorporated")
      through = Math.max(through, covers.get(entry.event.batch.id) ?? through);
  }
  return through;
};

/**
 * The reply a turn publishes when it closes: the text of the last completed response that came
 * after the last input the harness took in, preserved verbatim, or undefined when the turn ends
 * without one. A response still asking for tool calls is not a reply.
 */
export const finalResponse = (entries: Iterable<Entry>): string | undefined => {
  let reply: string | undefined;
  for (const event of events(entries)) {
    if (event._tag === "InputIncorporated") reply = undefined;
    else if (event._tag === "ResponseCompleted") {
      const calls = event.response.parts.some((part) => part._tag === "ToolCall");
      const text = event.response.parts
        .flatMap((part) => (part._tag === "Text" ? [part.text] : []))
        .join("");
      reply = calls || !/\S/u.test(text) ? undefined : text;
    }
  }
  return reply;
};

export * as TurnLog from "./log.ts";
