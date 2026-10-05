/**
 * Writes a conversation as the events opencode records for a session, so that a session started on
 * another agent goes on in opencode: appended to a new opencode session with `Server.replay`, they
 * are the conversation its model reads.
 *
 * Each user message becomes a prompt, and each assistant message a step, with the results of its
 * tool calls from the tool messages after it. A tool call is written with every event opencode
 * records for one, since opencode keeps a call only from the start of its input. The tools need not
 * be opencode's own. The steps name the model `amends/history`, because a conversation does not say
 * which model answered; opencode reads them whichever model they name.
 */
import { HarnessError } from "@amends/harness-v2";
import { Predicate, Result, Schema } from "effect";
import type { Prompt } from "effect/ai";
import { type ModelRef, type SessionEvent, ToolContent } from "./SessionEvent.ts";

export interface Session {
  /** The opencode session the events are appended to, which has recorded only its creation. */
  readonly sessionID: string;

  /** When the events are written, in milliseconds since the epoch. */
  readonly now: number;
}

/**
 * The events that record `conversation` in `session`, numbered from 1. Fails with
 * `UnsupportedError` for a conversation opencode cannot record.
 */
export const eventsOf = (
  conversation: Prompt.Prompt,
  session: Session,
): Result.Result<ReadonlyArray<SessionEvent>, HarnessError.UnsupportedError> => {
  const unsupported = unsupportedIn(conversation);
  if (unsupported !== undefined) {
    return Result.fail(new HarnessError.UnsupportedError({ description: unsupported }));
  }

  const events: Array<SessionEvent> = [];
  const inSession = { timestamp: session.now, sessionID: session.sessionID };
  let seq = 0;
  const envelope = (version: number) => {
    seq += 1;
    return {
      id: opencodeId("evt", session, seq),
      durable: { aggregateID: session.sessionID, seq, version },
    };
  };

  /** The step of the assistant message last written, until a message that is not a tool's. */
  let step: { readonly assistantMessageID: string; calledTools: boolean } | undefined;

  const writePrompt = (message: Prompt.UserMessage, messageID: string) =>
    events.push({
      ...envelope(1),
      type: "session.next.prompted",
      data: {
        ...inSession,
        messageID,
        prompt: {
          text: message.content
            .flatMap((part) => (part.type === "text" ? [part.text] : []))
            .join("\n"),
        },
        delivery: "steer",
      },
    });

  const startStep = (assistantMessageID: string) => {
    step = { assistantMessageID, calledTools: false };
    events.push({
      ...envelope(1),
      type: "session.next.step.started",
      data: { ...inSession, assistantMessageID, agent: "build", model: historyModel },
    });
  };

  const writePart = (
    assistantMessageID: string,
    part: Prompt.AssistantMessagePart,
    index: number,
  ) => {
    switch (part.type) {
      case "text":
        return events.push(
          {
            ...envelope(1),
            type: "session.next.text.started",
            data: { ...inSession, assistantMessageID, textID: `text-${index}` },
          },
          {
            ...envelope(1),
            type: "session.next.text.ended",
            data: { ...inSession, assistantMessageID, textID: `text-${index}`, text: part.text },
          },
        );
      case "reasoning":
        return events.push(
          {
            ...envelope(1),
            type: "session.next.reasoning.started",
            data: { ...inSession, assistantMessageID, reasoningID: `reasoning-${index}` },
          },
          {
            ...envelope(1),
            type: "session.next.reasoning.ended",
            data: {
              ...inSession,
              assistantMessageID,
              reasoningID: `reasoning-${index}`,
              text: part.text,
            },
          },
        );
      case "tool-call": {
        if (step !== undefined) step.calledTools = true;
        const input = inputOf(part.params);
        return events.push(
          {
            ...envelope(1),
            type: "session.next.tool.input.started",
            data: { ...inSession, assistantMessageID, callID: part.id, name: part.name },
          },
          {
            ...envelope(1),
            type: "session.next.tool.input.ended",
            data: {
              ...inSession,
              assistantMessageID,
              callID: part.id,
              text: JSON.stringify(input),
            },
          },
          {
            ...envelope(1),
            type: "session.next.tool.called",
            data: {
              ...inSession,
              assistantMessageID,
              callID: part.id,
              tool: part.name,
              input,
              provider: { executed: false },
            },
          },
        );
      }
      case "tool-result":
        return writeResult(assistantMessageID, part);
      // `unsupportedIn` refused files, and an approval changes what the model reads only through
      // the result that follows it.
      case "file":
      case "tool-approval-request":
        return;
    }
  };

  const writeResult = (assistantMessageID: string, part: Prompt.ToolResultPart) =>
    events.push(
      part.isFailure
        ? {
            ...envelope(1),
            type: "session.next.tool.failed",
            data: {
              ...inSession,
              assistantMessageID,
              callID: part.id,
              error: { type: "unknown", message: textOf(part.result) },
              provider: { executed: false },
            },
          }
        : {
            ...envelope(1),
            type: "session.next.tool.success",
            data: {
              ...inSession,
              assistantMessageID,
              callID: part.id,
              structured: {},
              content: contentOf(part.result),
              provider: { executed: false },
            },
          },
    );

  const endStep = () => {
    if (step === undefined) return;
    events.push({
      ...envelope(2),
      type: "session.next.step.ended",
      data: {
        ...inSession,
        assistantMessageID: step.assistantMessageID,
        finish: step.calledTools ? "tool-calls" : "stop",
        cost: 0,
        tokens: { input: 0, output: 0, reasoning: 0, cache: { read: 0, write: 0 } },
      },
    });
    step = undefined;
  };

  for (const [index, message] of conversation.content.entries()) {
    const messageID = opencodeId("msg", session, index + 1);
    switch (message.role) {
      case "user":
        endStep();
        writePrompt(message, messageID);
        break;
      case "assistant":
        endStep();
        startStep(messageID);
        for (const [partIndex, part] of message.content.entries()) {
          writePart(messageID, part, partIndex);
        }
        break;
      case "tool":
        for (const part of message.content) {
          if (step !== undefined && part.type === "tool-result") {
            writeResult(step.assistantMessageID, part);
          }
        }
        break;
      // `unsupportedIn` refused system messages.
      case "system":
        break;
    }
  }
  endStep();
  return Result.succeed(events);
};

