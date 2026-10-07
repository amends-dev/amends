/**
 * An agent's session log in a thread: the record of its conversation there, one log for each
 * participation, which its turns write as they run. It holds what the agent was told and each step
 * it took, each with the turn it belongs to; how a turn ended is the turn's record's to say. The
 * log takes part in no commit of the workspace, so a host may keep it apart, in a store built for
 * appending (`SessionLogStore`). The agent's session resumes with the conversation rebuilt from it.
 */
import { Session, StreamPart } from "@amends/harness-v2";
import { Schema } from "effect";
import { Prompt } from "effect/ai";
import type { ThreadMessageId } from "../thread/message/id.ts";
import { TurnId } from "./id.ts";
import { TurnPrompt } from "./prompt.ts";
import type { Turn } from "./turn.ts";

export const Entry = Schema.TaggedUnion({
  /** The agent joined the thread under way, and its session started with the conversation so far. */
  Joined: { conversation: Schema.Array(TurnPrompt.Message) },
  /** A turn prompted the agent with `texts`, which tell it `messages` of the thread's messages. */
  Prompted: {
    turnId: TurnId.Id,
    texts: Schema.NonEmptyArray(Schema.String),
    messages: Schema.Int,
  },
  /** A step of the turn finished, its parts added up. `id` names it, as its drafts do. */
  Step: { turnId: TurnId.Id, id: Schema.NonEmptyString, step: StreamPart.Step },
  /** The turn's run stopped before the turn ended, and it runs again from its prompt. */
  Interrupted: { turnId: TurnId.Id, reason: Schema.NonEmptyString },
});
export type Entry = typeof Entry.Type;

/** Where an entry sits in its log: the first at 1, each next one after. */
export const Position = Schema.Int.check(Schema.isGreaterThan(0));

/** An entry as its log recorded it: where, and when. */
export const Recorded = Schema.Struct({
  position: Position,
  recordedAt: Schema.DateTimeUtcFromString,
  entry: Entry,
});
export interface Recorded extends Schema.Schema.Type<typeof Recorded> {}

/** Whether an entry is one of the turn's. */
export const isOfTurn =
  (turnId: Turn.Id) =>
  (entry: Entry): boolean =>
    entry._tag !== "Joined" && entry.turnId === turnId;

/**
 * The conversation a log records, as the agent's session resumes with it: the conversation it
 * joined, then each turn's prompt and the steps of its latest run, since a turn whose run stopped
 * short ran again from its prompt.
 */
export const historyOf = (entries: ReadonlyArray<Entry>): Prompt.Prompt => {
  const messages: Array<Prompt.Message> = [];
  /** Where the latest turn's run starts among the messages: right after its prompt. */
  let runStart = 0;
  for (const entry of entries) {
    switch (entry._tag) {
      case "Joined":
        messages.push(...entry.conversation.map(TurnPrompt.promptMessageOf));
        break;
      case "Prompted":
        messages.push(TurnPrompt.userMessageOf(entry.texts));
        runStart = messages.length;
        break;
      case "Step":
        messages.push(...Session.messagesOfStep(entry.step));
        break;
      case "Interrupted":
        messages.length = runStart;
        break;
    }
  }
  return Prompt.fromMessages(messages);
};

/** A step's text, as the parts it wrote it in, joined. */
const textOf = (step: StreamPart.Step) =>
  step.parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join("");

/**
 * What a turn answers, from its entries: the text of the last step of its latest run that has any
 * parts, as harness-v2 answers a turn. Empty when that step wrote nothing.
 */
export const answerOf = (entries: ReadonlyArray<Entry>): string => {
  let answer = "";
  for (const entry of entries) {
    if (entry._tag === "Prompted" || entry._tag === "Interrupted") answer = "";
    else if (entry._tag === "Step" && entry.step.parts.length > 0) answer = textOf(entry.step);
  }
  return answer;
};

/**
 * Reads a turn's entries as they come: `add` each in order, `end` once the turn ended, with the
 * reply it posted, and `items` says what they show.
 */
export interface Reader {
  readonly add: (recorded: Recorded) => void;
  readonly end: (messageIds: ReadonlyArray<ThreadMessageId.Id>) => void;
  readonly items: () => ReadonlyArray<Turn.LogItem>;
}

/**
 * Each of a turn's entries as its readers see it: the prompt as the messages it took in, each step
 * that wrote text as a response, and each run that stopped short. The response the turn posted is
 * its reply, once the turn ends; steps that only called tools show nothing yet.
 */
export const reader = (): Reader => {
  const items: Array<Turn.LogItem> = [];
  /** Where the latest run's last response sits among the items. */
  let lastResponse: number | undefined;
  const add: Reader["add"] = ({ entry, recordedAt: at }) => {
    switch (entry._tag) {
      case "Joined":
        return;
      case "Prompted":
        lastResponse = undefined;
        items.push({ _tag: "InputTaken", at, messages: entry.messages });
        return;
      case "Step": {
        const text = textOf(entry.step);
        if (text === "") return;
        lastResponse = items.length;
        items.push({
          _tag: "Responded",
          at,
          responseId: entry.id,
          text,
          parts: entry.step.parts.flatMap((part, index) => (part.type === "text" ? [index] : [])),
          reply: false,
        });
        return;
      }
      case "Interrupted":
        lastResponse = undefined;
        items.push({ _tag: "Interrupted", at, reason: entry.reason, retryable: true });
        return;
    }
  };
  const end: Reader["end"] = (messageIds) => {
    const response = lastResponse === undefined ? undefined : items[lastResponse];
    if (messageIds.length > 0 && lastResponse !== undefined && response?._tag === "Responded")
      items[lastResponse] = { ...response, reply: true };
  };
  return { add, end, items: () => [...items] };
};

export * as SessionLog from "./session-log.ts";
