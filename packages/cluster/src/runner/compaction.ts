/**
 * Summaries for checkpoints: the older part of an agent's history in a thread, and input it has
 * not taken in yet, written by the model the turn runs with, in passes that each fit a request,
 * so a long conversation keeps what matters within its budget without leaving anything out.
 */
import { TurnLog } from "@amends/core/turn";
import { HarnessErrors, Transcript } from "@amends/harness";
import { Duration, Effect, Result, Schema } from "effect";
import { AiError, LanguageModel, Prompt } from "effect/unstable/ai";

/**
 * The summary could not be written, and whether trying again may help: `problem` is what readers
 * are told, `reason` the detail for the logs.
 */
export class Failed extends Schema.TaggedError<Failed>()("Compaction.Failed", {
  reason: Schema.String,
  retryable: Schema.Boolean,
  problem: HarnessErrors.Problem,
}) {}

const summaryInstructions = `You keep an agent's memory of a long conversation in a team thread. Summarize the conversation you are given so the agent can continue it without the original. Use exactly this Markdown structure, keeping every section, even when empty:

## Objective
- What the people in the thread want from the agent, in one or two sentences.

## Opening request
- The conversation's first request, quoted exactly. When a prior summary is given, carry its opening request forward unchanged.

## Important details
- Constraints, preferences, decisions and why, facts learned, and who asked for what.

## Work state
### Completed
- Finished work and verified results.
### Active
- Work in progress.
### Blocked
- Blockers and unknowns.

## Commitments and open questions
- What the agent promised, and questions still waiting for an answer.

## Next move
- The next concrete step.

Rules:
- Use short bullets, not paragraphs.
- Keep exact names, identifiers, numbers, paths, commands, error messages, and links.
- A prior summary covers what came before the conversation: carry forward everything still relevant from it, and where the conversation is newer, it wins.
- Do not mention that this is a summary.`;

/** One entry of a transcript as text the summarizer reads: who said what, and what the agent did. */
const renderItem = (item: Transcript.Item): string =>
  Transcript.Item.match(item, {
    Input: (item) => {
      const text = item.content.map((part) => part.text).join("\n");
      return item.author.id === TurnLog.checkpointAuthor.id
        ? `<prior-summary>\n${text}\n</prior-summary>`
        : `${item.author.name}: ${text}`;
    },
    Response: (item) => {
      return item.parts
        .flatMap((part) =>
          Transcript.ResponsePart.isAnyOf(["Text"])(part)
            ? [`You: ${part.text}`]
            : Transcript.ResponsePart.isAnyOf(["ToolCall"])(part)
              ? [`You called ${part.name} with ${JSON.stringify(part.params)}`]
              : [],
        )
        .join("\n");
    },
    ToolResult: (item) => {
      return `${item.name} ${item.isError ? "failed" : "returned"}: ${[
        ...item.content.map((part) => part.text),
        ...(item.structured === undefined ? [] : [JSON.stringify(item.structured)]),
      ].join("\n")}`;
    },
  });

/**
 * The transcript's text in passes of at most `size` characters, oldest first, breaking between
 * entries where it can and inside an entry only when one alone is longer.
 */
const splitIntoPasses = (items: ReadonlyArray<Transcript.Item>, size: number): Array<string> => {
  const result: Array<string> = [];
  let current = "";
  for (const text of items.map(renderItem).filter((text) => text !== "")) {
    const joined = current === "" ? text : `${current}\n\n${text}`;
    if (joined.length <= size) {
      current = joined;
      continue;
    }
    if (current !== "") result.push(current);
    current = "";
    for (let start = 0; start < text.length; start += size) {
      const slice = text.slice(start, start + size);
      if (slice.length === size) result.push(slice);
      else current = slice;
    }
  }
  if (current !== "") result.push(current);
  return result;
};

/** One summary request over a conversation, which fails or stays silent past `timeout` as `Failed`. */
const requestSummary = (conversation: string, timeout: Duration.Input) =>
  LanguageModel.generateText({
    prompt: Prompt.fromMessages([
      Prompt.systemMessage({ content: summaryInstructions }),
      Prompt.userMessage({
        content: [Prompt.textPart({ text: `<conversation>\n${conversation}\n</conversation>` })],
      }),
    ]),
  }).pipe(
    Effect.map((response) => response.text),
    Effect.mapError(
      (error) =>
        new Failed({
          reason: error.message,
          retryable: AiError.isAiError(error) && error.isRetryable,
          problem: HarnessErrors.modelProblem(error),
        }),
    ),
    Effect.timeoutOrElse({
      duration: timeout,
      orElse: () =>
        Effect.fail(
          new Failed({
            reason: `The model sent nothing for ${Duration.format(Duration.fromInputUnsafe(timeout))}.`,
            retryable: true,
            problem: "model-silent",
          }),
        ),
    }),
  );

/**
 * The fewest characters a pass is split down to when its model refuses it as too long, as text
 * denser than four characters a token makes a pass larger than it looks.
 */
const minPassSize = 1_000;

/**
 * Summarize a history with the turn's model: each pass reads the summary so far and the next part,
 * oldest first, until the whole is covered. A pass that fails, or sends nothing within `timeout`,
 * fails the summary.
 */
export const summarize = Effect.fn("Compaction.summarize")(function* (
  items: ReadonlyArray<Transcript.Item>,
  options: { readonly passSize: number; readonly timeout: Duration.Input },
) {
  let summary: string | undefined;
  const remaining = splitIntoPasses(items, options.passSize);
  for (let pass = remaining.shift(); pass !== undefined; pass = remaining.shift()) {
    const conversation =
      summary === undefined ? pass : `<prior-summary>\n${summary}\n</prior-summary>\n\n${pass}`;
    const answer = yield* Effect.result(requestSummary(conversation, options.timeout));
    // A pass its model refuses as too long is summarized in halves instead.
    if (
      Result.isFailure(answer) &&
      answer.failure.problem === "model-context" &&
      pass.length > minPassSize
    ) {
      const half = Math.ceil(pass.length / 2);
      remaining.unshift(pass.slice(0, half), pass.slice(half));
      continue;
    }
    if (Result.isFailure(answer)) return yield* answer.failure;
    const written = answer.success;
    if (!/\S/u.test(written))
      return yield* new Failed({
        reason: "The model wrote an empty summary.",
        retryable: true,
        problem: "model-output",
      });
    summary = written;
  }
  if (summary === undefined)
    return yield* new Failed({
      reason: "There was nothing to summarize.",
      retryable: false,
      problem: "unexpected",
    });
  return summary;
});

export * as Compaction from "./compaction.ts";
