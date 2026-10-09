/**
 * What `generate` returns: a whole turn, with the parts it streamed and getters for what callers
 * usually read, as Effect AI's `GenerateTextResponse` has for one model response. A turn takes one
 * or more steps, each one response from the model and the tools it called, and the turn's answer
 * is the text of its last step, as in AI SDK. `generateObject` returns `GenerateObjectResult`,
 * which adds the object that answer decoded to.
 *
 * @since 0.1.0
 */
import type { Response } from "effect/ai";
import { type FileChangePart, type Step, type StreamPart, stepsOf } from "./StreamPart.ts";

/**
 * A whole turn, as `Session.generate` returns it.
 *
 * **Example** (Reading a turn's answer and what it did)
 *
 * ```ts
 * import { Session } from "@amends/harness";
 * import { Effect } from "effect";
 *
 * declare const session: Session.Session;
 *
 * const program = Effect.gen(function* () {
 *   const result = yield* session.generate({
 *     prompt: "Rename the module and update its imports",
 *   });
 *   return {
 *     answer: result.text,
 *     steps: result.steps.length,
 *     changed: result.fileChanges.map((change) => change.path),
 *     reason: result.finishReason,
 *   };
 * });
 * ```
 *
 * @category models
 * @since 0.1.0
 */
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

  /** Every tool result of the turn, preliminary ones included. */
  get toolResults(): ReadonlyArray<Response.ToolResultPartEncoded> {
    return this.parts.filter((part) => part.type === "tool-result");
  }

  /** The files the agent reported creating, modifying, or deleting. */
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

/**
 * What `Session.generateObject` returns: the turn, and the object its answer decoded to.
 *
 * @category models
 * @since 0.1.0
 */
export class GenerateObjectResult<A> extends GenerateResult {
  constructor(
    readonly value: A,
    parts: ReadonlyArray<StreamPart>,
  ) {
    super(parts);
  }
}
