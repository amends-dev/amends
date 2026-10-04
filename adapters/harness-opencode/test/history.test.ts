import type { StreamPart } from "@amends/harness-v2";
import { describe, expect, it } from "@effect/vitest";
import { Result } from "effect";
import { Prompt } from "effect/ai";
import * as History from "../src/bridge/History.ts";
import type { SessionEvent } from "../src/bridge/SessionEvent.ts";
import * as Turn from "../src/bridge/Turn.ts";

/** A session opencode created: its id ends with a random part, which the written ids reuse. */
const session = { sessionID: "ses_efb8baedfffeBYbN21QzYS7lIf", now: 1_791_073_617_000 };

const eventsOf = (conversation: Prompt.RawInput) =>
  Result.getOrThrow(History.eventsOf(Prompt.make(conversation), session));

/** What opencode's model reads back from `events`, as a turn would stream it. */
const partsOf = (events: ReadonlyArray<SessionEvent>) => {
  let turn = Turn.initial;
  const parts: Array<StreamPart.StreamPart> = [];
  for (const event of events) {
    const [next, translated] = Result.getOrThrow(Turn.translate(turn, event));
    turn = next;
    parts.push(...translated);
  }
  return parts;
};

/** A conversation with another agent that called a tool opencode does not have. */
const weatherConversation: Prompt.RawInput = [
  {
    role: "user",
    content: "Remember the codename BLUE-MARLIN-9. Then check the weather in Lisbon.",
  },
  {
    role: "assistant",
    content: [
      { type: "reasoning", text: "I will call the weather tool." },
      {
        type: "tool-call",
        id: "call_1",
        name: "lookup_weather",
        params: { city: "Lisbon" },
        providerExecuted: false,
      },
    ],
  },
  {
    role: "tool",
    content: [
      {
        type: "tool-result",
        id: "call_1",
        name: "lookup_weather",
        isFailure: false,
        result: { forecast: "foggy", celsius: 14 },
        providerExecuted: false,
      },
    ],
  },
  { role: "assistant", content: [{ type: "text", text: "Noted. Lisbon is foggy." }] },
];

