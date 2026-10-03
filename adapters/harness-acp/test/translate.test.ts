import { HarnessEvent, Transcript } from "@amends/harness";
import { describe, expect, it } from "@effect/vitest";
import { Result } from "effect";
import { AcpTranslation } from "../src/index.ts";
import type { AcpProtocol } from "../src/index.ts";

const text = (value: string, messageId?: string): AcpProtocol.Update => ({
  sessionUpdate: "agent_message_chunk",
  content: { type: "text", text: value },
  messageId,
});
const thought = (value: string, messageId?: string): AcpProtocol.Update => ({
  sessionUpdate: "agent_thought_chunk",
  content: { type: "text", text: value },
  messageId,
});
const call = (id: string, rawInput?: unknown): AcpProtocol.Update => ({
  sessionUpdate: "tool_call",
  toolCallId: id,
  title: "bash",
  kind: "execute",
  status: "pending",
  rawInput,
});
const progress = (
  id: string,
  status: AcpProtocol.ToolCallStatus,
  fields: Partial<Extract<AcpProtocol.Update, { sessionUpdate: "tool_call_update" }>> = {},
): AcpProtocol.Update => ({ sessionUpdate: "tool_call_update", toolCallId: id, status, ...fields });

/** The events a translation makes for `updates` and then the prompt's end. */
const translate = (
  updates: ReadonlyArray<AcpProtocol.Update>,
  answer: AcpProtocol.PromptResponse = { stopReason: "end_turn" },
) => {
  const translation = AcpTranslation.make({ sessionId: "s1", model: { model: "m" } });
  return [...updates.flatMap(translation.update), ...translation.promptEnded(answer)];
};

const kinds = (events: ReadonlyArray<HarnessEvent.Event>) =>
  events.filter((event) => !HarnessEvent.isDelta(event)).map((event) => event._tag);

describe("AcpTranslation", () => {
  it("streams a message's pieces as one response, finished when the prompt ends", () => {
    const events = translate([thought("Hmm."), text("Hel", "m1"), text("lo.", "m1")], {
      stopReason: "end_turn",
      usage: { inputTokens: 10, outputTokens: 3, cachedReadTokens: 4 },
    });

    expect(events).toEqual([
      { _tag: "ReasoningDelta", responseId: "s1/response-1", part: 0, delta: "Hmm." },
      {
        _tag: "BlockCompleted",
        responseId: "s1/response-1",
        part: 0,
        block: { _tag: "Reasoning", text: "Hmm." },
      },
      { _tag: "TextDelta", responseId: "s1/response-1", part: 1, delta: "Hel" },
      { _tag: "TextDelta", responseId: "s1/response-1", part: 1, delta: "lo." },
      {
        _tag: "BlockCompleted",
        responseId: "s1/response-1",
        part: 1,
        block: { _tag: "Text", text: "Hello." },
      },
      {
        _tag: "ResponseFinished",
        responseId: "s1/response-1",
        finish: "stop",
        model: { model: "m" },
        usage: { inputTokens: 10, outputTokens: 3, cacheReadTokens: 4 },
      },
    ]);
  });

  it("starts another response for another message", () => {
    const events = translate([text("One.", "m1"), text("Two.", "m2")]);

    expect(
      events.flatMap((event) => (event._tag === "ResponseFinished" ? [event.responseId] : [])),
    ).toEqual(["s1/response-1", "s1/response-2"]);
  });

  it("reports a call the agent ran with its result, and what follows the result as another response", () => {
    const events = translate([
      text("Running it."),
      call("c1"),
      progress("c1", "in_progress", { rawInput: { command: "ls" } }),
      progress("c1", "completed", { rawOutput: { output: "a.txt\n" } }),
      text("Done."),
    ]);

    expect(kinds(events)).toEqual([
      "BlockCompleted",
      "BlockCompleted",
      "ToolCallStarted",
      "ToolCallCompleted",
      "ResponseFinished",
      "BlockCompleted",
      "ResponseFinished",
    ]);
    const transcript = HarnessEvent.transcript(events);
    expect(Result.isSuccess(Transcript.summarize(transcript))).toBe(true);
    expect(transcript).toEqual([
      {
        _tag: "Response",
        id: "s1/response-1",
        parts: [
          { _tag: "Text", text: "Running it." },
          { _tag: "ToolCall", id: "c1", name: "execute", params: { command: "ls" } },
        ],
      },
      {
        _tag: "ToolResult",
        callId: "c1",
        name: "execute",
        isError: false,
        content: [{ _tag: "Text", text: "a.txt\n" }],
      },
      { _tag: "Response", id: "s1/response-2", parts: [{ _tag: "Text", text: "Done." }] },
    ]);
    expect(events.find((event) => event._tag === "ResponseFinished")).toMatchObject({
      finish: "tool-calls",
    });
  });

  it("reports a failed call's error as its result, and a call's own name when the agent gives one", () => {
    const events = translate([
      call("c1", { path: "missing.txt" }),
      progress("c1", "failed", { name: "read", rawOutput: { error: "No such file." } }),
    ]);

    expect(HarnessEvent.transcript(events)).toEqual([
      {
        _tag: "Response",
        id: "s1/response-1",
        parts: [{ _tag: "ToolCall", id: "c1", name: "read", params: { path: "missing.txt" } }],
      },
      {
        _tag: "ToolResult",
        callId: "c1",
        name: "read",
        isError: true,
        content: [{ _tag: "Text", text: "No such file." }],
      },
    ]);
  });

  it("finishes nothing for a prompt that produced nothing, and reads each stop reason", () => {
    expect(translate([], { stopReason: "cancelled" })).toEqual([]);
    for (const [stopReason, finish] of [
      ["max_tokens", "length"],
      ["refusal", "content-filter"],
      ["cancelled", "other"],
    ] as const)
      expect(translate([text("Partial")], { stopReason }).at(-1)).toMatchObject({ finish });
  });
});
