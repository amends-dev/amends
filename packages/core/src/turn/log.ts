import { Environment } from "@amends/environment";
import { HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import type { DateTime } from "effect";
import { Effect, Schema } from "effect";
import { Log } from "../journal/log.ts";
import { ThreadMessageId } from "../thread/message/id.ts";
import type { ThreadParticipationId } from "../thread/participation/id.ts";
import { TurnId } from "./id.ts";
import { Turn } from "./turn.ts";

const Of = { turnId: TurnId.Id };

/**
 * One entry of an agent's log for a thread, naming the turn that wrote it. Together the entries
 * are everything the agent did there: each turn's start and end, the input execution submitted,
 * with the timeline position it covers; each attempt to run it; what the harness reported, block
 * by block, whichever harness ran it and wherever; what the environment reported about itself;
 * interruptions; input asked of a turn directly, such as a retry; the thread's history before the
 * first turn; and checkpoints that replace what came before.
 */
export const Entry = Schema.TaggedUnion({
  /**
   * Execution took the turn, with the model access and environment it runs with and the agent's
   * instructions then, which the turn keeps however the agent changes meanwhile.
   */
  Started: { ...Of, selection: Turn.Selection, instructions: Schema.String },
  /** Execution began a harness session for the turn, or a summary for its checkpoint. */
  Attempt: { ...Of, kind: Schema.Literals(["session", "summary"]) },
  /** Input submitted as one batch, covering the thread's relevant input through a position. */
  Submitted: {
    ...Of,
    batchId: HarnessEvent.BatchId,
    throughSequence: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    items: Schema.NonEmptyArray(Transcript.Input),
  },
  /** An event the harness reported. */
  Harness: { ...Of, event: HarnessEvent.Event },
  /** An event the environment reported about itself, such as becoming ready. */
  Environment: { ...Of, event: Environment.Lifecycle },
  /**
   * Execution stopped before the turn finished, and why, in words and as a kind; a retryable stop
   * continues the same turn.
   */
  Interrupted: {
    ...Of,
    reason: Schema.NonEmptyString,
    retryable: Schema.Boolean,
    problem: HarnessErrors.Problem,
  },
  /** Input asked of the turn itself rather than through the thread, such as who retried it. */
  Requested: { ...Of, input: Transcript.Input },
  /** The thread's conversation before the agent's first turn, recorded by that turn. */
  History: { ...Of, items: Schema.Array(Transcript.Item) },
  /**
   * Everything before this entry, replaced: a summary of the older history and the newest exchanges
   * verbatim. When the summary also took in thread input the turn had not taken in yet, `through`
   * is the thread position it reaches, and that input counts as taken in.
   */
  Checkpoint: {
    ...Of,
    summary: Schema.NonEmptyString,
    kept: Schema.Array(Transcript.Item),
    through: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  },
  /** The turn ended: completed with the replies it posted, failed and why, or stopped and why. */
  Ended: {
    ...Of,
    outcome: Turn.Outcome,
    reason: Schema.NullOr(Schema.String),
    cancelReason: Schema.NullOr(Turn.CancelReason),
    messageIds: Schema.Array(ThreadMessageId.Id),
  },
});
export type Entry = typeof Entry.Type;
export type Ended = typeof Entry.cases.Ended.Type;

/** An entry as the log recorded it: when, and at which position. */
export interface Recorded {
  readonly entry: Entry;
  readonly at: DateTime.Utc;
  readonly position: Log.Position;
}

/** An agent's log for one participation in a thread, apart from the workspace's journal. */
export const logId = (participationId: ThreadParticipationId.Id): Log.Id =>
  Log.Id.make(`turns:${participationId}`);

/** A typed handle on an agent's log for one participation in a thread. */
export const open = (log: Log.Interface, participationId: ThreadParticipationId.Id) =>
  log.open({ id: logId(participationId), schema: Entry });

/** How many batches one read of a log takes; reads go on until the range is done. */
const readPage = 100;

/**
 * Every entry of an agent's log for a thread after a position, oldest first, or from the start
 * without one, stopping before the first entry `until` accepts.
 */
export const readRecordsAfter = Effect.fnUntraced(function* (
  log: Log.Interface,
  participationId: ThreadParticipationId.Id,
  from: Log.Position | undefined,
  until?: (entry: Entry) => boolean,
) {
  const handle = open(log, participationId);
  const records: Array<Recorded> = [];
  let after = from;
  for (;;) {
    const batches = yield* handle.read(
      after === undefined ? { limit: readPage } : { after, limit: readPage },
    );
    if (batches.length === 0) return records;
    for (const batch of batches) {
      for (const entry of batch.entries) {
        if (until?.(entry.payload) === true) return records;
        records.push({ entry: entry.payload, at: entry.recordedAt, position: batch.position });
      }
      after = batch.position;
    }
  }
});

/**
 * A turn's own entries, which sit together in its agent's log after `logAfter`: only one turn of
 * an agent writes there at a time, so another turn's entry means this one's are over.
 */
export const readTurnEntries = (
  log: Log.Interface,
  turn: Pick<Turn.Record, "id" | "participationId" | "logAfter">,
) => {
  let began = false;
  return readRecordsAfter(log, turn.participationId, turn.logAfter ?? undefined, (entry) => {
    if (entry.turnId === turn.id) began = true;
    return began && entry.turnId !== turn.id;
  });
};

/** An answer the turn owes its thread: the text of a finished response, verbatim. */
export interface Reply {
  readonly responseId: Transcript.ResponseId;
  readonly text: string;
}

/**
 * How often the turn's model context proved full since its last finished response, as its harness
 * reported or its provider refused, and whether the latest time came after its latest checkpoint,
 * so a checkpoint is owed before it goes on.
 */
export interface Overflow {
  readonly count: number;
  readonly pending: boolean;
}

/** Why execution last stopped short without the turn getting further. */
export interface Interruption {
  readonly reason: string;
  readonly problem: HarnessErrors.Problem;
}

/** Everything one turn's entries say, from one reading of them. */
export interface Reading {
  /** What the harness reported, in order. */
  readonly events: ReadonlyArray<HarnessEvent.Event>;
  /**
   * How far the harness has confirmed taking in the thread's input: the furthest position of a
   * submitted batch it incorporated, or of input a checkpoint's summary took in, or `after` when
   * it has taken none.
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
  /** What the turn started with, once execution took it. */
  readonly started:
    | { readonly selection: Turn.Selection; readonly instructions: string }
    | undefined;
  /** How the turn ended, once it has. */
  readonly ended: Ended | undefined;
  /** Where the latest checkpoint the turn recorded sits in the log. */
  readonly checkpoint: Log.Position | undefined;
  /**
   * Attempts to run the turn since it last got further: since a response finished, a tool call
   * completed, or a checkpoint was recorded. Taking input in happens before the model answers, so
   * it is not getting further.
   */
  readonly attempts: number;
  /** The latest interruption since the turn last got further. */
  readonly interruption: Interruption | undefined;
  /**
   * The latest attempt got no further and recorded no interruption: its run died, as when its
   * process did, rather than stopping short.
   */
  readonly diedLast: boolean;
  /** How often the turn's context proved full since its last finished response. */
  readonly overflow: Overflow;
}

/** Reads one turn's entries as they come: `add` each in order, and `currentReading` says what they hold. */
export interface Reader {
  readonly add: (record: Recorded) => void;
  readonly currentReading: () => Reading;
}

const hasText = (text: string) => /\S/u.test(text);

/** A reader of one turn's entries, empty to begin with. */
export const reader = (): Reader => {
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
  let started: Reading["started"];
  let ended: Ended | undefined;
  let checkpoint: Log.Position | undefined;
  let attempts = 0;
  let interruption: Interruption | undefined;
  /** Whether the latest attempt recorded why it stopped. */
  let accounted = true;
  let overflow: Overflow = { count: 0, pending: false };
  const recordOverflow = () => {
    overflow = { count: overflow.count + 1, pending: true };
  };
  const sortParts = (blocks: Map<number, Transcript.ResponsePart>) =>
    [...blocks.entries()].toSorted(([left], [right]) => left - right);
  /** The turn got further: its attempts so far no longer count against it. */
  const resetAttempts = () => {
    attempts = 0;
    interruption = undefined;
  };

  const add = ({ entry, at, position }: Recorded) => {
    switch (entry._tag) {
      case "Started":
        started = { selection: entry.selection, instructions: entry.instructions };
        break;
      case "Attempt":
        attempts += 1;
        accounted = false;
        break;
      case "Ended":
        ended = entry;
        break;
      case "Submitted":
        covers.set(entry.batchId, entry.throughSequence);
        break;
      case "Interrupted":
        interruption = { reason: entry.reason, problem: entry.problem };
        accounted = true;
        if (entry.problem === "model-context") recordOverflow();
        items.push({ _tag: "Interrupted", at, reason: entry.reason, retryable: entry.retryable });
        break;
      case "Requested":
        requested.push(entry.input);
        break;
      case "Checkpoint":
        checkpoint = position;
        resetAttempts();
        overflow = { ...overflow, pending: false };
        // Input a summary took in counts as taken in, after any answer given before it.
        if (entry.through === null) break;
        through = Math.max(through ?? entry.through, entry.through);
        if (answer !== undefined) replies.push(answer);
        answer = undefined;
        break;
      case "Environment":
      case "History":
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
          const texts = sortParts(response.blocks).filter(([, part]) => part._tag === "Text");
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
          resetAttempts();
          overflow = { count: 0, pending: false };
          const parts = sortParts(responses.get(event.responseId)?.blocks ?? new Map()).map(
            ([, part]) => part,
          );
          const text = HarnessEvent.textOf(parts);
          answer =
            parts.some((part) => part._tag === "ToolCall") || !hasText(text)
              ? undefined
              : { responseId: event.responseId, text };
        } else if (event._tag === "ToolCallCompleted") resetAttempts();
        else if (event._tag === "ContextFull") recordOverflow();
        break;
      }
    }
  };

  const currentReading = (): Reading => {
    const owedReplies = answer === undefined ? [...replies] : [...replies, answer];
    const owed = new Set<string>(owedReplies.map((reply) => reply.responseId));
    const recorded = [...events];
    return {
      events: recorded,
      incorporatedThrough: (after) => Math.max(after, through ?? after),
      transcript: (history) => HarnessEvent.transcript(recorded, history, { unfinished: "omit" }),
      view: (history) => HarnessEvent.transcript(recorded, history, { unfinished: "keep" }),
      replies: owedReplies,
      // A turn's requests go with the first batch it submits.
      requested: takenIn ? [] : [...requested],
      items: items.map((item) =>
        item._tag === "Responded" && owed.has(item.responseId) ? { ...item, reply: true } : item,
      ),
      started,
      ended,
      checkpoint,
      attempts,
      interruption,
      diedLast: attempts > 0 && !accounted,
      overflow,
    };
  };
  return { add, currentReading };
};