describe("History", () => {
  it("writes each user message as a prompt and each assistant message as a step", () => {
    const events = eventsOf(weatherConversation);

    expect(events.map((event) => [event.durable.seq, event.type, event.durable.version])).toEqual([
      [1, "session.next.prompted", 1],
      [2, "session.next.step.started", 1],
      [3, "session.next.reasoning.started", 1],
      [4, "session.next.reasoning.ended", 1],
      [5, "session.next.tool.input.started", 1],
      [6, "session.next.tool.input.ended", 1],
      [7, "session.next.tool.called", 1],
      [8, "session.next.tool.success", 1],
      [9, "session.next.step.ended", 2],
      [10, "session.next.step.started", 1],
      [11, "session.next.text.started", 1],
      [12, "session.next.text.ended", 1],
      [13, "session.next.step.ended", 2],
    ]);
    expect(events.every((event) => event.durable.aggregateID === session.sessionID)).toBe(true);
    expect(events.every((event) => event.data.sessionID === session.sessionID)).toBe(true);
  });

  it("writes what opencode's model reads back as the conversation it was given", () => {
    const parts = partsOf(eventsOf(weatherConversation));

    expect(parts.filter((part) => part.type !== "response-metadata")).toEqual([
      { type: "reasoning-start", id: "reasoning-0" },
      { type: "reasoning-delta", id: "reasoning-0", delta: "I will call the weather tool." },
      { type: "reasoning-end", id: "reasoning-0" },
      { type: "tool-params-start", id: "call_1", name: "lookup_weather", providerExecuted: true },
      { type: "tool-params-delta", id: "call_1", delta: '{"city":"Lisbon"}' },
      { type: "tool-params-end", id: "call_1" },
      {
        type: "tool-call",
        id: "call_1",
        name: "lookup_weather",
        params: { city: "Lisbon" },
        providerExecuted: true,
      },
      {
        type: "tool-result",
        id: "call_1",
        name: "lookup_weather",
        result: [{ type: "text", text: '{"forecast":"foggy","celsius":14}' }],
        isFailure: false,
        providerExecuted: true,
      },
      expect.objectContaining({ type: "finish-step", reason: "tool-calls" }),
      { type: "text-start", id: "text-0" },
      { type: "text-delta", id: "text-0", delta: "Noted. Lisbon is foggy." },
      { type: "text-end", id: "text-0" },
      expect.objectContaining({ type: "finish-step", reason: "stop" }),
      expect.objectContaining({ type: "finish", reason: "stop" }),
    ]);
  });

  it("names the placeholder model in its steps, which a conversation does not record", () => {
    const steps = eventsOf(weatherConversation).filter(
      (event) => event.type === "session.next.step.started",
    );

    expect(steps.map((step) => step.data)).toEqual([
      expect.objectContaining({ agent: "build", model: { providerID: "amends", id: "history" } }),
      expect.objectContaining({ agent: "build", model: { providerID: "amends", id: "history" } }),
    ]);
  });

  it("gives a result that is opencode's content as it is, and any other as text", () => {
    const content = [{ type: "text", text: "hello-probe\n" }];
    const events = eventsOf([
      { role: "user", content: "Run two commands." },
      {
        role: "assistant",
        content: [
          { type: "tool-call", id: "a", name: "bash", params: {}, providerExecuted: false },
          { type: "tool-call", id: "b", name: "bash", params: {}, providerExecuted: false },
          { type: "tool-call", id: "c", name: "bash", params: {}, providerExecuted: false },
        ],
      },
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            id: "a",
            name: "bash",
            isFailure: false,
            result: content,
            providerExecuted: false,
          },
          {
            type: "tool-result",
            id: "b",
            name: "bash",
            isFailure: false,
            result: "plain text",
            providerExecuted: false,
          },
          {
            type: "tool-result",
            id: "c",
            name: "bash",
            isFailure: true,
            result: { code: 3 },
            providerExecuted: false,
          },
        ],
      },
    ]);

    expect(
      events.flatMap((event) =>
        event.type === "session.next.tool.success" ? [event.data.content] : [],
      ),
    ).toEqual([content, [{ type: "text", text: "plain text" }]]);
    expect(
      events.flatMap((event) =>
        event.type === "session.next.tool.failed" ? [event.data.error] : [],
      ),
    ).toEqual([{ type: "unknown", message: '{"code":3}' }]);
  });

  it("wraps a tool's params that are not an object, as opencode does", () => {
    const events = eventsOf([
      { role: "user", content: "Count." },
      {
        role: "assistant",
        content: [
          { type: "tool-call", id: "a", name: "count", params: 3, providerExecuted: false },
        ],
      },
    ]);

    const called = events.find((event) => event.type === "session.next.tool.called");
    expect(called?.type === "session.next.tool.called" && called.data.input).toEqual({ value: 3 });
  });

  it("joins a user message's texts into one prompt and leaves approvals out", () => {
    const events = eventsOf([
      {
        role: "user",
        content: [
          { type: "text", text: "First line." },
          { type: "text", text: "Second line." },
        ],
      },
      {
        role: "assistant",
        content: [
          { type: "tool-call", id: "a", name: "bash", params: {}, providerExecuted: false },
          { type: "tool-approval-request", approvalId: "approval-1", toolCallId: "a" },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-approval-response", approvalId: "approval-1", approved: true },
          {
            type: "tool-result",
            id: "a",
            name: "bash",
            isFailure: false,
            result: "ok",
            providerExecuted: false,
          },
        ],
      },
    ]);

    const prompted = events[0];
    expect(prompted?.type === "session.next.prompted" && prompted.data.prompt).toEqual({
      text: "First line.\nSecond line.",
    });
    expect(events.map((event) => event.type)).toEqual([
      "session.next.prompted",
      "session.next.step.started",
      "session.next.tool.input.started",
      "session.next.tool.input.ended",
      "session.next.tool.called",
      "session.next.tool.success",
      "session.next.step.ended",
    ]);
  });

  it("makes ids as opencode does, unique and in order, ending with the session's random part", () => {
    const events = eventsOf(weatherConversation);
    const messageIDs = events.flatMap((event) =>
      event.type === "session.next.prompted"
        ? [event.data.messageID]
        : event.type === "session.next.step.started"
          ? [event.data.assistantMessageID]
          : [],
    );
    const eventIDs = events.map((event) => event.id);

    for (const id of eventIDs) expect(id).toMatch(/^evt_[0-9a-f]{12}BYbN21QzYS7lIf$/);
    for (const id of messageIDs) expect(id).toMatch(/^msg_[0-9a-f]{12}BYbN21QzYS7lIf$/);
    expect(new Set(eventIDs).size).toBe(eventIDs.length);
    expect(new Set(messageIDs).size).toBe(messageIDs.length);
    expect([...eventIDs].sort()).toEqual(eventIDs);
    expect([...messageIDs].sort()).toEqual(messageIDs);
  });

  it("writes nothing for an empty conversation", () => {
    expect(eventsOf([])).toEqual([]);
  });

  it("refuses a conversation opencode cannot record", () => {
    const refusal = (conversation: Prompt.RawInput) => {
      const written = History.eventsOf(Prompt.make(conversation), session);
      return Result.isFailure(written) ? written.failure : undefined;
    };
    const file = { type: "file", mediaType: "text/plain", data: "aGk=" } as const;

    expect(refusal([{ role: "system", content: "Be brief." }])).toEqual(
      expect.objectContaining({ _tag: "UnsupportedError" }),
    );
    expect(refusal([{ role: "user", content: [file] }])).toEqual(
      expect.objectContaining({ _tag: "UnsupportedError" }),
    );
    expect(
      refusal([
        { role: "user", content: "Show me." },
        { role: "assistant", content: [file] },
      ]),
    ).toEqual(expect.objectContaining({ _tag: "UnsupportedError" }));
    expect(
      refusal([
        { role: "user", content: "Hi." },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              id: "a",
              name: "bash",
              isFailure: false,
              result: "ok",
              providerExecuted: false,
            },
          ],
        },
      ]),
    ).toEqual(expect.objectContaining({ _tag: "UnsupportedError" }));
  });
});
