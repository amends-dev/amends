/**
 * What an agent is told of its thread. A turn prompts the agent with the thread's messages its
 * session has not been given, each named by its author, as one message. An agent that joins a
 * thread already under way starts its session with the messages before it joined, as the
 * conversation so far. Both are pure: the caller reads the messages and names their authors.
 * What the agent is told is text alone, which its session log keeps as it was told.
 */
import { Array, Schema } from "effect";
import { Prompt } from "effect/ai";

/** A message of the thread as the agent is told it. */
export interface Input {
  /** What the author is called, as the agent is told. */
  readonly author: string;

  /** Whether the agent said it. */
  readonly own: boolean;
  readonly text: string;
}

/**
 * A message of the conversation the agent is told: others' messages as the user's, and its own as
 * its answers, each text one part.
 */
export const Message = Schema.Struct({
  role: Schema.Literals(["user", "assistant"]),
  texts: Schema.NonEmptyArray(Schema.String),
});
export interface Message extends Schema.Schema.Type<typeof Message> {}

/** One message's text as the agent is told it: named by its author. */
const named = (input: Input) => `${input.author}: ${input.text}`;

/**
 * A turn's prompt, as its texts: the thread's messages it takes in, but the agent's own, which it
 * said and knows, and who asked for the turn to run again, when someone retried it. Nothing when it
 * has nothing to say.
 */
export const promptOf = (
  messages: ReadonlyArray<Input>,
  retriedBy: string | undefined,
): Array.NonEmptyReadonlyArray<string> | undefined => {
  const texts = [
    ...messages.filter((input) => !input.own).map(named),
    ...(retriedBy === undefined ? [] : [`${retriedBy} asked you to try that again.`]),
  ];
  return Array.isReadonlyArrayNonEmpty(texts) ? texts : undefined;
};

/**
 * The conversation an agent's session starts with when it joins a thread under way: others'
 * messages as the user's, each named by its author, and its own, from an earlier time it took
 * part, as its answers. Consecutive messages of one side make one message, as models take a
 * conversation whose sides alternate.
 */
export const conversationOf = (messages: ReadonlyArray<Input>): ReadonlyArray<Message> => {
  const conversation: Array<Message> = [];
  let run: Array<Input> = [];
  const endRun = () => {
    const [first, ...rest] = run;
    if (first === undefined) return;
    conversation.push(
      first.own
        ? { role: "assistant", texts: [first.text, ...rest.map((input) => input.text)] }
        : { role: "user", texts: [named(first), ...rest.map(named)] },
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

/** A turn's prompt as the agent's harness takes it. */
export const userMessageOf = (texts: ReadonlyArray<string>): Prompt.UserMessage =>
  Prompt.makeMessage("user", { content: textParts(texts) });

/** A message of the conversation as the agent's harness takes it. */
export const promptMessageOf = (message: Message): Prompt.Message =>
  message.role === "user"
    ? userMessageOf(message.texts)
    : Prompt.makeMessage("assistant", { content: textParts(message.texts) });

export * as TurnPrompt from "./prompt.ts";
