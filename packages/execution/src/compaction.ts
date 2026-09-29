/**
 * Summaries for checkpoints: the older part of an agent's history in a thread, written by the
 * model the turn runs with, so a long conversation keeps what matters within its budget.
 */
import { TurnLog } from "@amends/core/turn";
import type { Transcript } from "@amends/harness";
import { Effect } from "effect";
import { LanguageModel, Prompt } from "effect/unstable/ai";

/** How much of one tool result the summarizer reads. */
const resultLimit = 2_000;

const instructions = `You keep an agent's memory of a long conversation in a team thread. Summarize the conversation you are given so the agent can continue it without the original. Use exactly this Markdown structure, keeping every section, even when empty:

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

/** A transcript as text the summarizer reads: who said what, and what the agent did. */
export const render = (items: ReadonlyArray<Transcript.Item>): string =>
  items
    .map((item) => {
      switch (item._tag) {
        case "Input": {
          const text = item.content.map((part) => part.text).join("\n");
          return item.author.id === TurnLog.checkpointAuthor.id
            ? `<prior-summary>\n${text}\n</prior-summary>`
            : `${item.author.name}: ${text}`;
        }
        case "Response":
          return item.parts
            .flatMap((part) =>
              part._tag === "Text"
                ? [`You: ${part.text}`]
                : part._tag === "ToolCall"
                  ? [`You called ${part.name} with ${JSON.stringify(part.params)}`]
                  : [],
            )
            .join("\n");
        case "ToolResult":
          return `${item.name} ${item.isError ? "failed" : "returned"}: ${TurnLog.shorten(
            item.content.map((part) => part.text).join("\n"),
            resultLimit,
          )}`;
      }
    })
    .filter((text) => text !== "")
    .join("\n\n");

/** Summarize the older part of a history with the turn's model; fails as the model does. */
export const summarize = (items: ReadonlyArray<Transcript.Item>) =>
  LanguageModel.generateText({
    prompt: Prompt.fromMessages([
      Prompt.systemMessage({ content: instructions }),
      Prompt.userMessage({
        content: [Prompt.textPart({ text: `<conversation>\n${render(items)}\n</conversation>` })],
      }),
    ]),
  }).pipe(Effect.map((response) => response.text));

export * as Compaction from "./compaction.ts";
