import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { Environment } from "@amends/core/environment";
import { Turn, TurnErrors, TurnExecution, TurnLog } from "@amends/core/turn";
import { Workspace } from "@amends/core/workspace";
import { TurnRunner } from "@amends/execution";
import { Gateway } from "@amends/gateway";
import type { HarnessEvent, Transcript } from "@amends/harness";
import { AmendsHarness } from "@amends/harness-amends";
import { describe, expect, it } from "@effect/vitest";
import { Crypto, DateTime, Deferred, Effect, Fiber, Layer, Schema, Stream } from "effect";
import { TestClock } from "effect/testing";
import { AiError, LanguageModel, Model } from "effect/unstable/ai";
import type { Prompt, Response } from "effect/unstable/ai";

type Script = Stream.Stream<Response.StreamPartEncoded, AiError.AiError>;

const workspaceId = Workspace.Id.make("workspace-one");
const turnId = Turn.Id.make("turn-one");
const createdAt = "2026-09-28T12:00:00.000Z";

const queued = Schema.decodeUnknownSync(Turn.Record)({
  id: turnId,
  workspaceId,
  groupId: "group-one",
  threadId: "thread-one",
  agentId: "agent-one",
  memberId: "member-agent",
  participationId: "participation-one",
  logAfter: null,
  historyFrom: null,
  retryOf: null,
  status: "queued",
  inputAfterSequence: 0,
  acceptedThroughSequence: 1,
  incorporatedThroughSequence: 0,
  selection: null,
  messageIds: [],
  failure: null,
  cancelReason: null,
  createdAt,
  startedAt: null,
  finishedAt: null,
});
const selection = Schema.decodeUnknownSync(Turn.Selection)({
  connectionId: "connection-one",
  model: "test-model",
  reasoning: null,
  environmentId: "environment-one",
});
const environment = (sandbox: boolean) =>
  Schema.decodeUnknownSync(Environment.Record)({
    id: "environment-one",
    workspaceId,
    name: "In process",
    harnessId: "amends",
    sandbox: sandbox
      ? {
          providerId: "local",
          harness: "in-process",
          connectionId: null,
          template: null,
          env: {},
          setup: [],
          retention: "stop",
        }
      : null,
    status: "active",
    createdBy: null,
    createdAt,
  });

const at = DateTime.makeUnsafe(createdAt);
const input = (text: string): Transcript.Input => ({
  _tag: "Input",
  author: { id: "member-alice", name: "Alice" },
  content: [{ _tag: "Text", text }],
});

/**
 * Turn execution over one turn in memory, as core records it: the thread's messages by position,
 * notifications its agent has yet to accept, and every step execution takes, in order.
 */
