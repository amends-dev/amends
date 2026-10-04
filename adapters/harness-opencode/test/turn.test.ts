import type { StreamPart } from "@amends/harness-v2";
import { describe, expect, it } from "@effect/vitest";
import { Result } from "effect";
import type { SessionEvent } from "../src/SessionEvent.ts";
import * as Turn from "../src/Turn.ts";
import { makeEvents, tokens } from "./fixtures.ts";

/** Translates `events` in order, returning the turn after them and the parts they streamed. */
const translateAll = (events: ReadonlyArray<SessionEvent>) => {
  let turn = Turn.initial;
  const parts: Array<StreamPart.StreamPart> = [];
  for (const event of events) {
    const [next, translated] = Result.getOrThrow(Turn.translate(turn, event));
    turn = next;
    parts.push(...translated);
  }
  return { turn, parts };
};

const model = { providerID: "opencode", id: "fledge-alpha-free" };

/** Effect AI's usage for opencode's tokens of steps that cached nothing and reasoned not at all. */
const usage = (input: number, output: number) => ({
  inputTokens: { uncached: input, total: input, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: output, text: output, reasoning: 0 },
});

describe("Turn", () => {
  it("translates a turn that calls a tool and then answers, step by step", () => {
    // The events opencode 1.18 recorded for this turn, but for timestamps.
    const event = makeEvents("ses_turn");
    const prompted = event("session.next.prompted", {
      messageID: "msg_1",
      prompt: { text: "Run `echo hello-probe`, then tell me its output." },
      delivery: "steer",
    });
    const firstStep = event("session.next.step.started", {
      assistantMessageID: "msg_2",
      agent: "build",
      model,
    });
    const firstStepEvents = [
      event("session.next.reasoning.started", {
        assistantMessageID: "msg_2",
        reasoningID: "reasoning-0",
      }),
      event("session.next.reasoning.ended", {
        assistantMessageID: "msg_2",
        reasoningID: "reasoning-0",
        text: "Need to use the bash tool.",
      }),
      event("session.next.tool.input.started", {
        assistantMessageID: "msg_2",
        callID: "functions.bash:0",
        name: "bash",
      }),
      event("session.next.tool.input.ended", {
        assistantMessageID: "msg_2",
        callID: "functions.bash:0",
        text: '{"command": "echo hello-probe"}',
      }),
      event("session.next.tool.called", {
        assistantMessageID: "msg_2",
        callID: "functions.bash:0",
        tool: "bash",
        input: { command: "echo hello-probe" },
        provider: { executed: false },
      }),
      event("session.next.tool.success", {
        assistantMessageID: "msg_2",
        callID: "functions.bash:0",
        structured: { exit: 0, truncated: false },
        content: [
          { type: "text", text: "hello-probe\n" },
          { type: "text", text: "Command exited with code 0." },
        ],
        outputPaths: [],
        provider: { executed: false },
      }),
      event("session.next.step.ended", {
        assistantMessageID: "msg_2",
        finish: "tool-calls",
        cost: 0,
        tokens: tokens(3609, 74),
      }),
    ];
    const secondStep = event("session.next.step.started", {
      assistantMessageID: "msg_3",
      agent: "build",
      model,
    });
    const secondStepEvents = [
      event("session.next.text.started", { assistantMessageID: "msg_3", textID: "text-0" }),
      event("session.next.text.ended", {
        assistantMessageID: "msg_3",
        textID: "text-0",
        text: "hello-probe",
      }),
      event("session.next.step.ended", {
        assistantMessageID: "msg_3",
        finish: "stop",
        cost: 0,
        tokens: tokens(3954, 28),
      }),
    ];

    const { turn, parts } = translateAll([
      prompted,
      firstStep,
      ...firstStepEvents,
      secondStep,
      ...secondStepEvents,
    ]);

    expect(parts).toEqual([
      {
        type: "response-metadata",
        id: "msg_2",
        modelId: "opencode/fledge-alpha-free",
        timestamp: new Date(firstStep.data.timestamp).toISOString(),
      },
      { type: "reasoning-start", id: "reasoning-0" },
      { type: "reasoning-delta", id: "reasoning-0", delta: "Need to use the bash tool." },
      { type: "reasoning-end", id: "reasoning-0" },
      { type: "tool-params-start", id: "functions.bash:0", name: "bash", providerExecuted: true },
      {
        type: "tool-params-delta",
        id: "functions.bash:0",
        delta: '{"command": "echo hello-probe"}',
      },
      { type: "tool-params-end", id: "functions.bash:0" },
      {
        type: "tool-call",
        id: "functions.bash:0",
        name: "bash",
        params: { command: "echo hello-probe" },
        providerExecuted: true,
      },
      {
        type: "tool-result",
        id: "functions.bash:0",
        name: "bash",
        result: [
          { type: "text", text: "hello-probe\n" },
          { type: "text", text: "Command exited with code 0." },
        ],
        isFailure: false,
        providerExecuted: true,
      },
      { type: "finish-step", reason: "tool-calls", usage: usage(3609, 74) },
      {
        type: "response-metadata",
        id: "msg_3",
        modelId: "opencode/fledge-alpha-free",
        timestamp: new Date(secondStep.data.timestamp).toISOString(),
      },
      { type: "text-start", id: "text-0" },
      { type: "text-delta", id: "text-0", delta: "hello-probe" },
      { type: "text-end", id: "text-0" },
      { type: "finish-step", reason: "stop", usage: usage(3954, 28) },
      { type: "finish", reason: "stop", usage: usage(3609 + 3954, 74 + 28) },
    ]);
    expect(turn.finished).toBe(true);
  });

  it("counts tokens as Effect AI does: input with the cached tokens, output with reasoning", () => {
    const event = makeEvents("ses_tokens");

    const { parts } = translateAll([
      event("session.next.step.ended", {
        assistantMessageID: "msg_1",
        finish: "stop",
        cost: 0,
        tokens: { input: 168, output: 60, reasoning: 12, cache: { read: 3840, write: 5 } },
      }),
    ]);

    expect(parts.at(-1)).toEqual({
      type: "finish",
      reason: "stop",
      usage: {
        inputTokens: { uncached: 168, total: 168 + 3840 + 5, cacheRead: 3840, cacheWrite: 5 },
        outputTokens: { total: 60 + 12, text: 60, reasoning: 12 },
      },
    });
  });

  it("ends the turn at a step that fails, with opencode's error", () => {
    // opencode records a turn interrupted while the model writes as a failed step.
    const event = makeEvents("ses_failed");

    const { turn, parts } = translateAll([
      event("session.next.step.started", { assistantMessageID: "msg_1", agent: "build", model }),
      event("session.next.text.started", { assistantMessageID: "msg_1", textID: "text-0" }),
      event("session.next.text.ended", {
        assistantMessageID: "msg_1",
        textID: "text-0",
        text: "The lighthouse stood",
      }),
      event("session.next.step.failed", {
        assistantMessageID: "msg_1",
        error: { type: "unknown", message: "Provider turn interrupted" },
      }),
    ]);

    expect(parts.slice(-2)).toEqual([
      { type: "error", error: { type: "unknown", message: "Provider turn interrupted" } },
      { type: "finish", reason: "error", usage: usage(0, 0) },
    ]);
    expect(turn.finished).toBe(true);
  });

  it("finishes a turn opencode stopped unfinished, with the tokens of the steps that ended", () => {
    // opencode records a turn interrupted while a tool runs as a step that called tools, and then
    // nothing.
    const event = makeEvents("ses_stopped");
    const { turn, parts } = translateAll([
      event("session.next.step.started", { assistantMessageID: "msg_1", agent: "build", model }),
      event("session.next.tool.called", {
        assistantMessageID: "msg_1",
        callID: "functions.bash:1",
        tool: "bash",
        input: { command: "sleep 20" },
        provider: { executed: false },
      }),
      event("session.next.tool.failed", {
        assistantMessageID: "msg_1",
        callID: "functions.bash:1",
        error: { type: "unknown", message: "Tool execution interrupted" },
        provider: { executed: false },
      }),
      event("session.next.step.ended", {
        assistantMessageID: "msg_1",
        finish: "tool-calls",
        cost: 0,
        tokens: tokens(168, 60),
      }),
    ]);

    expect(parts.find((part) => part.type === "tool-result")).toEqual({
      type: "tool-result",
      id: "functions.bash:1",
      name: "bash",
      result: "Tool execution interrupted",
      isFailure: true,
      providerExecuted: true,
    });
    expect(turn.finished).toBe(false);
    expect(Turn.finishStopped(turn)).toEqual([
      {
        type: "error",
        error: { type: "unknown", message: "opencode stopped the turn unfinished" },
      },
      { type: "finish", reason: "error", usage: usage(168, 60) },
    ]);
  });

  it("streams nothing after the turn finished, nor when its events end", () => {
    const event = makeEvents("ses_after");
    const { turn } = translateAll([
      event("session.next.step.ended", {
        assistantMessageID: "msg_1",
        finish: "stop",
        cost: 0,
        tokens: tokens(10, 5),
      }),
    ]);

    const later = event("session.next.text.started", {
      assistantMessageID: "msg_2",
      textID: "text-0",
    });

    expect(Result.getOrThrow(Turn.translate(turn, later))).toEqual([turn, []]);
    expect(Turn.finishStopped(turn)).toEqual([]);
  });

  it("fails on the result of a call the turn did not make", () => {
    const event = makeEvents("ses_unknown_call");

    const translated = Turn.translate(
      Turn.initial,
      event("session.next.tool.success", {
        assistantMessageID: "msg_1",
        callID: "call_elsewhere",
        structured: {},
        content: [],
        provider: { executed: false },
      }),
    );

    expect(Result.isFailure(translated) && translated.failure._tag).toBe("InvalidOutputError");
  });

  it("reports a compaction with its summary", () => {
    const event = makeEvents("ses_compaction");

    const { parts } = translateAll([
      event("session.next.compaction.started", { messageID: "msg_1", reason: "auto" }),
      event("session.next.compaction.ended", {
        messageID: "msg_1",
        reason: "auto",
        text: "The user asked for a lighthouse story.",
        recent: "",
      }),
    ]);

    expect(parts).toEqual([
      { type: "compaction", trigger: "auto", summary: "The user asked for a lighthouse story." },
    ]);
  });

  it("names a finish reason Effect AI does not know `other`", () => {
    const event = makeEvents("ses_other");

    const { parts } = translateAll([
      event("session.next.step.ended", {
        assistantMessageID: "msg_1",
        finish: "max-turns",
        cost: 0,
        tokens: tokens(10, 5),
      }),
    ]);

    expect(parts.map((part) => (part.type === "finish" ? part.reason : undefined))).toContain(
      "other",
    );
  });
});
