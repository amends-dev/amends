/**
 * What an agent is told of its thread. A turn prompts the agent with the thread's messages its
 * session has not been given, each named by its author, as one message. An agent that joins a
 * thread already under way starts its session with the messages before it joined, as the
 * conversation so far. Both are pure: the caller reads the messages and names their authors.
 */
import { Prompt } from "effect/ai";

/** A message of the thread as the agent is told it. */
export interface Said {
  /** What the author is called, as the agent is told. */
  readonly author: string;

  /** Whether the agent said it. */
  readonly own: boolean;
  readonly text: string;
}

/** One message's text as the agent is told it: named by its author. */
const named = (said: Said) => Prompt.makePart("text", { text: `${said.author}: ${said.text}` });

/**
 * A turn's prompt: the thread's messages it takes in, but the agent's own, which it said and
 * knows, and who asked for the turn to run again, when someone retried it. Nothing when it has
 * nothing to say.
 */
export const promptOf = (
  messages: ReadonlyArray<Said>,
  retriedBy: string | undefined,
): Prompt.UserMessage | undefined => {
  const content = [
    ...messages.filter((said) => !said.own).map(named),
    ...(retriedBy === undefined
      ? []
      : [Prompt.makePart("text", { text: `${retriedBy} asked you to try that again.` })]),
  ];
  return content.length === 0 ? undefined : Prompt.makeMessage("user", { content });
};

/**
 * The conversation an agent's session starts with when it joins a thread under way: others'
 * messages as the user's, each named by its author, and its own, from an earlier time it took
 * part, as its answers. Consecutive messages of one side make one message, as models take a
 * conversation whose sides alternate.
 */
export const historyOf = (messages: ReadonlyArray<Said>): Prompt.Prompt => {
  const conversation: Array<Prompt.Message> = [];
  let run: Array<Said> = [];
  const endRun = () => {
    const [first] = run;
    if (first === undefined) return;
    conversation.push(
      first.own
        ? Prompt.makeMessage("assistant", {
            content: run.map((said) => Prompt.makePart("text", { text: said.text })),
          })
        : Prompt.makeMessage("user", { content: run.map(named) }),
    );
    run = [];
  };
  for (const said of messages) {
    if (run[0] !== undefined && run[0].own !== said.own) endRun();
    run.push(said);
  }
  endRun();
  return Prompt.fromMessages(conversation);
};

export * as TurnPrompt from "./prompt.ts";
