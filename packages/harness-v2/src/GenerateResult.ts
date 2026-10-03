/**
 * What `generate` returns: a whole turn, with the parts it streamed and getters for what callers
 * usually read, as Effect AI's `GenerateTextResponse` has for one model response. A turn takes one
 * or more steps, each one response from the model and the tools it called, and the turn's answer
 * is the text of its last step, as in AI SDK. `generateObject` returns `GenerateObjectResult`,
 * which adds the object that answer decoded to.
 */
import type { Response } from "effect/ai";
import type { FileChangePart, StreamPart } from "./StreamPart.ts";

// TODO: Add `steps`, each step's parts with its own text, reasoning, and usage, once a caller needs
// more of the turn than its answer.
export class GenerateResult {
  constructor(readonly parts: ReadonlyArray<StreamPart>) {}

  /** The text of the turn's last step: its answer, without what the agent said while it worked. */
  get text(): string {
    return lastStep(this.parts)
      .flatMap((part) => (part.type === "text-delta" ? [part.delta] : []))
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

/**
 * The parts of the turn's last step that has any. Steps end at `finish-step` parts, and a turn that
 * reports none is one step.
 */
const lastStep = (parts: ReadonlyArray<StreamPart>): ReadonlyArray<StreamPart> => {
  const steps: Array<Array<StreamPart>> = [[]];
  for (const part of parts) {
    if (part.type === "finish-step") steps.push([]);
    else if (part.type !== "finish") steps.at(-1)?.push(part);
  }
  return steps.findLast((step) => step.length > 0) ?? [];
};