const fakeExecution = (options: { readonly sandbox?: boolean } = {}) => {
  const state = {
    turn: queued,
    log: [] as Array<TurnLog.Recorded>,
    messages: [{ sequence: 1, text: "What is the tide at noon?" }],
    unaccepted: false,
    steps: [] as Array<string>,
    drafts: [] as Array<{ responseId: string; part: number; offset: number; text: string }>,
    replies: [] as Array<string>,
    /** A checkpoint the next plan asks for, until one is recorded. */
    compaction: undefined as TurnLog.Compaction | undefined,
    checkpoints: [] as Array<{ summary: string | null; kept: ReadonlyArray<Transcript.Item> }>,
  };
  const change = (changes: Partial<Turn.Record>) => {
    state.turn = Turn.change(state.turn, changes);
  };
  const require = (statuses: ReadonlyArray<Turn.Status>) =>
    statuses.includes(state.turn.status)
      ? Effect.void
      : Effect.fail(new TurnErrors.NotActive({ turnId, status: state.turn.status }));
  const plan = (): TurnExecution.Plan => {
    const [first, ...rest] = state.messages
      .filter(
        (message) =>
          message.sequence > state.turn.incorporatedThroughSequence &&
          message.sequence <= state.turn.acceptedThroughSequence,
      )
      .map((message) => input(message.text));
    const context = TurnLog.context(state.log, turnId);
    return {
      turn: state.turn,
      instructions: "Be brief.",
      selection: state.turn.selection ?? selection,
      connection: { implementationId: "test", settings: {}, credential: undefined },
      environment: environment(options.sandbox ?? false),
      history: context.history,
      transcript: context.transcript,
      pending:
        first === undefined
          ? undefined
          : { throughSequence: state.turn.acceptedThroughSequence, items: [first, ...rest] },
      log: [...state.log],
      compaction: state.compaction,
    };
  };
  const execution: TurnExecution.Interface = {
    workspaceId,
    get: () => Effect.sync(() => state.turn),
    prepare: () =>
      Effect.sync((): TurnExecution.Preparation => {
        if (!Turn.active(state.turn.status)) return { _tag: "Finished" };
        if (state.turn.status === "cancelling") return { _tag: "Stopping" };
        return { _tag: "Ready", plan: plan() };
      }),
    start: (_, chosen) =>
      Effect.gen(function* () {
        yield* require(["queued"]);
        state.steps.push("start");
        change({ status: "running", selection: chosen });
        return state.turn;
      }),
    submitted: (_, batch) =>
      Effect.sync(() => {
        state.steps.push(`submitted ${batch.batchId}`);
        if (
          !state.log.some(
            ({ entry }) => entry._tag === "Submitted" && entry.batchId === batch.batchId,
          )
        )
          state.log.push({ entry: { _tag: "Submitted", turnId, ...batch }, at });
      }),
    report: (_, events) =>
      Effect.sync(() => {
        for (const event of events) state.steps.push(`report ${event.event._tag}`);
        state.log.push(
          ...events.map((event): TurnLog.Recorded => ({
            entry:
              event._tag === "Harness"
                ? { _tag: "Harness", turnId, event: event.event }
                : { _tag: "Environment", turnId, event: event.event },
            at,
          })),
        );
        change({
          incorporatedThroughSequence: TurnLog.read(state.log).incorporatedThrough(
            state.turn.inputAfterSequence,
          ),
        });
        return state.turn;
      }),
    draft: (_, piece) =>
      Effect.sync(() => {
        state.drafts.push({ ...piece });
      }),
    interrupted: (_, stop) =>
      Effect.sync(() => {
        state.steps.push(`interrupted ${stop.retryable ? "retryable" : "final"}`);
        state.log.push({ entry: { _tag: "Interrupted", turnId, ...stop }, at });
      }),
    checkpoint: (_, recorded) =>
      Effect.sync(() => {
        state.steps.push(
          `checkpoint ${recorded.summary === null ? "without a summary" : "summarized"}`,
        );
        state.checkpoints.push({ ...recorded });
        state.log.push({ entry: { _tag: "Checkpoint", turnId, ...recorded }, at });
        state.compaction = undefined;
        return state.turn;
      }),
    entries: () => Effect.sync(() => [...state.log]),
    close: () =>
      Effect.gen(function* () {
        state.steps.push("close");
        if (state.turn.status === "cancelling") {
          change({ status: "cancelled" });
          return { _tag: "Stopped" } as const;
        }
        yield* require(["running"]);
        if (
          state.turn.incorporatedThroughSequence < state.turn.acceptedThroughSequence ||
          state.unaccepted
        )
          return { _tag: "InputPending" } as const;
        state.replies = TurnLog.read(state.log).replies.map((reply) => reply.text);
        change({ status: "completed" });
        return { _tag: "Closed", messageIds: [] } as const;
      }),
    fail: (_, reason) =>
      Effect.gen(function* () {
        yield* require(["queued", "running", "cancelling"]);
        state.steps.push(`fail: ${reason}`);
        change({ status: "failed", failure: reason });
      }),
    stopped: () =>
      Effect.gen(function* () {
        yield* require(["cancelling"]);
        state.steps.push("stopped");
        change({ status: "cancelled" });
      }),
  };
  /** Another message arrives and the agent accepts it into the turn. */
  const accept = (sequence: number, text: string) => {
    state.messages.push({ sequence, text });
    change({ acceptedThroughSequence: sequence });
  };
  return { state, execution, accept };
};

/** A model that answers each request with the next script and keeps every prompt it was sent. */
const scripted = Effect.fnUntraced(function* (
  scripts: ReadonlyArray<Script>,
  summary?: Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>,
) {
  const prompts: Array<Prompt.Prompt> = [];
  const summarized: Array<Prompt.Prompt> = [];
  const model = yield* LanguageModel.make({
    generateText: (options) =>
      summary === undefined
        ? Effect.die(new Error("Only a checkpoint asks for a summary."))
        : Effect.sync(() => summarized.push(options.prompt)).pipe(Effect.andThen(summary)),
    streamText: (options) =>
      Stream.suspend(() => {
        prompts.push(options.prompt);
        return scripts[prompts.length - 1] ?? Stream.die(new Error("No script left."));
      }),
  });
  const implementation: ModelInference.Implementation = {
    declaration: ConnectionImplementation.Declaration.make({
      id: ConnectionImplementation.Id.make("test"),
      name: "Test",
      description: "Scripted answers.",
      capabilities: { modelInference: { interface: "test" } },
      settings: [],
      authentication: [{ _tag: "None" }],
    }),
    languageModel: () =>
      Layer.mergeAll(
        Layer.succeed(LanguageModel.LanguageModel, model),
        Layer.succeed(Model.ProviderName, "test"),
        Layer.succeed(Model.ModelName, "test-model"),
      ),
  };
  return { implementation, prompts, summarized };
});