/** Read one turn's entries once: what they hold for execution, for closing, and for its readers. */
export const read = (records: Iterable<Recorded>): Reading => {
  const turn = reader();
  for (const record of records) turn.add(record);
  return turn.currentReading();
};

/** Who a checkpoint's summary speaks as, so the model reads it apart from what people said. */
export const checkpointAuthor: Transcript.Author = {
  id: "checkpoint",
  name: "Summary of the earlier conversation",
};

/** Who tells the agent how an earlier turn of its own ended short. */
export const noteAuthor: Transcript.Author = { id: "amends", name: "Amends" };

/** What a checkpoint puts in place of the history before it. */
export const historyFromCheckpoint = (checkpoint: {
  readonly summary: string;
  readonly kept: ReadonlyArray<Transcript.Item>;
}): ReadonlyArray<Transcript.Item> => [
  {
    _tag: "Input",
    author: checkpointAuthor,
    content: [{ _tag: "Text", text: checkpoint.summary }],
  },
  ...checkpoint.kept,
];

/**
 * What the agent is told after an earlier turn of its own that it started and that did not
 * finish: why it stopped, when it failed or someone stopped it. A turn that completed, or that
 * stopped because the agent no longer took part, needs no note.
 */
const endingNoteFor = (ended: Ended | undefined): ReadonlyArray<Transcript.Input> => {
  const text =
    ended?.outcome === "failed"
      ? `Your work here stopped: ${ended.reason ?? "something went wrong."}`
      : ended?.outcome === "cancelled" && ended.cancelReason === "requested"
        ? "Your work here was stopped before it finished, as someone asked."
        : undefined;
  return text === undefined
    ? []
    : [{ _tag: "Input", author: noteAuthor, content: [{ _tag: "Text", text }] }];
};

