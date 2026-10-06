import { Connection } from "@amends/connection-v2";
import { Agent } from "@amends/harness-v2";
import { BunServices } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect } from "effect";
import * as AmendsAgent from "../src/AmendsAgent.ts";
import * as Models from "../src/Models.ts";
import {
  answer,
  callTool,
  endpointOf,
  makeSandbox,
  makeScriptedModel,
  scriptedLanguageModels,
  toolResultsOf,
} from "./fixtures.ts";

const id = Agent.SessionId.make("session-one");

const connection: Connection.Connection = {
  id: Connection.ConnectionId.make("conn-1"),
  integration: "amends",
  name: "amends",
  settings: {},
  auth: "none",
};

layer(BunServices.layer)("AmendsAgent.integration", (it) => {
  it.effect("gives a harness of the agent, on the models it is given", () =>
    Effect.gen(function* () {
      const byDefault = yield* makeScriptedModel(() => answer("by default"));
      const fast = yield* makeScriptedModel(() => answer("fast"));
      const integration = yield* AmendsAgent.integration().pipe(
        Effect.provideService(
          Models.LanguageModels,
          scriptedLanguageModels(
            new Map([
              ["default", byDefault.model],
              ["fast", fast.model],
            ]),
          ),
        ),
      );

      const harness = yield* integration.harness(connection, undefined, {
        model: endpointOf("default"),
        models: { quick: endpointOf("fast") },
      });
      const session = yield* harness.startSession({ id });
      const first = yield* session.generate({ prompt: "hi" });
      const second = yield* session.generate({ prompt: "hi", model: "quick" });

      expect(integration.provides).toEqual(["harnesses"]);
      expect(harness.agent.id).toBe("amends");
      expect([first.text, second.text]).toEqual(["by default", "fast"]);
      expect(yield* integration.check(connection, undefined)).toEqual({ status: "healthy" });
    }),
  );

  it.effect("makes the agent with what the host installs the integration with", () =>
    Effect.gen(function* () {
      const { model, requests } = yield* makeScriptedModel((request) =>
        callTool(`bash-${toolResultsOf(request).length}`, "bash", { command: "true" }),
      );
      const integration = yield* AmendsAgent.integration({ maxSteps: 2 }).pipe(
        Effect.provideService(
          Models.LanguageModels,
          scriptedLanguageModels(new Map([["default", model]])),
        ),
      );

      const harness = yield* integration.harness(connection, undefined, {
        model: endpointOf("default"),
      });
      const session = yield* harness.startSession({ id, sandbox: yield* makeSandbox });
      const result = yield* session.generate({ prompt: "keep going" });

      expect(requests).toHaveLength(2);
      expect(result.finishReason).toBe("tool-calls");
    }),
  );
});