const reply = (value: string): Script =>
  Stream.fromIterable<Response.StreamPartEncoded>([
    { type: "text-start", id: "t1" },
    { type: "text-delta", id: "t1", delta: value },
    { type: "text-end", id: "t1" },
    {
      type: "finish",
      reason: "stop",
      usage: { inputTokens: { total: 20 }, outputTokens: { total: 4 } },
    },
  ]);
const failure = (reason: AiError.AiErrorReason): Script =>
  Stream.fail(AiError.make({ module: "Test", method: "streamText", reason }));
/** A script that signals when it is requested and then never answers. */
const hanging = (requested: Deferred.Deferred<void>): Script =>
  Stream.fromEffect(Deferred.succeed(requested, undefined)).pipe(
    Stream.drain,
    Stream.concat(Stream.never),
  );

/**
 * Advance the clock a second at a time until the fiber finishes, for runs that wait: however far
 * a run got before it waited, it waits again once the clock passes.
 */
const settle = <A, E>(fiber: Fiber.Fiber<A, E>) =>
  Effect.gen(function* () {
    for (let second = 0; second < 30 && fiber.pollUnsafe() === undefined; second += 1)
      yield* TestClock.adjust("1 second");
    return yield* Fiber.join(fiber);
  });

const unexpected = () => Effect.die(new Error("Only turn execution is expected"));
const runnerOver = (
  execution: TurnExecution.Interface,
  model: ModelInference.Implementation,
  options: Partial<TurnRunner.Options> = {},
) =>
  TurnRunner.make({ harnesses: [AmendsHarness.make()], models: [model], ...options }).pipe(
    Effect.provideService(
      Gateway.Service,
      Gateway.Service.of({
        createWorkspace: unexpected,
        inWorkspace: unexpected,
        asMember: unexpected,
        asMemberScoped: unexpected,
        runBackground: unexpected,
        executeTurns: (_, program) =>
          Effect.provideService(program, TurnExecution.Service, execution),
      }),
    ),
    Effect.provideService(
      Crypto.Crypto,
      Crypto.make({
        randomBytes: (size) => globalThis.crypto.getRandomValues(new Uint8Array(size)),
        digest: () => Effect.die(new Error("Unexpected digest")),
      }),
    ),
  );

const texts = (prompt: Prompt.Prompt | undefined) =>
  (prompt?.content ?? []).map((message) =>
    typeof message.content === "string"
      ? message.content
      : message.content.map((part) => (part.type === "text" ? part.text : part.type)).join(""),
  );
const harnessEvents = (
  log: ReadonlyArray<TurnLog.Recorded>,
): ReadonlyArray<HarnessEvent.Event["_tag"]> => TurnLog.read(log).events.map((event) => event._tag);

