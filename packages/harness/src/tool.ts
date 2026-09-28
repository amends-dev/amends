import { Schema } from "effect";
import type { Effect } from "effect";
import type { Transcript } from "./transcript.ts";

/** A tool as the model is told about it. */
export const Definition = Schema.Struct({
  name: Schema.NonEmptyString,
  description: Schema.optionalKey(Schema.String),
  /** A JSON Schema object for the call's parameters. */
  parameters: Schema.Record(Schema.String, Schema.Json),
});
export interface Definition extends Schema.Schema.Type<typeof Definition> {}

/** The tools a session offers, and how it runs a call to one of them. */
export interface Tools {
  readonly definitions: ReadonlyArray<Definition>;
  /**
   * Runs one call. The harness records the outcome as the call's result; a call still running
   * when its session ends has none, so it stays pending rather than being run again.
   */
  readonly invoke: (call: Transcript.ToolCall) => Effect.Effect<Transcript.ToolOutcome>;
}

/** The outcome of a call that failed, with the reason the model reads. */
export const failure = (reason: string): Transcript.ToolOutcome => ({
  isError: true,
  content: [{ _tag: "Text", text: reason }],
});

export * as HarnessTool from "./tool.ts";
