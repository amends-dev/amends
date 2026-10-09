/**
 * What an agent is told of its thread. A turn prompts the agent with the thread's messages its
 * session has not been given, each named by its author, as one message. An agent that joins a
 * thread already under way starts its session with the messages before it joined, as the
 * conversation so far. Both are pure: the caller reads the messages and names their authors.
 * What the agent is told is text alone, as Effect AI `Prompt` messages, which its session log keeps
 * as it was told.
 */
import { Prompt } from "effect/ai";

/** A message of the thread as the agent is told it. */
export interface Input {
  /** What the author is called, as the agent is told. */
  readonly author: string;

  /** Whether the agent said it. */
  readonly own: boolean;
  readonly text: string;
}

/** One message's text as the agent is told it: named by its author. */
const named = (input: Input) => `${input.author}: ${input.text}`;

/**
 * A turn's prompt, one user message with a text for each of the thread's messages it takes in,
 * but the agent's own, which it said and knows, and for who asked for the turn to run again, when
 * someone retried it. Nothing when it has nothing to say.
 */
export const promptOf = (
  messages: ReadonlyArray<Input>,
  retriedBy: string | undefined,
): Prompt.UserMessage | undefined => {
  const texts = [
    ...messages.filter((input) => !input.own).map(named),
    ...(retriedBy === undefined ? [] : [`${retriedBy} asked you to try that again.`]),
  ];
  return texts.length === 0 ? undefined : userMessageOf(texts);
};

/**
 * The conversation an agent's session starts with when it joins a thread under way: others'
 * messages as the user's, each named by its author, and its own, from an earlier time it took
 * part, as its answers. Consecutive messages of one side make one message, as models take a
 * conversation whose sides alternate.
 */
export const conversationOf = (messages: ReadonlyArray<Input>): ReadonlyArray<Prompt.Message> => {
  const conversation: Array<Prompt.Message> = [];
  let run: Array<Input> = [];
  const endRun = () => {
    const [first, ...rest] = run;
    if (first === undefined) return;
    conversation.push(
      first.own
        ? assistantMessageOf([first.text, ...rest.map((input) => input.text)])
        : userMessageOf([named(first), ...rest.map(named)]),
    );
    run = [];
  };
  for (const input of messages) {
    if (run[0] !== undefined && run[0].own !== input.own) endRun();
    run.push(input);
  }
  endRun();
  return conversation;
};

const textParts = (texts: ReadonlyArray<string>) =>
  texts.map((text) => Prompt.makePart("text", { text }));

/** What the agent is told, as the user's message, each text one part. */
const userMessageOf = (texts: ReadonlyArray<string>): Prompt.UserMessage =>
  Prompt.makeMessage("user", { content: textParts(texts) });

/** What the agent said, as its answer, each text one part. */
const assistantMessageOf = (texts: ReadonlyArray<string>): Prompt.AssistantMessage =>
  Prompt.makeMessage("assistant", { content: textParts(texts) });

export * as TurnPrompt from "./prompt.ts";
