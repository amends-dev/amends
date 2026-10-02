import { describe, expect, it } from "@effect/vitest";
import { Deferred, Effect, Fiber, Ref, Schema, Stream } from "effect";
import type { Scope } from "effect";
import { AiError, LanguageModel, Prompt } from "effect/unstable/ai";
import type { Response } from "effect/unstable/ai";
import { HarnessErrors, HarnessEvent, Transcript } from "@amends/harness";
import { type Harness, type HarnessTool } from "@amends/harness";
import { AmendsHarness } from "@amends/harness-amends";

type Script = Stream.Stream<Response.StreamPartEncoded, AiError.AiError>;

/** A model that answers each request with the next script and keeps every prompt it was sent. */
const scripted = Effect.fnUntraced(function* (scripts: ReadonlyArray<Script>) {
  const prompts: Array<Prompt.Prompt> = [];
  const model = yield* LanguageModel.make({
    generateText: () => Effect.die(new Error("The harness streams.")),
    streamText: (options) =>
      Stream.suspend(() => {
        prompts.push(options.prompt);
        return scripts[prompts.length - 1] ?? Stream.die(new Error("No script left."));
      }),
  });
  return { model, prompts };
});

const parts = (...parts: ReadonlyArray<Response.StreamPartEncoded>): Script =>
  Stream.fromIterable(parts);
const text = (id: string, value: string): ReadonlyArray<Response.StreamPartEncoded> => [
  { type: "text-start", id },
  { type: "text-delta", id, delta: value },
  { type: "text-end", id },
];
const finish = (reason: "stop" | "tool-calls"): Response.StreamPartEncoded => ({
  type: "finish",
  reason,
  usage: { inputTokens: { total: 20 }, outputTokens: { total: 4 } },
});
const call = (id: string, name: string, params: object): Response.StreamPartEncoded => ({
  type: "tool-call",
  id,
  name,
  params,
});

const alice: Transcript.Author = { id: "alice", name: "Alice" };
const input = (value: string): Transcript.Input => ({
  _tag: "Input",
  author: alice,
  content: [{ _tag: "Text", text: value }],
});
const batch = (id: string, value: string): HarnessEvent.InputBatch => ({
  id: HarnessEvent.BatchId.make(id),
  items: [input(value)],
});
const answer = (value: string): Transcript.ToolOutcome => ({
  isError: false,
  content: [{ _tag: "Text", text: value }],
});
const parameters = { type: "object", properties: { query: { type: "string" } } };

const start = (
  model: LanguageModel.LanguageModel,
  options: Harness.StartOptions,
): Effect.Effect<Harness.Session, never, Scope.Scope> =>
  AmendsHarness.make()
    .start(options)
    .pipe(Effect.provideService(LanguageModel.LanguageModel, model));

const untilIdle = (session: Harness.Session) =>
  session.events.pipe(Stream.takeUntil(HarnessEvent.Event.isAnyOf(["Idle"])), Stream.runCollect);

/** Events as a log stores and reads them back: encoded, as JSON, and decoded again. */
const stored = (events: ReadonlyArray<HarnessEvent.Event>) =>
  (
    JSON.parse(
      JSON.stringify(events.map((event) => Schema.encodeSync(HarnessEvent.Event)(event))),
    ) as Array<unknown>
  ).map((event) => Schema.decodeUnknownSync(HarnessEvent.Event)(event));

const encoded = Schema.encodeSync(Prompt.Prompt);

