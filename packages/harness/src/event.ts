import { Result, Schema } from "effect";
import { Transcript } from "./transcript.ts";

/** Identifies a batch of input, so its submitter can tell when the harness took it in. */
export const BatchId = Schema.NonEmptyString.pipe(Schema.brand("HarnessBatchId"));
export type BatchId = typeof BatchId.Type;

/** Input submitted together, which the harness takes into its context together and in order. */
export const InputBatch = Schema.Struct({
  id: BatchId,
  items: Schema.NonEmptyArray(Transcript.Input),
});
export interface InputBatch extends Schema.Schema.Type<typeof InputBatch> {}

/** Why the model stopped a response, as its provider reported. */
export const FinishReason = Schema.Literals([
  "stop",
  "length",
  "content-filter",
  "tool-calls",
  "error",
  "pause",
  "other",
  "unknown",
]);
export type FinishReason = typeof FinishReason.Type;

const TokenCount = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/** Tokens a response used, where its provider reported them. */
export const Usage = Schema.Struct({
  inputTokens: Schema.optionalKey(TokenCount),
  outputTokens: Schema.optionalKey(TokenCount),
  cacheReadTokens: Schema.optionalKey(TokenCount),
  cacheWriteTokens: Schema.optionalKey(TokenCount),
  reasoningTokens: Schema.optionalKey(TokenCount),
});
export interface Usage extends Schema.Schema.Type<typeof Usage> {}

/** The provider and model that produced a response, as far as the harness knows them. */
export const ModelReference = Schema.Struct({
  provider: Schema.optionalKey(Schema.NonEmptyString),
  model: Schema.optionalKey(Schema.NonEmptyString),
});
export interface ModelReference extends Schema.Schema.Type<typeof ModelReference> {}

const PartIndex = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0));

/**
 * What a harness reports, in order. Every harness, wherever it runs, reports these same events, so
 * one turn's log reads the same across environments. A response is reported block by block as
 * each completes, then as finished; deltas show a block while it streams, and only completed
 * blocks build the transcript, so losing or skipping deltas loses nothing.
 */
export const Event = Schema.TaggedUnion({
  /** The harness took a batch into its context, after everything recorded before it. */
  InputIncorporated: { batch: InputBatch },
  /** More text for the block at `part` of a response. */
  TextDelta: { responseId: Transcript.ResponseId, part: PartIndex, delta: Schema.String },
  /** More reasoning for the block at `part` of a response. */
  ReasoningDelta: { responseId: Transcript.ResponseId, part: PartIndex, delta: Schema.String },
  /** The block at `part` of a response completed: its text, reasoning, or tool call. */
  BlockCompleted: {
    responseId: Transcript.ResponseId,
    part: PartIndex,
    block: Transcript.ResponsePart,
  },
  /** A response finished, every block of it reported before; its calls are now owed results. */
  ResponseFinished: {
    responseId: Transcript.ResponseId,
    finish: FinishReason,
    model: Schema.optionalKey(ModelReference),
    usage: Schema.optionalKey(Usage),
  },
  /** The harness began running a tool call, which from now on may have had an effect. */
  ToolCallStarted: { callId: Transcript.ToolCallId },
  /** A tool call has its outcome, whether the harness ran it or was given it. */
  ToolCallCompleted: { result: Transcript.ToolResult },
  /**
   * Nothing is left to do: every input has its response, no tool call is waiting, and nothing
   * submitted is waiting to be taken in.
   */
  Idle: {},
});
export type Event = typeof Event.Type;

/** What a started call that never reported a result is answered with: its effect is unknown. */
export const cutShort = (call: Pick<Transcript.ToolCall, "id" | "name">): Transcript.ToolResult =>
  Transcript.toolResult(call, {
    isError: true,
    content: [
      {
        _tag: "Text",
        text: "This call was cut short before it reported a result; whether it took effect is unknown.",
      },
    ],
  });

/** What a call that never started is answered with when the work ends without running it. */
export const notRun = (call: Pick<Transcript.ToolCall, "id" | "name">): Transcript.ToolResult =>
  Transcript.toolResult(call, {
    isError: true,
    content: [{ _tag: "Text", text: "The work ended before this call ran." }],
  });

