import { ConnectionImplementation } from "@amends/connection";
import type { ModelInference } from "@amends/connection/model-inference";
import { Environment } from "@amends/core/environment";
import { Turn } from "@amends/core/turn";
import { TurnExecution } from "@amends/core/turn";
import type { Transcript } from "@amends/harness";
import { AmendsHarness } from "@amends/harness-amends";
import { expect, it } from "@effect/vitest";
import { Duration, Effect, Layer, Schema } from "effect";
import { LanguageModel, Model } from "effect/ai";
import { NextStep } from "../../src/runner/next-step.ts";
import { RunnerSettings } from "../../src/runner/settings.ts";

const createdAt = "2026-09-28T12:00:00.000Z";
const selection = Schema.decodeUnknownSync(Turn.Selection)({
  connectionId: "connection-one",
  model: "test-model",
  reasoning: null,
  environmentId: "environment-one",
});
const turn = (status: "queued" | "running") =>
  Schema.decodeUnknownSync(Turn.Record)({
    id: "turn-one",
    workspaceId: "workspace-one",
    groupId: "group-one",
    threadId: "thread-one",
    agentId: "agent-one",
    memberId: "member-agent",
    participationId: "participation-one",
    logAfter: null,
    historyFrom: null,
    retryOf: null,
    status,
    inputAfterSequence: 0,
    acceptedThroughSequence: 1,
    selection: status === "queued" ? null : selection,
    messageIds: [],
    failure: null,
    cancelReason: null,
    createdAt,
    startedAt: status === "queued" ? null : createdAt,
    finishedAt: null,
  });
const environment = (options: { readonly harnessId?: string; readonly sandbox?: boolean } = {}) =>
  Schema.decodeUnknownSync(Environment.Record)({
    id: "environment-one",
    workspaceId: "workspace-one",
    name: "In process",
    harnessId: options.harnessId ?? "amends",
    sandbox: options.sandbox
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
const input = (text: string): Transcript.Input => ({
  _tag: "Input",
  author: { id: "member-alice", name: "Alice" },
  content: [{ _tag: "Text", text }],
});

/** A model the decision only measures against: deciding never runs it. */
const model = (limits: ModelInference.Limits): ModelInference.Implementation => ({
  declaration: ConnectionImplementation.Declaration.make({
    id: ConnectionImplementation.Id.make("test"),
    name: "Test",
    description: "Never asked.",
    capabilities: { modelInference: { interface: "test" } },
    settings: [],
    authentication: [{ _tag: "None" }],
  }),
  languageModel: () =>
    Layer.mergeAll(
      Layer.effect(LanguageModel.LanguageModel, Effect.die("Deciding never runs a model")),
      Layer.succeed(Model.ProviderName, "test"),
      Layer.succeed(Model.ModelName, "test-model"),
    ),
  limits: () => limits,
});
const roomy = model({ contextTokens: 1_000_000, outputTokens: 128_000 });
const settings = (limits = roomy) =>
  RunnerSettings.fromOptions({ harnesses: [AmendsHarness.make()], models: [limits] });

/** A running turn's plan, with nothing yet done in it. */
const plan = (overrides: Partial<TurnExecution.Plan> = {}): TurnExecution.Plan => ({
  turn: turn("running"),
  instructions: "Answer.",
  selection,
  connection: {
    name: "Test models",
    implementationId: "test",
    settings: {},
    credential: undefined,
  },
  environment: environment(),
  history: [],
  transcript: [],
  pending: undefined,
  log: [],
  attempts: 0,
  interruption: undefined,
  diedLast: false,
  waiting: [],
  fixed: 0,
  measured: undefined,
  overflow: { count: 0, pending: false },
  ...overrides,
});
const ready = (overrides: Partial<TurnExecution.Plan> = {}): TurnExecution.Preparation =>
  TurnExecution.Preparation.Ready({ plan: plan(overrides) });

it("a finished turn needs nothing, and one asked to stop is confirmed stopped", () => {
  expect(NextStep.decide(TurnExecution.Preparation.Finished(), settings(), undefined)._tag).toBe(
    "Done",
  );
  expect(NextStep.decide(TurnExecution.Preparation.Stopping(), settings(), undefined)._tag).toBe(
    "ConfirmStop",
  );
});

it("fails a turn prepare finds unrunnable, or one this host cannot run", () => {
  const failed = (preparation: TurnExecution.Preparation) =>
    NextStep.decide(preparation, settings(), undefined);
  expect(
    failed(TurnExecution.Preparation.Unrunnable({ reason: "The agent was removed." })),
  ).toEqual({
    _tag: "Fail",
    reason: "The agent was removed.",
  });
  expect(failed(ready({ environment: environment({ sandbox: true }) }))).toEqual({
    _tag: "Fail",
    reason: "Environments with a sandbox can't run turns yet.",
  });
  expect(failed(ready({ environment: environment({ harnessId: "elsewhere" }) }))).toEqual({
    _tag: "Fail",
    reason: "The elsewhere harness doesn't run on this server.",
  });
  expect(
    failed(
      ready({
        connection: {
          name: "Other models",
          implementationId: "other",
          settings: {},
          credential: undefined,
        },
      }),
    ),
  ).toEqual({ _tag: "Fail", reason: "Other models's models can't run on this server." });
});

it("starts a queued turn with the selection it prepared", () => {
  expect(NextStep.decide(ready({ turn: turn("queued") }), settings(), undefined)).toEqual({
    _tag: "Start",
    selection,
  });
});

it("gives up a turn whose attempts keep getting nowhere, with its last interruption", () => {
  const interruption = {
    reason: "Test models is limiting requests.",
    retryable: true,
    problem: "model-rate-limit" as const,
  };
  expect(NextStep.decide(ready({ attempts: 4, interruption }), settings(), false)).toEqual({
    _tag: "GiveUp",
    reason: "Test models is limiting requests.",
    attempts: 4,
    problem: "model-rate-limit",
  });
  expect(NextStep.decide(ready({ attempts: 3, interruption }), settings(), false)._tag).not.toBe(
    "GiveUp",
  );
});

it("rests after an interrupted attempt, or before a run's first after one that died, once", () => {
  const rested = (rest: boolean | undefined, diedLast: boolean) =>
    NextStep.decide(ready({ attempts: 2, diedLast }), settings(), rest);
  expect(rested(true, false)).toEqual({ _tag: "Rest", delay: Duration.seconds(4) });
  expect(rested(undefined, true)).toEqual({ _tag: "Rest", delay: Duration.seconds(4) });
  // Having rested, the run works, however the log stands.
  expect(rested(false, true)._tag).toBe("Work");
  expect(rested(undefined, false)._tag).toBe("Work");
});

it("works while the conversation fits its model, and summarizes it first when it does not", () => {
  const long = [input("a".repeat(4_000)), input("b".repeat(4_000)), input("c".repeat(4_000))];
  const conversation = { history: long, transcript: long };
  expect(NextStep.decide(ready(conversation), settings(), undefined)).toMatchObject({
    _tag: "Work",
    budget: 200_000,
  });
  const small = model({ contextTokens: 1_000, outputTokens: undefined });
  expect(NextStep.decide(ready(conversation), settings(small), undefined)).toMatchObject({
    _tag: "Summarize",
    budget: 800,
  });
});

it("fails a turn whose context proved full more often than its policy allows", () => {
  expect(
    NextStep.decide(ready({ overflow: { count: 4, pending: true } }), settings(), undefined),
  ).toEqual({
    _tag: "Fail",
    reason: "The conversation no longer fits in test-model's context window, even summarized.",
  });
});
