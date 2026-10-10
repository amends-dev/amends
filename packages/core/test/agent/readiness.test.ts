import {
  Connection as ConnectionContract,
  Integration,
  Integrations,
  type ModelCatalog,
} from "@amends-dev/connection";
import { describe, expect, it } from "@effect/vitest";
import { DateTime, Effect, Result, Schema } from "effect";
import { AgentReadiness } from "../../src/agent/readiness.ts";
import { Connection } from "../../src/connection/connection.ts";
import { Member } from "../../src/workspace/member/member.ts";
import { Workspace } from "../../src/workspace/workspace.ts";

const unused = () => Effect.die("No test makes a harness or a sandbox provider");

/** A model the models integration lists, which reasons with a low or high effort. */
const listed: ModelCatalog.Model = {
  id: "model-one",
  name: "Model One",
  protocol: "openai-chat",
  url: "https://models.example/v1",
  released: "2026-01",
  limits: { context: 100_000, output: 8_000 },
  modalities: { input: ["text"], output: ["text"] },
  tools: true,
  reasoning: { toggle: false, efforts: ["low", "high"] },
};

const installed = Integrations.make([
  Integration.make({
    id: "in-process",
    name: "In process",
    auth: ["none"],
    harnesses: { requiresSandbox: false, harness: unused },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "boxed",
    name: "Boxed",
    auth: ["none"],
    harnesses: { requiresSandbox: true, harness: unused },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "models",
    name: "Models",
    settings: Schema.Struct({ region: Schema.optionalKey(Schema.NonEmptyString) }),
    auth: ["none"],
    models: {
      listed: [listed],
      unlisted: false,
      endpoint: () =>
        Result.fail(
          new ConnectionContract.UnsupportedError({ description: "No test reaches a model" }),
        ),
    },
    check: () => Effect.succeed({ status: "healthy" }),
  }),
  Integration.make({
    id: "boxes",
    name: "Boxes",
    auth: ["none"],
    sandboxes: unused,
    check: () => Effect.succeed({ status: "healthy" }),
  }),
]);

const connection = (
  id: string,
  integration: string,
  settings: Connection.Settings = {},
): Connection.Record => ({
  id: Connection.Id.make(id),
  workspaceId: Workspace.Id.make("workspace-one"),
  integration,
  name: id,
  settings,
  auth: "none",
  status: "active",
  createdBy: Member.Id.make("member-owner"),
  createdAt: DateTime.makeUnsafe("2026-10-06T12:00:00.000Z"),
});

const inProcess = connection("conn-in-process", "in-process");
const boxed = connection("conn-boxed", "boxed");
const models = connection("conn-models", "models");
const boxes = connection("conn-boxes", "boxes");
const everything = [inProcess, boxed, models, boxes];

const setup = (fields: Partial<AgentReadiness.Setup> = {}): AgentReadiness.Setup => ({
  harness: { _tag: "Connection", connectionId: inProcess.id },
  model: { connectionId: models.id, id: "model-one", effort: "high" },
  sandbox: null,
  ...fields,
});

const issuesOf = (
  agentSetup: AgentReadiness.Setup,
  connections: AgentReadiness.Connections = everything,
) =>
  Effect.flatMap(installed, (integrations) =>
    AgentReadiness.issuesOf(agentSetup, connections, integrations),
  );

