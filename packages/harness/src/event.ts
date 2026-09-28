import { Schema } from "effect";
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
 * one turn's log reads the same across environments. Deltas show a response while it streams;
 * only completed entries build the transcript, so losing or skipping deltas loses nothing.
 */
export const Event = Schema.TaggedUnion({
  /** The harness took a batch into its context, after everything recorded before it. */
  InputIncorporated: { batch: InputBatch },
  /** More text for the response part at `part`. */
  TextDelta: { responseId: Transcript.ResponseId, part: PartIndex, delta: Schema.String },
  /** More reasoning for the response part at `part`. */
  ReasoningDelta: { responseId: Transcript.ResponseId, part: PartIndex, delta: Schema.String },
  /** A response finished, with every part, including the tool calls it asks for. */
  ResponseCompleted: {
    response: Transcript.Response,
    finish: FinishReason,
    model: Schema.optionalKey(ModelReference),
    usage: Schema.optionalKey(Usage),
  },
  /** A tool call has its outcome, whether the harness ran it or was given it. */
  ToolCallCompleted: { result: Transcript.ToolResult },
  /**
   * Nothing is left to do: every input has its response, no tool call is waiting, and nothing
   * submitted is waiting to be taken in.
   */
  Idle: {},
});
export type Event = typeof Event.Type;

/**
 * The transcript that `history` and then `events` describe. Deltas and idleness add nothing, so
 * a response that never completed leaves no trace, and continuing from the result neither repeats
 * input nor runs a recorded tool call again.
 */
export const transcript = (
  events: Iterable<Event>,
  history: ReadonlyArray<Transcript.Item> = [],
): ReadonlyArray<Transcript.Item> => {
  const items = [...history];
  for (const event of events) {
    switch (event._tag) {
      case "InputIncorporated":
        items.push(...event.batch.items);
        break;
      case "ResponseCompleted":
        items.push(event.response);
        break;
      case "ToolCallCompleted":
        items.push(event.result);
        break;
      case "TextDelta":
      case "ReasoningDelta":
      case "Idle":
        break;
    }
  }
  return items;
};

export * as HarnessEvent from "./event.ts";
