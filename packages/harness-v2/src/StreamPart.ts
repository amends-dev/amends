/**
 * The parts a harness streams for a turn. They are the parts an Effect AI language model provider
 * streams, in the encoded form `LanguageModel.make` takes from providers, and three that only an
 * agent produces: a step finishing, a file changing, and the conversation being compacted. Code
 * that reads a provider's stream reads a harness's, and the parts cross the sandbox boundary as
 * they are.
 *
 * Tool calls and results name any tool and keep its params and result as they came. An agent runs
 * tools of its own that no toolkit declares, while Effect AI's decoded tool parts exist only for
 * the tools of a toolkit. Params and results are therefore `unknown`, as JSON, even for the host's
 * tools; a caller that needs their types decodes them with the tool's schemas.
 */
import { Schema } from "effect";
import { Response } from "effect/ai";

/** A call to any tool. The agent's own tools run inside the agent and are `providerExecuted`. */
const ToolCallPart = Schema.Struct({
  type: Schema.Literal("tool-call"),
  id: Schema.String,
  name: Schema.String,
  params: Schema.Unknown,
  providerExecuted: Schema.optional(Schema.Boolean),
  metadata: Schema.optional(Response.ProviderMetadata),
});

/** The result of a call to any tool, which failed when `isFailure` is set. */
const ToolResultPart = Schema.Struct({
  type: Schema.Literal("tool-result"),
  id: Schema.String,
  name: Schema.String,
  result: Schema.Unknown,
  isFailure: Schema.Boolean,
  providerExecuted: Schema.optional(Schema.Boolean),
  preliminary: Schema.optional(Schema.Boolean),
  metadata: Schema.optional(Response.ProviderMetadata),
});

/**
 * Ends one step of a turn: one response from the model and the tool calls it made. A turn takes
 * one or more steps, and its `finish` part reports the whole turn's usage.
 */
export const FinishStepPart = Schema.Struct({
  type: Schema.tag("finish-step"),
  reason: Response.FinishReason,
  usage: Schema.toEncoded(Response.Usage),
  metadata: Schema.optional(Response.ProviderMetadata),
});

export interface FinishStepPart extends Schema.Schema.Type<typeof FinishStepPart> {}

/** Reports that the agent created, modified, or deleted a file in the sandbox. */
export const FileChangePart = Schema.Struct({
  type: Schema.tag("file-change"),
  event: Schema.Literals(["create", "modify", "delete"]),
  path: Schema.String,
  metadata: Schema.optional(Response.ProviderMetadata),
});

export interface FileChangePart extends Schema.Schema.Type<typeof FileChangePart> {}

/**
 * Reports that the agent replaced its conversation so far with a summary, because it was asked to
 * (`manual`) or because the conversation outgrew its context (`auto`).
 */
export const CompactionPart = Schema.Struct({
  type: Schema.tag("compaction"),
  trigger: Schema.Literals(["manual", "auto"]),
  summary: Schema.String,
  tokensBefore: Schema.optional(Schema.Int),
  tokensAfter: Schema.optional(Schema.Int),
  metadata: Schema.optional(Response.ProviderMetadata),
});

export interface CompactionPart extends Schema.Schema.Type<typeof CompactionPart> {}

// TODO: Add a `raw` part carrying the agent's own event as it came, once a caller needs something
// the translation into these parts leaves out.
export const StreamPart = Schema.Union([
  Schema.toEncoded(Response.TextStartPart),
  Schema.toEncoded(Response.TextDeltaPart),
  Schema.toEncoded(Response.TextEndPart),
  Schema.toEncoded(Response.ReasoningStartPart),
  Schema.toEncoded(Response.ReasoningDeltaPart),
  Schema.toEncoded(Response.ReasoningEndPart),
  Schema.toEncoded(Response.ToolParamsStartPart),
  Schema.toEncoded(Response.ToolParamsDeltaPart),
  Schema.toEncoded(Response.ToolParamsEndPart),
  ToolCallPart,
  ToolResultPart,
  Schema.toEncoded(Response.ToolApprovalRequestPart),
  Schema.toEncoded(Response.FilePart),
  Schema.toEncoded(Response.DocumentSourcePart),
  Schema.toEncoded(Response.UrlSourcePart),
  Schema.toEncoded(Response.ResponseMetadataPart),
  Schema.toEncoded(Response.FinishPart),
  Schema.toEncoded(Response.ErrorPart),
  FinishStepPart,
  FileChangePart,
  CompactionPart,
]) satisfies Schema.Codec<
  Response.StreamPartEncoded | FinishStepPart | FileChangePart | CompactionPart
>;

export type StreamPart = Superset<typeof StreamPart.Type, Response.StreamPartEncoded>;

/**
 * `Whole`, which the compiler checks contains every `Subset`, so that a part Effect AI adds cannot go
 * missing from `StreamPart`.
 */
type Superset<Whole, Subset extends Whole> = Whole | Subset;

/**
 * A turn's parts, split into its steps at their `finish-step` parts. The turn's `finish` part ends
 * the turn rather than a step, so no step holds it; a turn that reports no steps is one.
 */
export const stepsOf = (
  parts: ReadonlyArray<StreamPart>,
): ReadonlyArray<ReadonlyArray<StreamPart>> => {
  const steps: Array<Array<StreamPart>> = [[]];
  for (const part of parts) {
    if (part.type === "finish-step") steps.push([]);
    else if (part.type !== "finish") steps.at(-1)?.push(part);
  }
  return steps;
};
