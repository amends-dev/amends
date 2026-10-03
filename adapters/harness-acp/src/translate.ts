/**
 * Turns what an ACP agent reports while it answers a prompt into the harness events a turn records.
 * The agent reports a prompt's work as pieces of messages and as tool calls it runs itself. A
 * response is the output of one model request: the pieces of one message and the calls it made. It
 * ends when the agent names another message, or when a piece or call follows results of its calls,
 * since a model sees results only in its next request; the prompt's end finishes the last one.
 */
import { HarnessEvent, Transcript } from "@amends/harness";
import type { AcpProtocol } from "./protocol.ts";

type Update = AcpProtocol.Update;
type ToolCallUpdate = Extract<Update, { readonly sessionUpdate: "tool_call" | "tool_call_update" }>;

/** A text or reasoning block of the open response, as it streams. */
interface Block {
  readonly kind: "Text" | "Reasoning";
  readonly part: number;
  text: string;
}

/** A tool call the agent made, and how far the events have reported it. */
interface Call {
  readonly id: Transcript.ToolCallId;
  readonly responseId: Transcript.ResponseId;
  readonly part: number;
  name: string;
  params: unknown;
  reported: boolean;
  started: boolean;
}

/** The response the agent's pieces and calls currently go to. */
interface Response {
  readonly id: Transcript.ResponseId;
  messageId: string | undefined;
  parts: number;
  block: Block | undefined;
  readonly calls: Array<Call>;
  /** Whether a call of it has its result, after which the model has made another request. */
  answered: boolean;
}

export interface Options {
  /** Begins the IDs of the responses the session reports. */
  readonly sessionId: string;
  /** The model the agent was configured with, as each response names it. */
  readonly model: HarnessEvent.ModelReference;
}

/** A tool call's name: the agent's name for the tool when it says, or else the kind of tool. */
const nameOf = (update: ToolCallUpdate, previous?: string) =>
  update.name ?? previous ?? update.kind ?? "tool";

/** The text a finished tool call reports: its output, its error, or what it shows. */
const outputOf = (update: ToolCallUpdate): string => {
  const raw = "rawOutput" in update ? update.rawOutput : undefined;
  if (typeof raw === "string") return raw;
  if (typeof raw === "object" && raw !== null) {
    const { output, error } = raw as { readonly output?: unknown; readonly error?: unknown };
    if (typeof output === "string") return output;
    if (typeof error === "string") return error;
  }
  const shown = "content" in update && update.content ? update.content : [];
  const text = shown.flatMap((item) =>
    item.content?.text === undefined ? [] : [item.content.text],
  );
  if (text.length > 0) return text.join("\n");
  return raw === undefined ? "" : JSON.stringify(raw);
};

const finishOf: Record<AcpProtocol.StopReason, HarnessEvent.FinishReason> = {
  end_turn: "stop",
  max_tokens: "length",
  refusal: "content-filter",
  max_turn_requests: "other",
  cancelled: "other",
};

/** The usage an agent reports for a prompt, without what it left out. */
const usageOf = (usage: AcpProtocol.Usage): HarnessEvent.Usage => ({
  inputTokens: usage.inputTokens,
  outputTokens: usage.outputTokens,
  ...(typeof usage.thoughtTokens === "number" && { reasoningTokens: usage.thoughtTokens }),
  ...(typeof usage.cachedReadTokens === "number" && { cacheReadTokens: usage.cachedReadTokens }),
  ...(typeof usage.cachedWriteTokens === "number" && { cacheWriteTokens: usage.cachedWriteTokens }),
});

/**
 * A translation for one session's prompts. `update` takes each update the agent sends and
 * `promptEnded` the answer to a prompt; each returns the events they make, in order.
 */