/** A response without its reasoning, which serves only the turn that produced it. */
export const withoutReasoning = (item: Transcript.Item): Transcript.Item =>
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
  /**
   * Whether the agent's log for the thread has begun: some turn recorded the thread's history,
   * started, or recorded a checkpoint. Until then a turn's history is the thread's.
   */
  readonly begun: boolean;
  /** The latest response a provider measured since the latest checkpoint, of any turn. */
  readonly measured: Transcript.Measured | undefined;
}

/**
 * Read an agent's log for a thread for one of its turns: from the latest checkpoint, if any, each
 * earlier turn's entries as the view it left, without reasoning, and with a note when it stopped
 * short, then this turn's own work, which continues. `records` must reach back to the latest
 * checkpoint and to the turn's first entry.
 */
export const buildContext = (records: ReadonlyArray<Recorded>, turnId: Turn.Id): Context => {
  let items: ReadonlyArray<Transcript.Item> = [];
  /** An earlier turn's entries since the latest checkpoint, read as they come. */
  let segment: { readonly turnId: string; readonly reader: Reader } | undefined;
  const startedTurns = new Set<string>();
  const foldSegment = () => {
    if (segment === undefined) return;
    const reading = segment.reader.currentReading();
    const before = items.length;
    const folded = reading.view(items);
    items = [
      ...folded.slice(0, before),
      ...folded.slice(before).map(withoutReasoning),
      ...(startedTurns.has(segment.turnId) ? endingNoteFor(reading.ended) : []),
    ];
    segment = undefined;
  };
  let current: Array<HarnessEvent.Event> = [];
  const own = reader();
  const entries: Array<Recorded> = [];
  let begun = false;
  let measured: Transcript.Measured | undefined;
  for (const record of records) {
    const entry = record.entry;
    if (entry._tag === "Checkpoint") measured = undefined;
    else if (entry._tag === "Harness" && entry.event._tag === "ResponseFinished") {
      const usage = entry.event.usage;
      if (usage?.inputTokens !== undefined)
        measured = {
          responseId: entry.event.responseId,
          tokens: usage.inputTokens + (usage.outputTokens ?? 0),
        };
    }
    const mine = entry.turnId === turnId;
    if (mine) {
      own.add(record);
      entries.push(record);
    }
    if (entry._tag === "Started") {
      startedTurns.add(entry.turnId);
      begun = true;
    }
    switch (entry._tag) {
      case "Checkpoint":
        items = historyFromCheckpoint(entry);
        segment = undefined;
        current = [];
        begun = true;
        break;
      case "History":
        foldSegment();
        items = [...items, ...entry.items];
        begun = true;
        break;
      default:
        if (mine) {
          if (entry._tag !== "Harness") break;
          foldSegment();
          current.push(entry.event);
          break;
        }
        if (segment !== undefined && segment.turnId !== entry.turnId) foldSegment();
        segment ??= { turnId: entry.turnId, reader: reader() };
        segment.reader.add(record);
    }
  }
  foldSegment();
  return {
    history: items,
    transcript: HarnessEvent.transcript(current, items, { unfinished: "omit" }),
    own: own.currentReading(),
    entries,
    begun,
    measured,
  };
};

