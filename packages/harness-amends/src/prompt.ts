import { Schema } from "effect";
import { Prompt } from "effect/unstable/ai";
import { Transcript } from "@amends/harness";

/** The key under which this harness records its native data: Effect AI's provider metadata. */
export const nativeKey = "amends";

const isProviderOptions = Schema.is(Prompt.ProviderOptions);

/**
 * The provider metadata this harness recorded on a part. Effect AI providers read their own
 * entries back as options, such as a signature the provider requires over its earlier reasoning.
 */
const optionsOf = (native: Transcript.Native | undefined): Prompt.ProviderOptions => {
  const recorded = native?.[nativeKey];
  return isProviderOptions(recorded) ? recorded : {};
};

/** Provider metadata as native data, or nothing when the provider attached none. */
export const nativeOf = (metadata: Prompt.ProviderOptions): Transcript.Native | undefined =>
  Object.keys(metadata).length === 0 ? undefined : { [nativeKey]: metadata };

const text = (content: ReadonlyArray<Transcript.Content>): ReadonlyArray<string> =>
  content.map((part) => part.text);

/**
 * Where a provider may cache the prompt: after the instructions, and after the newest message, so
 * the next request, which only adds to the end, reads the rest from the cache. Only Anthropic reads
 * these options; other providers ignore them.
 */
const cached = { anthropic: { cacheControl: { type: "ephemeral" } } } as const;

/**
 * The prompt for the next model request: the agent's instructions, then the transcript in order.
 * Each input names its author, since a thread has many people and agents in it.
 */
export const make = (
  instructions: string | undefined,
  transcript: ReadonlyArray<Transcript.Item>,
): Prompt.Prompt => {
  const messages: Array<Prompt.Message> = [];
  if (instructions !== undefined && instructions.length > 0)
    messages.push(Prompt.systemMessage({ content: instructions, options: cached }));
  let results: Array<Prompt.ToolResultPart> = [];
  const flushResults = () => {
    if (results.length > 0) messages.push(Prompt.toolMessage({ content: results }));
    results = [];
  };
  for (const item of transcript) {
    if (Transcript.Item.isAnyOf(["ToolResult"])(item)) {
      results.push(
        Prompt.toolResultPart({
          id: item.callId,
          name: item.name,
          isFailure: item.isError,
          result: Transcript.sentResult(item),
          providerExecuted: false,
        }),
      );
      continue;
    }
    flushResults();
    if (Transcript.Item.isAnyOf(["Input"])(item)) {
      const [first = "", ...rest] = text(item.content);
      messages.push(
        Prompt.userMessage({
          content: [`${item.author.name}: ${first}`, ...rest].map((part) =>
            Prompt.textPart({ text: part }),
          ),
        }),
      );
      continue;
    }
    if (item.parts.length === 0) continue;
    messages.push(
      Prompt.assistantMessage({
        content: item.parts.map((part) => {
          const options = optionsOf(part.native);
          return Transcript.ResponsePart.match<
            Prompt.TextPart | Prompt.ReasoningPart | Prompt.ToolCallPart
          >(part, {
            Text: (part) => Prompt.textPart({ text: part.text, options }),
            Reasoning: (part) => Prompt.reasoningPart({ text: part.text, options }),
            ToolCall: (part) =>
              Prompt.toolCallPart({
                id: part.id,
                name: part.name,
                params: part.params,
                providerExecuted: false,
                options,
              }),
          });
        }),
      }),
    );
  }
  flushResults();
  const last = messages.at(-1);
  if (last !== undefined && last.role !== "system")
    messages[messages.length - 1] = Object.assign({}, last, {
      options: { ...last.options, ...cached },
    });
  return Prompt.fromMessages(messages);
};

export * as AmendsPrompt from "./prompt.ts";
