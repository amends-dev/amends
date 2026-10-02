import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { Environment } from "@amends/core/environment";
import { Log } from "@amends/core/journal";
import { Turn, TurnErrors, TurnExecution, TurnLog } from "@amends/core/turn";
import { Workspace } from "@amends/core/workspace";
import { TurnRunner } from "@amends/cluster";
import { Gateway } from "@amends/gateway";
import type { Harness, HarnessEvent, Transcript } from "@amends/harness";
import { AmendsHarness } from "@amends/harness-amends";
import { describe, expect, it } from "@effect/vitest";
import { Crypto, DateTime, Deferred, Effect, Fiber, Layer, Queue, Schema, Stream } from "effect";
import type { Cause } from "effect";
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
 * notifications its agent has yet to accept, the agent's instructions, the turn's own log, and every
 * step execution takes, in order.
 */
const fakeExecution = (options: { readonly sandbox?: boolean } = {}) => {
  const state = {
    turn: queued,
    log: [] as Array<TurnLog.Recorded>,
    messages: [{ sequence: 1, text: "What is the tide at noon?" }],
    unaccepted: false,
    instructions: "Be brief.",
    steps: [] as Array<string>,
    drafts: [] as Array<{ responseId: string; part: number; offset: number; text: string }>,
    replies: [] as Array<string>,
    checkpoints: [] as Array<{
      summary: string;
      kept: ReadonlyArray<Transcript.Item>;
      through: number | null;
    }>,
  };
  const change = (changes: Partial<Turn.Record>) => {
    state.turn = Turn.change(state.turn, changes);
  };
  /** Record an entry of the turn's own, at the log's next position. */
  const record = (entry: TurnLog.Entry) => {
    state.log.push({ entry, at, position: Log.Position.make(state.log.length) });
  };
  const incorporated = () =>
    TurnLog.read(state.log).incorporatedThrough(state.turn.inputAfterSequence);
  const require = (statuses: ReadonlyArray<Turn.Status>) =>
    statuses.includes(state.turn.status)
      ? Effect.void
      : Effect.fail(new TurnErrors.NotActive({ turnId, status: state.turn.status }));
  const plan = (): TurnExecution.Plan => {
    const after = incorporated();
    const waiting = state.messages
      .filter(
        (message) =>
          message.sequence > after && message.sequence <= state.turn.acceptedThroughSequence,
      )
      .map((message): TurnLog.Waiting => ({
        sequence: message.sequence,
        item: input(message.text),
      }));
    const [first, ...rest] = waiting.map(({ item }) => item);
    const context = TurnLog.buildContext(state.log, turnId);
    return {
      turn: state.turn,
      instructions: context.own.started?.instructions ?? state.instructions,
      selection: state.turn.selection ?? selection,
      connection: {
        name: "Test models",
        implementationId: "test",
        settings: {},
        credential: undefined,
      },
      environment: environment(options.sandbox ?? false),
      history: context.history,
      transcript: context.transcript,
      pending:
        first === undefined
          ? undefined
          : {
              afterSequence: after,
              throughSequence: state.turn.acceptedThroughSequence,
              items: [first, ...rest],
            },
      log: [...state.log],
      attempts: context.own.attempts,
      interruption: context.own.interruption,
      diedLast: context.own.diedLast,
      waiting,
      fixed: 0,
      measured: context.measured,
      overflow: context.own.overflow,
    };
  };
  const turnExecution: TurnExecution.Interface = {
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
        record({ _tag: "Started", turnId, selection: chosen, instructions: state.instructions });
        change({ status: "running", selection: chosen });
        return state.turn;
      }),
    recordAttempt: (_, kind) =>
      Effect.gen(function* () {
        yield* require(["running", "cancelling"]);
        state.steps.push(`attempt ${kind}`);
        record({ _tag: "Attempt", turnId, kind });
      }),
    recordSubmission: (_, batch) =>
      Effect.sync(() => {
        state.steps.push(`submitted ${batch.batchId}`);
        const found = state.log.find(
          ({ entry }) => entry._tag === "Submitted" && entry.batchId === batch.batchId,
        )?.entry;
        if (found?._tag === "Submitted") return found.items;
        record({ _tag: "Submitted", turnId, ...batch });
        return batch.items;
      }),
    recordEvents: (_, events) =>
      Effect.sync(() => {
        for (const event of events) {
          state.steps.push(`report ${event.event._tag}`);
          record(
            event._tag === "Harness"
              ? { _tag: "Harness", turnId, event: event.event }
              : { _tag: "Environment", turnId, event: event.event },
          );
        }
      }),
    showDraft: (_, piece) =>
      Effect.sync(() => {
        state.drafts.push({ ...piece });
      }),
    recordInterruption: (_, stop) =>
      Effect.sync(() => {
        state.steps.push(`interrupted ${stop.retryable ? "retryable" : "final"}`);
        record({ _tag: "Interrupted", turnId, ...stop });
      }),
    recordCheckpoint: (_, recorded) =>
      Effect.sync(() => {
        state.steps.push("checkpoint");
        state.checkpoints.push({ ...recorded });
        record({ _tag: "Checkpoint", turnId, ...recorded });
        return Log.Position.make(state.log.length - 1);
      }),
    readEntries: () => Effect.sync(() => [...state.log]),
    close: () =>
      Effect.gen(function* () {
        state.steps.push("close");
        if (state.turn.status === "cancelling") {
          change({ status: "cancelled" });
          return { _tag: "Stopped" } as const;
        }
        yield* require(["running"]);
        if (incorporated() < state.turn.acceptedThroughSequence || state.unaccepted)
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
    confirmStopped: () =>
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
  return { state, turnExecution, accept, record };
};

/** A model that answers each request with the next script and keeps every prompt it was sent. */
const scripted = Effect.fnUntraced(function* (
  scripts: ReadonlyArray<Script>,
  summary?:
    | Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>
    | ((prompt: Prompt.Prompt) => Effect.Effect<Array<Response.PartEncoded>, AiError.AiError>),
  limits: ModelInference.Limits = { contextTokens: 1_000_000, outputTokens: 128_000 },
) {
  const prompts: Array<Prompt.Prompt> = [];
  const summarized: Array<Prompt.Prompt> = [];
  const model = yield* LanguageModel.make({
    generateText: (options) =>
      summary === undefined
        ? Effect.die(new Error("Only a checkpoint asks for a summary."))
        : Effect.sync(() => summarized.push(options.prompt)).pipe(
            Effect.andThen(typeof summary === "function" ? summary(options.prompt) : summary),
          ),
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
    limits: () => limits,
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
  turnExecution: TurnExecution.Interface,
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
        runBackgroundProcess: unexpected,
        executeTurns: (_, program) =>
          Effect.provideService(program, TurnExecution.Service, turnExecution),
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
      const { state, turnExecution } = fakeExecution();
      const { implementation, prompts } = yield* scripted([reply("Noon is high tide.")]);
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual([
        "start",
        "attempt session",
        "submitted turn-one/after:0/through:1",
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
      expect(state.log.find(({ entry }) => entry._tag === "Environment")?.entry).toMatchObject({
        event: { _tag: "Ready" },
      });
      expect(texts(prompts[0])).toEqual(["Be brief.", "Alice: What is the tide at noon?"]);
    }),
  );

  it.effect("shows readers a response's text as it streams, then records it once complete", () =>
    Effect.gen(function* () {
      const { state, turnExecution } = fakeExecution();
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
      const runner = yield* runnerOver(turnExecution, implementation);

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
      const { state, turnExecution, accept } = fakeExecution();
      const { implementation, prompts } = yield* scripted([
        Stream.fromEffect(Effect.sync(() => accept(3, "And at midnight?"))).pipe(
          Stream.drain,
          Stream.concat(reply("Noon.")),
        ),
        reply("Noon, and again just after midnight."),
      ]);
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual([
        "start",
        "attempt session",
        "submitted turn-one/after:0/through:1",
        "report Ready",
        "report InputIncorporated",
        "report BlockCompleted",
        "report ResponseFinished",
        "report Idle",
        "close",
        "submitted turn-one/after:1/through:3",
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
      const { state, turnExecution, accept } = fakeExecution();
      state.unaccepted = true;
      const { implementation } = yield* scripted([reply("Noon."), reply("Midnight too.")]);
      const runner = yield* runnerOver(turnExecution, implementation);

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      while (!state.steps.includes("close")) yield* Effect.yieldNow;
      yield* TestClock.adjust("3 seconds");
      expect(state.turn.status).toBe("running");
      accept(2, "And midnight?");
      state.unaccepted = false;
      yield* settle(fiber);

      expect(state.steps.slice(-6)).toEqual([
        "submitted turn-one/after:1/through:2",
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
      const { state, turnExecution } = fakeExecution();
      const requested = yield* Deferred.make<void>();
      const { implementation } = yield* scripted([hanging(requested)]);
      const runner = yield* runnerOver(turnExecution, implementation);

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      yield* Deferred.await(requested);
      state.turn = Turn.change(state.turn, { status: "cancelling", cancelReason: "requested" });
      yield* settle(fiber);

      expect(state.steps).toEqual([
        "start",
        "attempt session",
        "submitted turn-one/after:0/through:1",
        "report Ready",
        "report InputIncorporated",
        "stopped",
      ]);
      expect(state.turn.status).toBe("cancelled");
    }),
  );

  it.effect("runs again after a failure worth retrying, continuing from its log", () =>
    Effect.gen(function* () {
      const { state, turnExecution } = fakeExecution();
      const { implementation, prompts } = yield* scripted([
        failure(new AiError.RateLimitError({})),
        reply("Noon."),
      ]);
      const runner = yield* runnerOver(turnExecution, implementation);

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      yield* settle(fiber);

      expect(state.steps).toEqual([
        "start",
        "attempt session",
        "submitted turn-one/after:0/through:1",
        "report Ready",
        "report InputIncorporated",
        "interrupted retryable",
        "attempt session",
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
      const { state, turnExecution } = fakeExecution();
      const first = yield* Deferred.make<void>();
      const second = yield* Deferred.make<void>();
      const { implementation, prompts } = yield* scripted([hanging(first), hanging(second)]);
      const runner = yield* runnerOver(turnExecution, implementation, {
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
      expect(state.steps.at(-1)).toBe("fail: test-model sent nothing for 1 minute.");
      expect(state.turn.status).toBe("failed");
    }),
  );

  it.effect("gives up a turn whose attempts, as its log counts them, keep getting nowhere", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      const { implementation, prompts } = yield* scripted([]);
      const runner = yield* runnerOver(turnExecution, implementation, { retries: 2 });
      // Earlier runs died, as when their process did: the log still counts them.
      state.turn = Turn.change(state.turn, { status: "running", selection });
      record({ _tag: "Started", turnId, selection, instructions: "Be brief." });
      for (let attempt = 0; attempt < 3; attempt += 1)
        record({ _tag: "Attempt", turnId, kind: "session" });

      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual(["fail: The turn kept stopping before it got anywhere."]);
      expect(prompts).toEqual([]);
    }),
  );

  it.effect("waits before running again after an attempt that died, then carries on", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      const { implementation } = yield* scripted([reply("Noon.")]);
      const runner = yield* runnerOver(turnExecution, implementation);
      state.turn = Turn.change(state.turn, { status: "running", selection });
      record({ _tag: "Started", turnId, selection, instructions: "Be brief." });
      record({ _tag: "Attempt", turnId, kind: "session" });

      const fiber = yield* Effect.forkChild(runner.run(workspaceId, turnId));
      yield* TestClock.adjust("1 second");
      expect(state.steps).toEqual([]);
      yield* settle(fiber);

      expect(state.steps[0]).toBe("attempt session");
      expect(state.replies).toEqual(["Noon."]);
    }),
  );

  it.effect("keeps the instructions its agent had when the turn started", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      const { implementation, prompts } = yield* scripted([reply("Midi.")]);
      const runner = yield* runnerOver(turnExecution, implementation);
      state.turn = Turn.change(state.turn, { status: "running", selection });
      record({ _tag: "Started", turnId, selection, instructions: "Answer in French." });
      state.instructions = "Be brief.";

      yield* runner.run(workspaceId, turnId);

      expect(texts(prompts[0])[0]).toBe("Answer in French.");
    }),
  );

  it.effect("records a checkpoint with a summary before working when the history is too long", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      // The history outgrows what the model's window allows before the turn's input.
      const older = [input(`How was the launch? ${"We shipped it. ".repeat(300)}`)];
      const kept = [input("Anything else?")];
      record({ _tag: "History", turnId, items: [...older, ...kept] });
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
        { contextTokens: 1_000, outputTokens: undefined },
      );
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps.slice(0, 5)).toEqual([
        "start",
        "attempt summary",
        "checkpoint",
        "attempt session",
        "submitted turn-one/after:0/through:1",
      ]);
      expect(state.checkpoints).toEqual([
        { summary: "The launch went well.", kept, through: null },
      ]);
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

  it.effect("summarizes a large history in passes, each reading the summary so far", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      const long = (label: string) => input(`${label} ${"detail ".repeat(20_000)}`);
      record({ _tag: "History", turnId, items: [long("First"), long("Second")] });
      const { implementation, summarized } = yield* scripted(
        [reply("Noon is high tide.")],
        Effect.succeed([
          { type: "text", text: "Running summary." },
          {
            type: "finish",
            reason: "stop",
            usage: { inputTokens: { total: 20 }, outputTokens: { total: 4 } },
          },
        ]),
        { contextTokens: 80_000, outputTokens: undefined },
      );
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(summarized).toHaveLength(2);
      expect(texts(summarized[0]).at(-1)).not.toContain("<prior-summary>");
      expect(texts(summarized[1]).at(-1)).toContain("<prior-summary>\nRunning summary.");
      expect(state.checkpoints).toEqual([{ summary: "Running summary.", kept: [], through: null }]);
    }),
  );

  it.effect("interrupts a run whose summary cannot be written, and fails the turn in the end", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      record({
        _tag: "History",
        turnId,
        items: [input(`How was the launch? ${"We shipped it. ".repeat(300)}`), input("And now?")],
      });
      const { implementation, prompts } = yield* scripted(
        [reply("Noon is high tide.")],
        Effect.fail(
          AiError.make({
            module: "Test",
            method: "generateText",
            reason: new AiError.RateLimitError({}),
          }),
        ),
        { contextTokens: 1_000, outputTokens: undefined },
      );
      const runner = yield* runnerOver(turnExecution, implementation, { retries: 1 });

      yield* settle(yield* Effect.forkChild(runner.run(workspaceId, turnId)));

      // Nothing is left out for want of a summary: the turn is retried, then fails, unanswered.
      expect(state.checkpoints).toEqual([]);
      expect(prompts).toEqual([]);
      expect(state.steps.filter((step) => step.startsWith("interrupted"))).toEqual([
        "interrupted retryable",
        "interrupted retryable",
      ]);
      expect(state.steps.at(-1)).toBe(
        "fail: The earlier conversation couldn't be summarized. Test models is limiting requests.",
      );
    }),
  );

  const summarized = (value: string) =>
    Effect.succeed<Array<Response.PartEncoded>>([
      { type: "text", text: value },
      {
        type: "finish",
        reason: "stop",
        usage: { inputTokens: { total: 20 }, outputTokens: { total: 4 } },
      },
    ]);
  const tooLong = failure(
    new AiError.InvalidRequestError({
      description: "prompt is too long: 900 tokens > 200 maximum",
    }),
  );

  /**
   * A harness whose first session reports its context full once it takes its input in, as a
   * harness honoring its context limit does; later sessions are amends's own.
   */
  const fillsUp = (): Harness.Interface<TurnRunner.ModelAccess> => {
    const inner = AmendsHarness.make();
    let sessions = 0;
    return {
      ...inner,
      start: (options) => {
        sessions += 1;
        if (sessions > 1) return inner.start(options);
        return Effect.map(
          Queue.unbounded<HarnessEvent.Event, Cause.Done>(),
          (events): Harness.Session => ({
            prepare: () => Effect.void,
            submit: (batch) =>
              Queue.offerAll(events, [
                { _tag: "InputIncorporated", batch },
                { _tag: "ContextFull", estimatedTokens: 999 },
              ]).pipe(Effect.asVoid),
            resolve: () => Effect.void,
            resume: Effect.void,
            events: Stream.fromQueue(events),
          }),
        );
      },
    };
  };

  it.effect("records a checkpoint mid-turn once its context is full, then carries on", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      record({ _tag: "History", turnId, items: [input("How was the launch?")] });
      const { implementation, prompts } = yield* scripted(
        [reply("Noon.")],
        summarized("They asked about the launch."),
      );
      const runner = yield* runnerOver(turnExecution, implementation, { harnesses: [fillsUp()] });

      yield* runner.run(workspaceId, turnId);

      expect(harnessEvents(state.log)).toContain("ContextFull");
      // The session ended for a checkpoint rather than closing, then a new one continued.
      expect(state.steps.filter((step) => step === "close")).toHaveLength(1);
      expect(state.checkpoints).toHaveLength(1);
      expect(texts(prompts[0])).toEqual([
        "Be brief.",
        "Summary of the earlier conversation: They asked about the launch.",
        "Alice: What is the tide at noon?",
      ]);
      expect(state.replies).toEqual(["Noon."]);
    }),
  );

  it.effect(
    "records a checkpoint when its provider refuses a request too long, then carries on",
    () =>
      Effect.gen(function* () {
        const { state, turnExecution, record } = fakeExecution();
        record({ _tag: "History", turnId, items: [input("How was the launch?")] });
        const { implementation, prompts } = yield* scripted(
          [tooLong, reply("Noon.")],
          summarized("They asked about the launch."),
        );
        const runner = yield* runnerOver(turnExecution, implementation);

        yield* runner.run(workspaceId, turnId);

        expect(state.steps).toContain("interrupted retryable");
        expect(state.checkpoints).toHaveLength(1);
        expect(texts(prompts[1])[1]).toBe(
          "Summary of the earlier conversation: They asked about the launch.",
        );
        expect(state.replies).toEqual(["Noon."]);
      }),
  );

  it.effect("summarizes in smaller passes when its model refuses a pass as too long", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      record({
        _tag: "History",
        turnId,
        items: [input(`How was the launch? ${"We shipped it. ".repeat(300)}`), input("And now?")],
      });
      // The summarizer reads fewer tokens than four characters make of this text.
      const {
        implementation,
        summarized: asked,
        prompts,
      } = yield* scripted(
        [reply("Noon.")],
        (prompt) =>
          texts(prompt).join("").length > 3_000
            ? Effect.fail(
                AiError.make({
                  module: "Test",
                  method: "generateText",
                  reason: new AiError.InvalidRequestError({
                    description: "This endpoint's maximum context length is 1000 tokens.",
                  }),
                }),
              )
            : summarized("They asked about the launch."),
        { contextTokens: 1_000, outputTokens: undefined },
      );
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      // The pass it refused was summarized again in halves, each reading the summary so far.
      expect(asked.length).toBeGreaterThan(2);
      expect(state.checkpoints).toHaveLength(1);
      expect(texts(prompts[0])[1]).toBe(
        "Summary of the earlier conversation: They asked about the launch.",
      );
    }),
  );

  it.effect("keeps less at each checkpoint while its provider still refuses, then carries on", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      const notes = Array.from({ length: 6 }, (_, index) =>
        input(`Note ${index + 1}: ${"the launch is on track ".repeat(9)}`),
      );
      record({ _tag: "History", turnId, items: notes });
      const { implementation } = yield* scripted(
        [tooLong, tooLong, reply("Noon.")],
        summarized("They sent notes about the launch."),
        { contextTokens: 1_000, outputTokens: undefined },
      );
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.checkpoints).toHaveLength(2);
      expect(state.checkpoints[1]!.kept.length).toBeLessThan(state.checkpoints[0]!.kept.length);
      expect(state.replies).toEqual(["Noon."]);
    }),
  );

  it.effect("fails a turn whose context is full again before its model answers", () =>
    Effect.gen(function* () {
      const { state, turnExecution, record } = fakeExecution();
      record({ _tag: "History", turnId, items: [input("How was the launch?")] });
      const { implementation } = yield* scripted(
        [tooLong, tooLong],
        summarized("They asked about the launch."),
      );
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps.at(-1)).toBe(
        "fail: The conversation no longer fits in test-model's context window, even summarized.",
      );
    }),
  );

  it.effect("fails a turn after a failure not worth retrying", () =>
    Effect.gen(function* () {
      const { state, turnExecution } = fakeExecution();
      const { implementation } = yield* scripted([failure(new AiError.QuotaExhaustedError({}))]);
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps.slice(-2)).toEqual([
        "interrupted final",
        "fail: Test models has no quota left for its API key.",
      ]);
      expect(state.turn.status).toBe("failed");
    }),
  );

  it.effect("tells readers what went wrong without the provider's own message", () =>
    Effect.gen(function* () {
      const { state, turnExecution } = fakeExecution();
      const { implementation } = yield* scripted([
        failure(
          new AiError.AuthenticationError({
            kind: "InvalidKey",
            description: "Incorrect API key provided. (POST http://10.0.0.7:8080/v1/chat)",
          }),
        ),
      ]);
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps.at(-1)).toBe("fail: Test models didn't accept its API key.");
      expect(state.turn.failure).toBe("Test models didn't accept its API key.");
    }),
  );

  it.effect("fails a turn whose environment has a sandbox, without starting it", () =>
    Effect.gen(function* () {
      const { state, turnExecution } = fakeExecution({ sandbox: true });
      const { implementation, prompts } = yield* scripted([]);
      const runner = yield* runnerOver(turnExecution, implementation);

      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual(["fail: Environments with a sandbox can't run turns yet."]);
      expect(prompts).toEqual([]);
    }),
  );

  it.effect("leaves a finished turn as it is, and confirms a stop asked for before it ran", () =>
    Effect.gen(function* () {
      const { state, turnExecution } = fakeExecution();
      const { implementation } = yield* scripted([]);
      const runner = yield* runnerOver(turnExecution, implementation);
      state.turn = Turn.change(state.turn, { status: "running" });
      state.turn = Turn.change(state.turn, { status: "cancelling", cancelReason: "requested" });

      yield* runner.run(workspaceId, turnId);
      yield* runner.run(workspaceId, turnId);

      expect(state.steps).toEqual(["stopped"]);
    }),
  );
});