describe("TurnRunner", () => {
  it.effect("starts a queued turn, hands the harness its input, and closes it with the reply", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const { implementation, prompts } = yield* scripted([reply("Noon is high tide.")]);
      const runner = yield* runnerOver(execution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual([
        "start",
        "submitted turn-one/through:1",
        "report Ready",
        "report InputIncorporated",
        "report BlockCompleted",
        "report ResponseFinished",
        "report Idle",
        "close",
      ]);
      expect(state.turn).toMatchObject({ status: "completed", selection });
      expect(state.replies).toEqual(["Noon is high tide."]);
      // Deltas show a block while it streams; the log keeps completed blocks and what the
      // environment reported.
      expect(harnessEvents(state.log)).toEqual([
        "InputIncorporated",
        "BlockCompleted",
        "ResponseFinished",
        "Idle",
      ]);
      expect(state.log[1]?.entry).toMatchObject({ _tag: "Environment", event: { _tag: "Ready" } });
      expect(texts(prompts[0])).toEqual(["Be brief.", "Alice: What is the tide at noon?"]);
    }),
  );

  it.effect("shows readers a response's text as it streams, then records it once complete", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const first = yield* Deferred.make<void>();
      const rest = yield* Deferred.make<void>();
      const part = (value: Response.StreamPartEncoded) => Stream.make(value);
      const { implementation } = yield* scripted([
        Stream.concat(
          Stream.fromIterable<Response.StreamPartEncoded>([
            { type: "text-start", id: "t1" },
            { type: "text-delta", id: "t1", delta: "Noon " },
          ]),
          Stream.fromEffect(Deferred.await(first)).pipe(
            Stream.flatMap(() => part({ type: "text-delta", id: "t1", delta: "is high tide." })),
            Stream.concat(
              Stream.fromEffect(Deferred.await(rest)).pipe(
                Stream.flatMap(() =>
                  Stream.fromIterable<Response.StreamPartEncoded>([
                    { type: "text-end", id: "t1" },
                    {
                      type: "finish",
                      reason: "stop",
                      usage: { inputTokens: { total: 20 }, outputTokens: { total: 4 } },
                    },
                  ]),
                ),
              ),
            ),
          ),
        ),
      ]);
      const runner = yield* runnerOver(execution, implementation);

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      while (state.drafts.length === 0) yield* Effect.yieldNow;
      expect(state.drafts).toEqual([
        { responseId: expect.any(String), part: 0, offset: 0, text: "Noon " },
      ]);
      // More text within the draft interval waits; after it, the next draft continues the part.
      yield* TestClock.adjust("200 millis");
      yield* Deferred.succeed(first, undefined);
      while (state.drafts.length === 1) yield* Effect.yieldNow;
      expect(state.drafts[1]).toMatchObject({ part: 0, offset: 5, text: "is high tide." });
      yield* Deferred.succeed(rest, undefined);
      yield* Fiber.join(fiber);

      expect(state.replies).toEqual(["Noon is high tide."]);
      expect(harnessEvents(state.log)).not.toContain("TextDelta");
    }),
  );

  it.effect("takes in input accepted while it worked, and owes both answers when closing", () =>
    Effect.gen(function* () {
      const { state, execution, accept } = fakeExecution();
      const { implementation, prompts } = yield* scripted([
        Stream.fromEffect(Effect.sync(() => accept(3, "And at midnight?"))).pipe(
          Stream.drain,
          Stream.concat(reply("Noon.")),
        ),
        reply("Noon, and again just after midnight."),
      ]);
      const runner = yield* runnerOver(execution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual([
        "start",
        "submitted turn-one/through:1",
        "report Ready",
        "report InputIncorporated",
        "report BlockCompleted",
        "report ResponseFinished",
        "report Idle",
        "close",
        "submitted turn-one/through:3",
        "report InputIncorporated",
        "report BlockCompleted",
        "report ResponseFinished",
        "report Idle",
        "close",
      ]);
      // The first answer came before the second question was taken in, so it is owed too.
      expect(state.replies).toEqual(["Noon.", "Noon, and again just after midnight."]);
      expect(texts(prompts[1])).toEqual([
        "Be brief.",
        "Alice: What is the tide at noon?",
        "Noon.",
        "Alice: And at midnight?",
      ]);
    }),
  );

  it.effect("waits while its agent accepts more work, then takes it in", () =>
    Effect.gen(function* () {
      const { state, execution, accept } = fakeExecution();
      state.unaccepted = true;
      const { implementation } = yield* scripted([reply("Noon."), reply("Midnight too.")]);
      const runner = yield* runnerOver(execution, implementation);

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      while (!state.steps.includes("close")) yield* Effect.yieldNow;
      yield* TestClock.adjust("3 seconds");
      expect(state.turn.status).toBe("running");
      accept(2, "And midnight?");
      state.unaccepted = false;
      yield* settle(fiber);

      expect(state.steps.slice(-6)).toEqual([
        "submitted turn-one/through:2",
        "report InputIncorporated",
        "report BlockCompleted",
        "report ResponseFinished",
        "report Idle",
        "close",
      ]);
      expect(state.replies).toEqual(["Noon.", "Midnight too."]);
    }),
  );

  it.effect("stops a running turn once asked to", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const requested = yield* Deferred.make<void>();
      const { implementation } = yield* scripted([hanging(requested)]);
      const runner = yield* runnerOver(execution, implementation);

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      yield* Deferred.await(requested);
      state.turn = Turn.change(state.turn, { status: "cancelling", cancelReason: "requested" });
      yield* settle(fiber);

      expect(state.steps).toEqual([
        "start",
        "submitted turn-one/through:1",
        "report Ready",
        "report InputIncorporated",
        "stopped",
      ]);
      expect(state.turn.status).toBe("cancelled");
    }),
  );

  it.effect("runs again after a failure worth retrying, continuing from its log", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const { implementation, prompts } = yield* scripted([
        failure(new AiError.RateLimitError({})),
        reply("Noon."),
      ]);
      const runner = yield* runnerOver(execution, implementation);

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      yield* settle(fiber);

      expect(state.steps).toEqual([
        "start",
        "submitted turn-one/through:1",
        "report Ready",
        "report InputIncorporated",
        "interrupted retryable",
        "report Ready",
        "report BlockCompleted",
        "report ResponseFinished",
        "report Idle",
        "close",
      ]);
      // The second session continues the conversation rather than submitting the input again.
      expect(texts(prompts[1])).toEqual(texts(prompts[0]));
      expect(state.replies).toEqual(["Noon."]);
    }),
  );

  it.effect("interrupts a run whose model goes silent, and fails once retries run out", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const first = yield* Deferred.make<void>();
      const second = yield* Deferred.make<void>();
      const { implementation, prompts } = yield* scripted([hanging(first), hanging(second)]);
      const runner = yield* runnerOver(execution, implementation, {
        idleTimeout: "1 minute",
        retries: 1,
      });

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      yield* Deferred.await(first);
      // Silence shorter than the timeout is waiting, not a failure.
      yield* TestClock.adjust("50 seconds");
      expect(state.steps).not.toContain("interrupted retryable");
      for (let step = 0; step < 30 && fiber.pollUnsafe() === undefined; step += 1)
        yield* TestClock.adjust("10 seconds");
      yield* Fiber.join(fiber);

      expect(prompts).toHaveLength(2);
      expect(state.steps.filter((step) => step.startsWith("interrupted"))).toEqual([
        "interrupted retryable",
        "interrupted retryable",
      ]);
      expect(state.steps.at(-1)).toBe("fail: The model sent nothing for 1 minute.");
      expect(state.turn.status).toBe("failed");
    }),
  );

  it.effect("records a checkpoint with a summary before working when the history is too long", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const older = [input("How was the launch?")];
      const kept = [input("Anything else?")];
      state.compaction = { summarize: older, kept };
      const { implementation, prompts, summarized } = yield* scripted(
        [reply("Noon is high tide.")],
        Effect.succeed([
          { type: "text", text: "The launch went well." },
          {
            type: "finish",
            reason: "stop",
            usage: { inputTokens: { total: 20 }, outputTokens: { total: 4 } },
          },
        ]),
      );
      const runner = yield* runnerOver(execution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps.slice(0, 3)).toEqual([
        "start",
        "checkpoint summarized",
        "submitted turn-one/through:1",
      ]);
      expect(state.checkpoints).toEqual([{ summary: "The launch went well.", kept }]);
      expect(texts(summarized[0]).at(-1)).toContain("Alice: How was the launch?");
      // The turn continues from the summary and the newest exchanges, then its input.
      expect(texts(prompts[0])).toEqual([
        "Be brief.",
        "Summary of the earlier conversation: The launch went well.",
        "Alice: Anything else?",
        "Alice: What is the tide at noon?",
      ]);
      expect(state.replies).toEqual(["Noon is high tide."]);
    }),
  );

  it.effect("keeps only the newest exchanges when the summary cannot be written", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      state.compaction = { summarize: [input("How was the launch?")], kept: [] };
      const { implementation } = yield* scripted(
        [reply("Noon is high tide.")],
        Effect.fail(
          AiError.make({
            module: "Test",
            method: "generateText",
            reason: new AiError.RateLimitError({}),
          }),
        ),
      );
      const runner = yield* runnerOver(execution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps[1]).toBe("checkpoint without a summary");
      expect(state.turn.status).toBe("completed");
    }),
  );

  it.effect("fails a turn after a failure not worth retrying", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const { implementation } = yield* scripted([failure(new AiError.QuotaExhaustedError({}))]);
      const runner = yield* runnerOver(execution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps.slice(-2)).toEqual([
        "interrupted final",
        expect.stringMatching(/^fail: /u),
      ]);
      expect(state.turn.status).toBe("failed");
    }),
  );

  it.effect("fails a turn whose environment has a sandbox, without starting it", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution({ sandbox: true });
      const { implementation, prompts } = yield* scripted([]);
      const runner = yield* runnerOver(execution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual(["fail: Environments with a sandbox can't run turns yet."]);
      expect(prompts).toEqual([]);
    }),
  );

  it.effect("leaves a finished turn as it is, and confirms a stop asked for before it ran", () =>
    Effect.gen(function* () {
      const { state, execution } = fakeExecution();
      const { implementation } = yield* scripted([]);
      const runner = yield* runnerOver(execution, implementation);
      state.turn = Turn.change(state.turn, { status: "running" });
      state.turn = Turn.change(state.turn, { status: "cancelling", cancelReason: "requested" });

      yield* runner.run(workspaceId, turnId);
      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual(["stopped"]);
    }),
  );
});