/** Thread input a turn has not taken in yet, each piece with the timeline position it came from. */
export interface Waiting {
  readonly sequence: number;
  readonly item: Transcript.Input;
}

/**
 * What a checkpoint would do: summarize the older part of the transcript and the waiting input
 * together, keep the newest history verbatim, without reasoning, and take in the waiting input the
 * summary covers, through `through`, which the rest of that input follows as the turn's next batch.
 */
export interface Compaction {
  readonly summarize: ReadonlyArray<Transcript.Item>;
  readonly kept: ReadonlyArray<Transcript.Item>;
  readonly through: number | null;
}

/** How much of a model's context a turn may use before a checkpoint, and what one keeps. */
export interface Limits {
  /** Tokens the transcript, the waiting input, and what is always sent may come to. */
  readonly budget: number;
  /** Tokens of the newest exchanges a checkpoint keeps verbatim. */
  readonly keep: number;
  /** Characters of input always sent and never summarized, such as a retry's request. */
  readonly fixed?: number | undefined;
  /** What a provider last measured of the transcript, since the latest checkpoint. */
  readonly measured?: Transcript.Measured | undefined;
  /** The instructions every request carries, counted when nothing measured them. */
  readonly instructions?: string | undefined;
  /**
   * Where the turn's own work begins in the transcript: its inputs that a checkpoint summarizes
   * also stay verbatim ahead of what it keeps, when they fit.
   */
  readonly current?: number | undefined;
  /** Propose a checkpoint however the estimate stands, as when the model's context proved full. */
  readonly force?: boolean | undefined;
}