describe("an agent's readiness", () => {
  it("names the connections a setup names, by part: harness, model, then sandbox", () => {
    expect(AgentReadiness.namedConnections(setup())).toEqual([
      { part: "harness", connectionId: inProcess.id },
      { part: "model", connectionId: models.id },
    ]);
    expect(
      AgentReadiness.namedConnections(
        setup({ harness: { _tag: "Auto" }, sandbox: { connectionId: boxes.id } }),
      ),
    ).toEqual([
      { part: "model", connectionId: models.id },
      { part: "sandbox", connectionId: boxes.id },
    ]);
  });

  it.effect("is ready when each connection gives its part as the agent takes it", () =>
    Effect.gen(function* () {
      expect(yield* issuesOf(setup())).toEqual([]);
      expect(
        yield* issuesOf(
          setup({
            harness: { _tag: "Connection", connectionId: boxed.id },
            sandbox: { connectionId: boxes.id },
          }),
        ),
      ).toEqual([]);
      expect(AgentReadiness.readinessOf([])).toEqual({ _tag: "Ready" });
      expect(AgentReadiness.readinessOf([{ _tag: "NoHarness" }])).toEqual({
        _tag: "Incomplete",
        issues: [{ _tag: "NoHarness" }],
      });
    }),
  );

  it.effect("names the part whose connection was removed or whose integration is gone", () =>
    Effect.gen(function* () {
      const uninstalled = [
        connection("conn-in-process", "retired"),
        connection("conn-models", "retired"),
        connection("conn-boxes", "retired"),
      ];
      const everyPart = setup({ sandbox: { connectionId: boxes.id } });

      expect(yield* issuesOf(everyPart, [])).toEqual([
        { _tag: "Removed", part: "harness" },
        { _tag: "Removed", part: "model" },
        { _tag: "Removed", part: "sandbox" },
      ]);
      expect(yield* issuesOf(everyPart, uninstalled)).toEqual([
        { _tag: "Uninstalled", part: "harness" },
        { _tag: "Uninstalled", part: "model" },
        { _tag: "Uninstalled", part: "sandbox" },
      ]);
    }),
  );

  it.effect("says why a connection does not give its part, as its integration describes it", () =>
    Effect.gen(function* () {
      const misplaced = yield* issuesOf(
        setup({
          harness: { _tag: "Connection", connectionId: models.id },
          model: { connectionId: boxes.id, id: "model-one" },
          sandbox: { connectionId: inProcess.id },
        }),
      );
      const unoffered = yield* issuesOf(setup({ model: { connectionId: models.id, id: "two" } }));
      const effortless = yield* issuesOf(
        setup({ model: { connectionId: models.id, id: "model-one", effort: "max" } }),
      );
      const misconfigured = yield* issuesOf(setup(), [
        inProcess,
        connection("conn-models", "models", { zone: "eu" }),
      ]);

      expect(misplaced).toEqual([
        { _tag: "Invalid", part: "harness", description: "Models gives no harnesses" },
        { _tag: "Invalid", part: "model", description: "Boxes gives no models" },
        { _tag: "Invalid", part: "sandbox", description: "In process gives no sandboxes" },
      ]);
      expect(unoffered).toEqual([
        { _tag: "Invalid", part: "model", description: "Models offers no model two" },
      ]);
      expect(effortless).toEqual([
        { _tag: "Invalid", part: "model", description: "Model One takes no effort max" },
      ]);
      expect(misconfigured).toMatchObject([
        {
          _tag: "Invalid",
          part: "model",
          description: expect.stringContaining("The settings of conn-models do not match"),
        },
      ]);
    }),
  );

  it.effect("needs a sandbox for a harness whose agent works only in one", () =>
    Effect.gen(function* () {
      expect(
        yield* issuesOf(setup({ harness: { _tag: "Connection", connectionId: boxed.id } })),
      ).toEqual([{ _tag: "SandboxRequired" }]);
    }),
  );

  it.effect("on Auto, needs a connection that gives a harness the agent can run on", () =>
    Effect.gen(function* () {
      const auto = setup({ harness: { _tag: "Auto" } });
      const autoInSandbox = setup({
        harness: { _tag: "Auto" },
        sandbox: { connectionId: boxes.id },
      });
      const noHarness = [{ _tag: "NoHarness" }];

      expect(yield* issuesOf(auto)).toEqual([]);
      expect(yield* issuesOf(auto, [models])).toEqual(noHarness);
      // A harness whose agent works only in a sandbox serves only an agent that has one.
      expect(yield* issuesOf(auto, [boxed, models])).toEqual(noHarness);
      expect(yield* issuesOf(autoInSandbox, [boxed, models, boxes])).toEqual([]);
      // Nor does a harness whose integration is gone, or no longer takes the connection.
      expect(
        yield* issuesOf(auto, [
          connection("conn-retired", "retired"),
          connection("conn-in-process", "in-process", { zone: "eu" }),
          models,
        ]),
      ).toEqual(noHarness);
    }),
  );
});