describe("AmendsHarness", () => {
  it.effect("answers input and reports each step", () =>
    Effect.gen(function* () {
      const { model, prompts } = yield* scripted([parts(...text("t1", "Hello"), finish("stop"))]);
      const session = yield* start(model, { sessionId: "s1", instructions: "Be brief." });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "Hi"));
      const events = yield* untilIdle(session);

      expect(events.map((event) => event._tag)).toEqual([
        "InputIncorporated",
        "TextDelta",
        "BlockCompleted",
        "ResponseFinished",
        "Idle",
      ]);
      expect(events[2]).toMatchObject({
        responseId: "s1/1",
        part: 0,
        block: { _tag: "Text", text: "Hello" },
      });
      expect(events[3]).toMatchObject({
        responseId: "s1/1",
        finish: "stop",
        usage: { inputTokens: 20, outputTokens: 4 },
      });
      expect(HarnessEvent.transcript(events)).toEqual([
        input("Hi"),
        { _tag: "Response", id: "s1/1", parts: [{ _tag: "Text", text: "Hello" }] },
      ]);
      expect(encoded(prompts[0]!).content).toMatchObject([
        { role: "system", content: "Be brief." },
        { role: "user", content: "Alice: Hi" },
      ]);
    }),
  );

  it.effect("keeps text and reasoning separate when their start events are missing", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([
        parts(
          { type: "reasoning-delta", id: "shared", delta: "Think " },
          { type: "text-delta", id: "shared", delta: "Hello " },
          { type: "reasoning-delta", id: "shared", delta: "again." },
          { type: "text-delta", id: "shared", delta: "world." },
          { type: "reasoning-end", id: "shared" },
          { type: "text-end", id: "shared" },
          finish("stop"),
        ),
      ]);
      const session = yield* start(model, { sessionId: "s1" });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "Hi"));
      const events = yield* untilIdle(session);

      expect(
        events
          .filter(HarnessEvent.Event.isAnyOf(["TextDelta", "ReasoningDelta"]))
          .map(({ part, delta }) => ({ part, delta })),
      ).toEqual([
        { part: 0, delta: "Think " },
        { part: 1, delta: "Hello " },
        { part: 0, delta: "again." },
        { part: 1, delta: "world." },
      ]);
      expect(HarnessEvent.transcript(stored(events))).toEqual([
        input("Hi"),
        {
          _tag: "Response",
          id: "s1/1",
          parts: [
            { _tag: "Reasoning", text: "Think again." },
            { _tag: "Text", text: "Hello world." },
          ],
        },
      ]);
    }),
  );

  it.effect("merges provider metadata from a block's start, deltas, and end", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([
        parts(
          {
            type: "reasoning-start",
            id: "r",
            metadata: {
              provider: { started: true, signature: "initial" },
              other: { preserved: true },
            },
          },
          {
            type: "reasoning-delta",
            id: "r",
            delta: "Think.",
            metadata: {
              provider: { delta: true },
            },
          },
          {
            type: "reasoning-end",
            id: "r",
            metadata: {
              provider: { signature: "final" },
            },
          },
          ...text("t", "Hello"),
          finish("stop"),
        ),
      ]);
      const session = yield* start(model, { sessionId: "s1" });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "Hi"));
      const events = yield* untilIdle(session);

      expect(HarnessEvent.transcript(stored(events))).toEqual([
        input("Hi"),
        {
          _tag: "Response",
          id: "s1/1",
          parts: [
            {
              _tag: "Reasoning",
              text: "Think.",
              native: {
                amends: {
                  provider: { started: true, delta: true, signature: "final" },
                  other: { preserved: true },
                },
              },
            },
            { _tag: "Text", text: "Hello" },
          ],
        },
      ]);
    }),
  );

  it.effect("completes every block once when end events are missing or repeated", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([
        parts(
          ...text("ended", "First"),
          { type: "text-end", id: "ended" },
          { type: "reasoning-start", id: "r" },
          { type: "reasoning-delta", id: "r", delta: "Think." },
          { type: "text-start", id: "open" },
          { type: "text-delta", id: "open", delta: "Last" },
          finish("stop"),
        ),
      ]);
      const session = yield* start(model, { sessionId: "s1" });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "Hi"));
      const events = yield* untilIdle(session);

      expect(
        events
          .filter(HarnessEvent.Event.isAnyOf(["BlockCompleted"]))
          .map(({ part, block }) => ({ part, block })),
      ).toEqual([
        { part: 0, block: { _tag: "Text", text: "First" } },
        { part: 1, block: { _tag: "Reasoning", text: "Think." } },
        { part: 2, block: { _tag: "Text", text: "Last" } },
      ]);
    }),
  );

  it.effect("runs the tools a response calls and answers with their results", () =>
    Effect.gen(function* () {
      const { model, prompts } = yield* scripted([
        parts(call("c1", "lookup", { query: "tides" }), finish("tool-calls")),
        parts(...text("t1", "High tide is at noon."), finish("stop")),
      ]);
      const tools: HarnessTool.Tools = {
        definitions: [{ name: "lookup", parameters }],
        invoke: (toolCall) => Effect.succeed(answer(`noon for ${JSON.stringify(toolCall.params)}`)),
      };
      const session = yield* start(model, { sessionId: "s1", tools });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "When is high tide?"));
      const events = yield* untilIdle(session);

      expect(events.map((event) => event._tag)).toEqual([
        "InputIncorporated",
        "BlockCompleted",
        "ResponseFinished",
        "ToolCallStarted",
        "ToolCallCompleted",
        "TextDelta",
        "BlockCompleted",
        "ResponseFinished",
        "Idle",
      ]);
      expect(HarnessEvent.transcript(events).map((item) => item._tag)).toEqual([
        "Input",
        "Response",
        "ToolResult",
        "Response",
      ]);
      expect(encoded(prompts[1]!).content.at(-1)).toMatchObject({
        role: "tool",
        content: [
          { type: "tool-result", id: "c1", name: "lookup", result: 'noon for {"query":"tides"}' },
        ],
      });
    }),
  );

  it.effect("reports its context full instead of making a request over its limit", () =>
    Effect.gen(function* () {
      const { model, prompts } = yield* scripted([]);
      const session = yield* start(model, { sessionId: "s1", contextLimit: 10 });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "x".repeat(200)));
      const events = yield* session.events.pipe(
        Stream.takeUntil(HarnessEvent.Event.isAnyOf(["ContextFull"])),
        Stream.runCollect,
      );

      expect(events.map((event) => event._tag)).toEqual(["InputIncorporated", "ContextFull"]);
      expect(events.at(-1)).toMatchObject({ estimatedTokens: 50 });
      expect(prompts).toEqual([]);
    }),
  );

  it.effect("counts what its provider measured, and stops once a result would pass the limit", () =>
    Effect.gen(function* () {
      const { model, prompts } = yield* scripted([
        parts(call("c1", "lookup", { query: "tides" }), finish("tool-calls")),
      ]);
      const tools: HarnessTool.Tools = {
        definitions: [{ name: "lookup", parameters }],
        invoke: () => Effect.succeed(answer("y".repeat(400))),
      };
      // The first request fits; its provider measured 24 tokens, and the result adds about 100.
      const session = yield* start(model, { sessionId: "s1", tools, contextLimit: 60 });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "When is high tide?"));
      const events = yield* session.events.pipe(
        Stream.takeUntil(HarnessEvent.Event.isAnyOf(["ContextFull"])),
        Stream.runCollect,
      );

      expect(prompts).toHaveLength(1);
      expect(events.slice(-2).map((event) => event._tag)).toEqual([
        "ToolCallCompleted",
        "ContextFull",
      ]);
      expect(events.at(-1)).toMatchObject({ estimatedTokens: 124 });
    }),
  );

  it.effect("marks where a provider may cache, and sends a long tool result clipped", () =>
    Effect.gen(function* () {
      const { model, prompts } = yield* scripted([
        parts(call("c1", "lookup", { query: "tides" }), finish("tool-calls")),
        parts(...text("t1", "Noon."), finish("stop")),
      ]);
      const tools: HarnessTool.Tools = {
        definitions: [{ name: "lookup", parameters }],
        invoke: () => Effect.succeed(answer("z".repeat(60_000))),
      };
      const session = yield* start(model, { sessionId: "s1", instructions: "Be brief.", tools });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "When is high tide?"));
      yield* untilIdle(session);

      const cache = { anthropic: { cacheControl: { type: "ephemeral" } } };
      const sent = encoded(prompts[1]!).content;
      expect(sent[0]).toMatchObject({ role: "system", options: cache });
      expect(sent.at(-1)).toMatchObject({ role: "tool", options: cache });
      // Only the newest message carries the mark, so earlier ones stay as they were sent.
      expect(sent[1]?.options).toEqual({});
      const result = (sent.at(-1)!.content[0] as { readonly result: unknown }).result;
      expect(String(result).length).toBeLessThan(25_000);
      expect(String(result)).toContain("characters left out");
    }),
  );

  it.effect("keeps reasoning a provider ends and goes on with as one block", () =>
    Effect.gen(function* () {
      // As a provider that sends empty text between pieces of reasoning streams it.
      const { model } = yield* scripted([
        parts(
          { type: "reasoning-start", id: "r" },
          { type: "reasoning-delta", id: "r", delta: "Seventeen " },
          { type: "reasoning-end", id: "r" },
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "" },
          { type: "reasoning-start", id: "r" },
          { type: "reasoning-delta", id: "r", delta: "times 23." },
          { type: "reasoning-end", id: "r" },
          { type: "text-delta", id: "t", delta: "391" },
          { type: "text-end", id: "t" },
          finish("stop"),
        ),
      ]);
      const session = yield* start(model, { sessionId: "s1" });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "What is 17 times 23?"));
      const events = yield* untilIdle(session);

      expect(
        events.flatMap((event) =>
          HarnessEvent.Event.isAnyOf(["BlockCompleted"])(event) ? [event.block] : [],
        ),
      ).toEqual([
        { _tag: "Reasoning", text: "Seventeen times 23." },
        { _tag: "Text", text: "391" },
      ]);
    }),
  );

  it.effect("continues from stored events exactly where a failed session stopped", () =>
    Effect.gen(function* () {
      const signature = { anthropic: { info: { type: "thinking", signature: "sig-1" } } };
      const first = yield* scripted([
        parts(
          { type: "reasoning-start", id: "r1" },
          { type: "reasoning-delta", id: "r1", delta: "The user wants tides." },
          { type: "reasoning-end", id: "r1", metadata: signature },
          call("c1", "lookup", { query: "tides" }),
          finish("tool-calls"),
        ),
        Stream.concat(
          parts(
            { type: "reasoning-start", id: "r2" },
            { type: "reasoning-delta", id: "r2", delta: "Unfinished reasoning." },
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Hi" },
          ),
          Stream.fail(
            AiError.make({
              module: "Test",
              method: "streamText",
              reason: new AiError.RateLimitError({}),
            }),
          ),
        ),
      ]);
      const invocations = yield* Ref.make(0);
      const tools: HarnessTool.Tools = {
        definitions: [{ name: "lookup", parameters }],
        invoke: () => Ref.update(invocations, (count) => count + 1).pipe(Effect.as(answer("noon"))),
      };
      const failing = yield* start(first.model, { sessionId: "s1", instructions: "Help.", tools });
      yield* failing.prepare([]);
      yield* failing.submit(batch("b1", "When is high tide?"));
      const recorded: Array<HarnessEvent.Event> = [];
      const failure = yield* failing.events.pipe(
        Stream.runForEach((event) => Effect.sync(() => recorded.push(event))),
        Effect.flip,
      );
      expect(failure).toBeInstanceOf(HarnessErrors.ExecutionFailed);
      expect(failure).toMatchObject({ retryable: true });
      // Partial text is reported; unfinished reasoning without a signature is omitted.
      expect(recorded.slice(-2)).toMatchObject([
        { _tag: "TextDelta", responseId: "s1/2" },
        { _tag: "BlockCompleted", responseId: "s1/2", part: 1, block: { text: "Hi" } },
      ]);

      // Execution going on asks for a fresh response; the work ending keeps what was written.
      const transcript = HarnessEvent.transcript(stored(recorded));
      expect(transcript.map((item) => item._tag)).toEqual(["Input", "Response", "ToolResult"]);
      expect(
        HarnessEvent.transcript(stored(recorded), [], { unfinished: "keep" }).at(-1),
      ).toMatchObject({ _tag: "Response", id: "s1/2", parts: [{ _tag: "Text", text: "Hi" }] });

      const second = yield* scripted([parts(...text("t1", "Noon."), finish("stop"))]);
      const continuing = yield* start(second.model, {
        sessionId: "s2",
        instructions: "Help.",
        tools,
      });
      yield* continuing.prepare(transcript);
      yield* continuing.resume;
      const events = yield* untilIdle(continuing);

      expect(encoded(second.prompts[0]!)).toEqual(encoded(first.prompts[1]!));
      expect(encoded(second.prompts[0]!).content[2]).toMatchObject({
        role: "assistant",
        content: [
          { type: "reasoning", options: signature },
          { type: "tool-call", id: "c1" },
        ],
      });
      expect(events.map((event) => event._tag)).toEqual([
        "TextDelta",
        "BlockCompleted",
        "ResponseFinished",
        "Idle",
      ]);
      expect(events[2]).toMatchObject({ responseId: "s2/1" });
      expect(yield* Ref.get(invocations)).toBe(1);
    }),
  );

  it.effect("carries a pending call to another session, which continues from its result", () =>
    Effect.gen(function* () {
      const first = yield* scripted([
        parts(call("c1", "switch_environment", { to: "sandbox" }), finish("tool-calls")),
      ]);
      const started = yield* Deferred.make<void>();
      const recorded = yield* Effect.scoped(
        Effect.gen(function* () {
          const source = yield* start(first.model, {
            sessionId: "s1",
            tools: {
              definitions: [{ name: "switch_environment", parameters }],
              invoke: () => Deferred.succeed(started, undefined).pipe(Effect.andThen(Effect.never)),
            },
          });
          yield* source.prepare([]);
          yield* source.submit(batch("b1", "Move to the sandbox and build."));
          const events = yield* source.events.pipe(
            Stream.takeUntil(HarnessEvent.Event.isAnyOf(["ResponseFinished"])),
            Stream.runCollect,
          );
          yield* Deferred.await(started);
          return events;
        }),
      );

      const transcript = HarnessEvent.transcript(stored(recorded));
      expect(Transcript.summarize(transcript)).toMatchObject({
        success: { pending: [{ id: "c1", name: "switch_environment" }], awaitsResponse: false },
      });

      const second = yield* scripted([parts(...text("t1", "Building now."), finish("stop"))]);
      const destination = yield* start(second.model, { sessionId: "s2" });
      yield* destination.prepare(transcript);
      expect(
        yield* destination.resolve(Transcript.ToolCallId.make("c9"), answer("?")).pipe(Effect.flip),
      ).toEqual(new HarnessErrors.NotPending({ callId: Transcript.ToolCallId.make("c9") }));
      yield* destination.resolve(Transcript.ToolCallId.make("c1"), answer("Now in the sandbox."));
      const events = yield* untilIdle(destination);

      expect(events.map((event) => event._tag)).toEqual([
        "ToolCallCompleted",
        "TextDelta",
        "BlockCompleted",
        "ResponseFinished",
        "Idle",
      ]);
      expect(encoded(second.prompts[0]!).content.at(-1)).toMatchObject({
        role: "tool",
        content: [{ type: "tool-result", id: "c1", result: "Now in the sandbox." }],
      });
      expect(
        yield* destination
          .resolve(Transcript.ToolCallId.make("c1"), answer("again"))
          .pipe(Effect.flip),
      ).toBeInstanceOf(HarnessErrors.NotPending);
    }),
  );

  it.effect("takes in input submitted while a tool runs after its result, in one request", () =>
    Effect.gen(function* () {
      const { model, prompts } = yield* scripted([
        parts(call("c1", "wait", {}), finish("tool-calls")),
        parts(...text("t1", "Both done."), finish("stop")),
      ]);
      const started = yield* Deferred.make<void>();
      const release = yield* Deferred.make<void>();
      const session = yield* start(model, {
        sessionId: "s1",
        tools: {
          definitions: [{ name: "wait", parameters: { type: "object" } }],
          invoke: () =>
            Deferred.succeed(started, undefined).pipe(
              Effect.andThen(Deferred.await(release)),
              Effect.as(answer("waited")),
            ),
        },
      });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "Wait, then report."));
      const collecting = yield* Effect.forkChild(untilIdle(session));
      yield* Deferred.await(started);
      expect(
        yield* session.resolve(Transcript.ToolCallId.make("c1"), answer("mine")).pipe(Effect.flip),
      ).toBeInstanceOf(HarnessErrors.NotPending);
      yield* session.submit(batch("b2", "Also mention the weather."));
      yield* Deferred.succeed(release, undefined);
      const events = yield* Fiber.join(collecting);

      expect(HarnessEvent.transcript(events)).toMatchObject([
        { _tag: "Input", content: [{ text: "Wait, then report." }] },
        { _tag: "Response", parts: [{ _tag: "ToolCall", id: "c1" }] },
        { _tag: "ToolResult", callId: "c1" },
        { _tag: "Input", content: [{ text: "Also mention the weather." }] },
        { _tag: "Response", parts: [{ _tag: "Text", text: "Both done." }] },
      ]);
      expect(prompts).toHaveLength(2);
      expect(events.filter(HarnessEvent.Event.isAnyOf(["Idle"]))).toHaveLength(1);
    }),
  );

  it.effect("stops, recording nothing of the response, when it calls a tool not offered", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([parts(call("c1", "missing", {}), finish("tool-calls"))]);
      const session = yield* start(model, { sessionId: "s1" });
      yield* session.prepare([]);
      yield* session.submit(batch("b1", "Hi"));
      const recorded: Array<HarnessEvent.Event> = [];
      const failure = yield* session.events.pipe(
        Stream.runForEach((event) => Effect.sync(() => recorded.push(event))),
        Effect.flip,
      );

      expect(failure).toMatchObject({ _tag: "Harness.ExecutionFailed", retryable: true });
      expect(failure.reason).toMatch(/Invalid output/);
      expect(recorded.map((event) => event._tag)).toEqual(["InputIncorporated"]);
      expect(yield* session.submit(batch("b2", "Again")).pipe(Effect.flip)).toBe(failure);
    }),
  );

  it.effect("prepares history once, before any work", () =>
    Effect.gen(function* () {
      const { model } = yield* scripted([]);
      const session = yield* start(model, { sessionId: "s1" });
      expect(yield* session.submit(batch("b1", "Hi")).pipe(Effect.flip)).toBeInstanceOf(
        HarnessErrors.NotPrepared,
      );
      expect(yield* session.resume.pipe(Effect.flip)).toBeInstanceOf(HarnessErrors.NotPrepared);
      const invalid = yield* session
        .prepare([
          input("Hi"),
          Transcript.toolResult(
            { id: Transcript.ToolCallId.make("c1"), name: "lookup" },
            answer("?"),
          ),
        ])
        .pipe(Effect.flip);
      expect(invalid).toBeInstanceOf(HarnessErrors.InvalidTranscript);
      yield* session.prepare([
        input("Hi"),
        { _tag: "Response", id: Transcript.ResponseId.make("h1"), parts: [] },
      ]);
      expect(yield* session.prepare([]).pipe(Effect.flip)).toBeInstanceOf(
        HarnessErrors.AlreadyPrepared,
      );
      yield* session.resume;
      expect(yield* untilIdle(session)).toEqual([{ _tag: "Idle" }]);
    }),
  );
});