const isSummary = (item: Transcript.Item) =>
  item._tag === "Input" && item.author.id === checkpointAuthor.id;

/**
 * Whether a transcript and the input waiting for it outgrow the budget, and if so what a
 * checkpoint keeps: the newest exchanges within `keep`, across history and waiting input alike,
 * cut at an input or a response, since a response's tool results follow it at once, and never
 * between two pieces of one waiting message. The last exchange stays even when it alone is
 * larger. Nothing is proposed when all that would be summarized is an earlier summary, since
 * summarizing it again frees nothing.
 */
export const proposeCompaction = (
  transcript: ReadonlyArray<Transcript.Item>,
  waiting: ReadonlyArray<Waiting>,
  limits: Limits,
): Compaction | undefined => {
  const all = [...transcript, ...waiting.map((piece) => piece.item)];
  const total =
    Transcript.estimate(all, { measured: limits.measured, instructions: limits.instructions }) +
    Math.ceil((limits.fixed ?? 0) / Transcript.charactersPerToken);
  if (limits.force !== true && total <= limits.budget) return undefined;
  /** The tokens of everything from each position on, as no provider has measured them. */
  const tails: Array<number> = [];
  let characters = 0;
  for (let index = all.length - 1; index >= 0; index--) {
    characters += Transcript.characters([all[index]!]);
    tails[index] = Math.ceil(characters / Transcript.charactersPerToken);
  }
  const isCutPoint = (index: number) => {
    if (all[index]!._tag === "ToolResult") return false;
    const piece = index - transcript.length;
    return piece <= 0 || waiting[piece]!.sequence !== waiting[piece - 1]!.sequence;
  };
  let cut: number | undefined;
  for (let index = all.length - 1; index > 0; index--) {
    if (!isCutPoint(index)) continue;
    if (cut !== undefined && tails[index]! > limits.keep) break;
    cut = index;
  }
  if (cut === undefined) return undefined;
  const summarize = all.slice(0, cut);
  if (summarize.every(isSummary)) return undefined;
  const taken = cut - transcript.length;
  const tail = taken >= 0 ? [] : transcript.slice(cut);
  const current = limits.current;
  const inputs =
    current === undefined || cut <= current
      ? []
      : transcript
          .slice(current, Math.min(cut, transcript.length))
          .filter((item) => item._tag === "Input");
  const pinned =
    Transcript.estimate(inputs) + Transcript.estimate(tail) <= limits.keep ? inputs : [];
  return {
    summarize,
    kept: [...pinned, ...tail].map(withoutReasoning),
    through: taken > 0 ? waiting[taken - 1]!.sequence : null,
  };
};

/**
 * A text in pieces of at most `size` characters, so a long message can be summarized in part
 * rather than cut: when everything fits, every piece is given verbatim.
 */
export const splitIntoPieces = (
  text: string,
  size: number,
): readonly [string, ...Array<string>] => {
  const [first = "", ...rest] = Array.from(
    { length: Math.max(1, Math.ceil(text.length / size)) },
    (_, index) => text.slice(index * size, (index + 1) * size),
  );
  return [first, ...rest];
};

export * as TurnLog from "./log.ts";
