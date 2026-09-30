import { Result, Schema } from "effect";

/**
 * Data that only the harness which recorded it can use to continue exactly, keyed by that
 * harness's name: a provider's signature over its reasoning, for example, which the same provider
 * requires back. Other harnesses ignore it, so it never decides what a transcript means.
 */
export const Native = Schema.Record(Schema.String, Schema.Json);
export type Native = typeof Native.Type;

/** What an input or a tool result says. Attachments will join text as further kinds. */
export const Content = Schema.TaggedUnion({
  Text: { text: Schema.String },
});
export type Content = typeof Content.Type;

/** Who an input came from, as the model is told. */
export const Author = Schema.Struct({
  id: Schema.NonEmptyString,
  name: Schema.NonEmptyString,
});
export interface Author extends Schema.Schema.Type<typeof Author> {}

export const ResponseId = Schema.NonEmptyString.pipe(Schema.brand("ResponseId"));
export type ResponseId = typeof ResponseId.Type;

/** A tool call's identifier, as the model assigned it; its result answers it by this ID. */
export const ToolCallId = Schema.NonEmptyString.pipe(Schema.brand("ToolCallId"));
export type ToolCallId = typeof ToolCallId.Type;

/** One piece of a response, in the order the model produced it. */
export const ResponsePart = Schema.TaggedUnion({
  Text: { text: Schema.String, native: Schema.optionalKey(Native) },
  Reasoning: { text: Schema.String, native: Schema.optionalKey(Native) },
  ToolCall: {
    id: ToolCallId,
    name: Schema.NonEmptyString,
    params: Schema.Json,
    native: Schema.optionalKey(Native),
  },
});
export type ResponsePart = typeof ResponsePart.Type;

export const ToolCall = ResponsePart.cases.ToolCall;
export type ToolCall = typeof ToolCall.Type;

/** How a tool call turned out. A tool's own failure is an outcome the model reads, not an error. */
export const ToolOutcome = Schema.Struct({
  isError: Schema.Boolean,
  content: Schema.Array(Content),
  /** The result as one JSON value, when the tool returns one. */
  structured: Schema.optionalKey(Schema.Json),
});
export interface ToolOutcome extends Schema.Schema.Type<typeof ToolOutcome> {}

/**
 * One entry in a conversation as any harness can continue it. A transcript holds only completed
 * entries: streamed text that never finished and a tool call still running are not in it.
 */
export const Item = Schema.TaggedUnion({
  /** Something addressed to the agent, attributed to who said it. */
  Input: { author: Author, content: Schema.NonEmptyArray(Content) },
  /** One completed model response. */
  Response: { id: ResponseId, parts: Schema.Array(ResponsePart) },
  /** The outcome of a call in an earlier response. */
  ToolResult: { callId: ToolCallId, name: Schema.NonEmptyString, ...ToolOutcome.fields },
});
export type Item = typeof Item.Type;

/** The result that answers `call` with `outcome`. */
export const toolResult = (
  call: Pick<ToolCall, "id" | "name">,
  outcome: ToolOutcome,
): ToolResult => ({
  _tag: "ToolResult",
  callId: call.id,
  name: call.name,
  isError: outcome.isError,
  content: outcome.content,
  ...(outcome.structured !== undefined && { structured: outcome.structured }),
});

export const Input = Item.cases.Input;
export type Input = typeof Input.Type;
export const Response = Item.cases.Response;
export type Response = typeof Response.Type;
export const ToolResult = Item.cases.ToolResult;
export type ToolResult = typeof ToolResult.Type;

/** What a valid transcript still expects. */
export interface Summary {
  /** Calls in the last response that have no result yet. */
  readonly pending: ReadonlyArray<ToolCall>;
  /** The transcript ends in input or tool results that no response has answered yet. */
  readonly awaitsResponse: boolean;
}

/**
 * Checks the order every provider requires and describes what the transcript still expects. Each
 * response's tool calls have unique IDs and are answered once, by results that follow it before
 * any other input or response; only the last response's calls may still be pending.
 */
export const summarize = (items: ReadonlyArray<Item>): Result.Result<Summary, string> => {
  const seen = new Set<string>();
  let open = new Map<string, ToolCall>();
  for (const [index, item] of items.entries()) {
    switch (item._tag) {
      case "Input":
        if (open.size > 0) return Result.fail(`Input ${index} interrupts unanswered tool calls.`);
        break;
      case "Response":
        if (open.size > 0)
          return Result.fail(`Response ${index} interrupts unanswered tool calls.`);
        open = new Map();
        for (const part of item.parts) {
          if (part._tag !== "ToolCall") continue;
          if (seen.has(part.id)) return Result.fail(`Tool call ${part.id} appears twice.`);
          seen.add(part.id);
          open.set(part.id, part);
        }
        break;
      case "ToolResult": {
        const call = open.get(item.callId);
        if (call === undefined)
          return Result.fail(`Tool result ${index} answers no pending call ${item.callId}.`);
        if (call.name !== item.name)
          return Result.fail(`Tool result ${index} names ${item.name}, not ${call.name}.`);
        open.delete(item.callId);
        break;
      }
    }
  }
  const last = items.at(-1);
  return Result.succeed({
    pending: [...open.values()],
    awaitsResponse: open.size === 0 && last !== undefined && last._tag !== "Response",
  });
};

/** How many characters a transcript holds as a model reads it. */
export const characters = (items: ReadonlyArray<Item>): number => {
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
 * What a provider reported a model read and wrote for one response: the tokens of every item up to
 * and including it, with the instructions, as the request carried them.
 */
export interface Measured {
  readonly responseId: ResponseId;
  readonly tokens: number;
}

/** About how many characters make a token, for text no provider has counted. */
export const charactersPerToken = 4;

/**
 * About how many tokens a model reads for a transcript: exactly what a provider measured through
 * the response it measured, and a token for every four characters after it, with the instructions
 * counted too when no measurement covers them.
 */
export const estimate = (
  items: ReadonlyArray<Item>,
  options: { readonly measured?: Measured | undefined; readonly instructions?: string } = {},
): number => {
  const measured = options.measured;
  const index =
    measured === undefined
      ? -1
      : items.findLastIndex((item) => item._tag === "Response" && item.id === measured.responseId);
  const unmeasured =
    characters(items.slice(index + 1)) + (index === -1 ? (options.instructions?.length ?? 0) : 0);
  return (index === -1 ? 0 : measured!.tokens) + Math.ceil(unmeasured / charactersPerToken);
};

/**
 * The conversation a harness continues from: the history it was given, then the entries its
 * events recorded. Every harness prepares its native context from this one shape, so a turn can
 * move between environments and harnesses, or recover after an interruption, the same way.
 */
export const Value = Schema.Array(Item).check(
  Schema.makeFilter((items) => {
    const summary = summarize(items);
    return Result.isSuccess(summary) || summary.failure;
  }),
);
export type Value = typeof Value.Type;

export * as Transcript from "./transcript.ts";