export const make = (options: Options) => {
  let responses = 0;
  let current: Response | undefined;
  const calls = new Map<string, Call>();

  const finishBlock = (response: Response, events: Array<HarnessEvent.Event>) => {
    const block = response.block;
    if (block === undefined) return;
    response.block = undefined;
    events.push({
      _tag: "BlockCompleted",
      responseId: response.id,
      part: block.part,
      block: { _tag: block.kind, text: block.text },
    });
  };

  const reportCall = (call: Call, events: Array<HarnessEvent.Event>) => {
    if (call.reported) return;
    call.reported = true;
    events.push({
      _tag: "BlockCompleted",
      responseId: call.responseId,
      part: call.part,
      block: {
        _tag: "ToolCall",
        id: call.id,
        name: call.name,
        params: (call.params ?? {}) as Transcript.ToolCall["params"],
      },
    });
  };

  const finishResponse = (
    finish: HarnessEvent.FinishReason,
    usage: AcpProtocol.Usage | null | undefined,
    events: Array<HarnessEvent.Event>,
  ) => {
    const response = current;
    if (response === undefined) return;
    current = undefined;
    finishBlock(response, events);
    for (const call of response.calls) reportCall(call, events);
    events.push({
      _tag: "ResponseFinished",
      responseId: response.id,
      finish,
      model: options.model,
      ...(usage ? { usage: usageOf(usage) } : {}),
    });
  };

  /** The response the next piece or call belongs to, starting one when the current one ended. */
  const responseFor = (messageId: string | undefined, events: Array<HarnessEvent.Event>) => {
    if (
      current !== undefined &&
      !current.answered &&
      (messageId === undefined ||
        current.messageId === undefined ||
        current.messageId === messageId)
    ) {
      current.messageId ??= messageId;
      return current;
    }
    if (current !== undefined)
      finishResponse(current.calls.length > 0 ? "tool-calls" : "other", undefined, events);
    responses += 1;
    current = {
      id: Transcript.ResponseId.make(`${options.sessionId}/response-${responses}`),
      messageId,
      parts: 0,
      block: undefined,
      calls: [],
      answered: false,
    };
    return current;
  };

  const piece = (
    kind: Block["kind"],
    text: string,
    messageId: string | undefined,
    events: Array<HarnessEvent.Event>,
  ) => {
    const response = responseFor(messageId, events);
    if (response.block?.kind !== kind) {
      finishBlock(response, events);
      response.block = { kind, part: response.parts++, text: "" };
    }
    response.block.text += text;
    events.push({
      _tag: kind === "Text" ? "TextDelta" : "ReasoningDelta",
      responseId: response.id,
      part: response.block.part,
      delta: text,
    });
  };

  const toolCall = (update: ToolCallUpdate, events: Array<HarnessEvent.Event>) => {
    let call = calls.get(update.toolCallId);
    if (call === undefined) {
      const response = responseFor(undefined, events);
      finishBlock(response, events);
      call = {
        id: Transcript.ToolCallId.make(update.toolCallId),
        responseId: response.id,
        part: response.parts++,
        name: nameOf(update),
        params: update.rawInput,
        reported: false,
        started: false,
      };
      calls.set(update.toolCallId, call);
      response.calls.push(call);
    }
    if (!call.reported) {
      call.name = nameOf(update, call.name);
      if (update.rawInput !== undefined) call.params = update.rawInput;
    }
    const status = update.status;
    if (status !== "in_progress" && status !== "completed" && status !== "failed") return;
    reportCall(call, events);
    if (!call.started) {
      call.started = true;
      events.push({ _tag: "ToolCallStarted", callId: call.id });
    }
    if (status === "in_progress") return;
    events.push({
      _tag: "ToolCallCompleted",
      result: Transcript.toolResult(call, {
        isError: status === "failed",
        content: [{ _tag: "Text", text: outputOf(update) }],
      }),
    });
    calls.delete(update.toolCallId);
    if (current?.id === call.responseId) current.answered = true;
  };

  return {
    /** The events an update from the agent makes. */
    update: (update: Update): ReadonlyArray<HarnessEvent.Event> => {
      const events: Array<HarnessEvent.Event> = [];
      switch (update.sessionUpdate) {
        case "agent_message_chunk":
        case "agent_thought_chunk":
          if (update.content.type === "text" && update.content.text)
            piece(
              update.sessionUpdate === "agent_message_chunk" ? "Text" : "Reasoning",
              update.content.text,
              update.messageId ?? undefined,
              events,
            );
          break;
        case "tool_call":
        case "tool_call_update":
          toolCall(update, events);
          break;
        case "user_message_chunk":
          break;
      }
      return events;
    },
    /** The events the end of a prompt makes: its last response finishes. */
    promptEnded: (answer: AcpProtocol.PromptResponse): ReadonlyArray<HarnessEvent.Event> => {
      const events: Array<HarnessEvent.Event> = [];
      finishResponse(finishOf[answer.stopReason], answer.usage, events);
      return events;
    },
  };
};

export type Translation = ReturnType<typeof make>;

export * as AcpTranslation from "./translate.ts";