export interface TranscriptOptions {
  /**
   * Whether execution goes on from the events, `omit`, or the work ended with them, `keep`. A
   * response still unfinished at the end is left out for a fresh one, or kept with what it wrote;
   * when the work ended, calls still pending are answered too, as cut short or as never run, so
   * input can follow. `omit` by default.
   */
  readonly unfinished?: "omit" | "keep" | undefined;
}

/**
 * The transcript that `history` and then `events` describe. Deltas, starts, and idleness add
 * nothing. A finished response enters with its blocks in order and its results after it. A
 * response that stopped before finishing keeps only its completed blocks and the calls that
 * started, each answered as cut short when it has no result; calls that never started did not
 * happen. It stays in the transcript when it holds a started call, or when it ends the events and
 * `unfinished` is `keep`; otherwise execution asked for a fresh response in its place. Continuing
 * from the result neither repeats input nor runs a recorded tool call again.
 */
export const transcript = (
  events: Iterable<Event>,
  history: ReadonlyArray<Transcript.Item> = [],
  options: TranscriptOptions = {},
): ReadonlyArray<Transcript.Item> => {
  const items = [...history];
  const started = new Set<string>();
  let current:
    | {
        readonly id: Transcript.ResponseId;
        readonly blocks: Map<number, Transcript.ResponsePart>;
        readonly results: Array<Transcript.ToolResult>;
      }
    | undefined;

  /** Enter the open response: finished, or stopped short when `last` says whether it ends the events. */
  const close = (finished: boolean, last: boolean) => {
    if (current === undefined) return;
    const { id, blocks, results } = current;
    current = undefined;
    const parts = [...blocks.entries()]
      .toSorted(([left], [right]) => left - right)
      .map(([, part]) => part);
    if (finished) {
      items.push({ _tag: "Response", id, parts }, ...results);
      return;
    }
    const answered = new Map(results.map((result) => [result.callId as string, result]));
    const kept = parts.filter(
      (part) => part._tag !== "ToolCall" || answered.has(part.id) || started.has(part.id),
    );
    const calls = kept.flatMap((part) => (part._tag === "ToolCall" ? [part] : []));
    if (calls.length === 0 && !(last && options.unfinished === "keep")) return;
    items.push(
      { _tag: "Response", id, parts: kept },
      ...calls.map((call) => answered.get(call.id) ?? cutShort(call)),
    );
  };

  for (const event of events) {
    switch (event._tag) {
      case "InputIncorporated":
        close(false, false);
        items.push(...event.batch.items);
        break;
      case "BlockCompleted":
        if (current !== undefined && current.id !== event.responseId) close(false, false);
        current ??= { id: event.responseId, blocks: new Map(), results: [] };
        current.blocks.set(event.part, event.block);
        break;
      case "ResponseFinished":
        if (current !== undefined && current.id !== event.responseId) close(false, false);
        current ??= { id: event.responseId, blocks: new Map(), results: [] };
        close(true, true);
        break;
      case "ToolCallStarted":
        started.add(event.callId);
        break;
      case "ToolCallCompleted": {
        const inCurrent =
          current !== undefined &&
          [...current.blocks.values()].some(
            (part) => part._tag === "ToolCall" && part.id === event.result.callId,
          );
        if (current !== undefined && inCurrent) current.results.push(event.result);
        else items.push(event.result);
        break;
      }
      case "TextDelta":
      case "ReasoningDelta":
      case "Idle":
        break;
    }
  }
  close(false, true);
  if (options.unfinished === "keep") {
    const summary = Transcript.summarize(items);
    if (Result.isSuccess(summary))
      for (const call of summary.success.pending)
        items.push(started.has(call.id) ? cutShort(call) : notRun(call));
  }
  return items;
};

/** A response's text blocks, in order, as one text. */
export const textOf = (parts: ReadonlyArray<Transcript.ResponsePart>): string =>
  parts.flatMap((part) => (part._tag === "Text" ? [part.text] : [])).join("");

export * as HarnessEvent from "./event.ts";
