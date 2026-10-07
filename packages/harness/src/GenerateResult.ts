/**
 * What `generate` returns: a whole turn, with the parts it streamed and getters for what callers
 * usually read, as Effect AI's `GenerateTextResponse` has for one model response. A turn takes one
 * or more steps, each one response from the model and the tools it called, and the turn's answer
 * is the text of its last step, as in AI SDK. `generateObject` returns `GenerateObjectResult`,
 * which adds the object that answer decoded to.
 */
import type { Response } from "effect/ai";
import { type FileChangePart, type Step, type StreamPart, stepsOf } from "./StreamPart.ts";

export class GenerateResult {
  constructor(readonly parts: ReadonlyArray<StreamPart>) {}

  /** The turn's steps, each with the parts it streamed added up and how it finished. */
  get steps(): ReadonlyArray<Step> {
    return stepsOf(this.parts);
  }

  /** The text of the turn's last step: its answer, without what the agent said while it worked. */
  get text(): string {
    const lastStep = this.steps.findLast((step) => step.parts.length > 0);
    return (lastStep?.parts ?? [])
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("");
  }

  /** Every tool call of the turn, of the agent's own tools and the host's. */
  get toolCalls(): ReadonlyArray<Response.ToolCallPartEncoded> {
    return this.parts.filter((part) => part.type === "tool-call");
  }

  get toolResults(): ReadonlyArray<Response.ToolResultPartEncoded> {
    return this.parts.filter((part) => part.type === "tool-result");
  }

  get fileChanges(): ReadonlyArray<FileChangePart> {
    return this.parts.filter((part) => part.type === "file-change");
  }

  /** Why the turn ended, or `unknown` when it streamed no `finish` part. */
  get finishReason(): Response.FinishReason {
    return this.parts.find((part) => part.type === "finish")?.reason ?? "unknown";
  }

  /** The tokens the whole turn used, across its steps. */
  get usage(): typeof Response.Usage.Encoded {
    return (
      this.parts.find((part) => part.type === "finish")?.usage ?? {
        inputTokens: {},
        outputTokens: {},
      }
    );
  }
}

/** What `generateObject` returns: the turn, and the object its answer decoded to. */
export class GenerateObjectResult<A> extends GenerateResult {
  constructor(
    readonly value: A,
    parts: ReadonlyArray<StreamPart>,
  ) {
    super(parts);
  }
}