// TODO: Write a user message's files into its prompt, once the agent sends files with a prompt.
// TODO: Carry a reasoning part's provider options, such as its signature, once the model that reads
// them can be the one that wrote them.
/** Why opencode cannot record `conversation`, or nothing when it can. */
const unsupportedIn = (conversation: Prompt.Prompt): string | undefined => {
  let answering = false;
  for (const message of conversation.content) {
    if (message.role === "system") return "opencode keeps no system messages in a session";
    if (message.role !== "tool" && message.content.some((part) => part.type === "file")) {
      return "The opencode agent does not yet write files into a session";
    }
    if (message.role === "tool" && !answering) {
      return "opencode records tool results only after the assistant message that called them";
    }
    if (message.role !== "tool") answering = message.role === "assistant";
  }
  return undefined;
};

/** The model the steps of a written conversation name. */
const historyModel: ModelRef = { providerID: "amends", id: "history" };

/**
 * An id as opencode makes one: a prefix, the low 48 bits of the time it was made with a count
 * within it, then a random part. The session's own random part keeps the ids written for it unique
 * to it.
 */
const opencodeId = (prefix: string, session: Session, count: number) =>
  `${prefix}_${((BigInt(session.now) * 0x1000n + BigInt(count)) & 0xffff_ffff_ffffn).toString(16).padStart(12, "0")}${session.sessionID.slice(-14)}`;

/** A tool's input as opencode keeps it: an object, wrapping any other value as opencode does. */
const inputOf = (params: unknown): Record<string, unknown> =>
  Predicate.isObject(params) ? params : { value: params };

/** What the model reads of a tool's result: the content opencode returned, or the result as text. */
const contentOf = (result: unknown): ReadonlyArray<ToolContent> =>
  Schema.is(Schema.Array(ToolContent))(result) ? result : [{ type: "text", text: textOf(result) }];

const textOf = (result: unknown) => (typeof result === "string" ? result : JSON.stringify(result));
