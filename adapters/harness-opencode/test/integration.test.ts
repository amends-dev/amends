import { Connection, Integrations, ModelCatalog, ModelIntegrations } from "@amends/connection-v2";
import type { ModelEndpoint } from "@amends/harness-v2";
import { Network } from "@amends/sandbox-v2";
import { BunServices, BunSocket } from "@effect/platform-bun";
import { expect, layer } from "@effect/vitest";
import { Effect, Layer, Redacted } from "effect";
import { FetchHttpClient } from "effect/http";
import * as OpencodeAgent from "../src/OpencodeAgent.ts";

const port = Network.Port.make(4096);

const connection: Connection.Connection = {
  id: Connection.ConnectionId.make("conn-1"),
  integration: "opencode-agent",
  name: "opencode",
  settings: {},
  auth: "none",
};

const sonnet = {
  provider: "anthropic",
  model: "claude-sonnet-5-5",
  protocol: "anthropic-messages",
  url: "https://api.anthropic.com/v1",
  apiKey: Redacted.make("secret-key"),
} satisfies ModelEndpoint.ModelEndpoint;

const makeIntegration = OpencodeAgent.integration({
  port,
  token: () => Redacted.make("bridge-token"),
});

layer(Layer.merge(BunServices.layer, BunSocket.layerWebSocketConstructor))(
  "OpencodeAgent.integration",
  (it) => {
    it.effect("gives harnesses of opencode, installed by a bridge it bundles once", () =>
      Effect.gen(function* () {
        const integration = yield* makeIntegration;

        const harness = yield* integration.harness(connection, undefined, { model: sonnet });
        const another = yield* integration.harness(connection, undefined, {
          model: { ...sonnet, model: "claude-opus-5-5" },
        });

        expect(integration.provides).toEqual(["harnesses"]);
        expect(harness.agent).toBe("opencode");
        expect(harness.requiresSandbox).toBe(true);
        expect(harness.ports).toEqual([port]);
        expect(harness.template?.name).toBe("opencode");
        expect(another.template).toBe(harness.template);
        expect(yield* integration.check(connection, undefined)).toEqual({ status: "healthy" });
      }),
    );

    it.effect("refuses models that opencode cannot run on together", () =>
      Effect.gen(function* () {
        const integration = yield* makeIntegration;

        const error = yield* Effect.flip(
          integration.harness(connection, undefined, {
            model: sonnet,
            models: { other: { ...sonnet, apiKey: Redacted.make("another-key") } },
          }),
        );

        expect(error.integration).toBe("opencode-agent");
        expect(error.reason).toBeInstanceOf(Connection.UnsupportedError);
        expect(error.reason).toMatchObject({
          _tag: "UnsupportedError",
          description:
            "opencode presents one key for each provider, and the endpoints for anthropic have different keys",
        });
      }),
    );

    it.effect(
      "is installed beside the catalog's providers of models, whose ids it does not take",
      () =>
        Effect.gen(function* () {
          const integrations = yield* Integrations.make([
            ...(yield* ModelIntegrations.catalogProviders),
            yield* makeIntegration,
          ]);

          expect((yield* integrations.find("opencode-agent")).provides).toEqual(["harnesses"]);
          expect((yield* integrations.find("opencode")).provides).toEqual(["models"]);
        }).pipe(Effect.provide(Layer.merge(ModelCatalog.layer, FetchHttpClient.layer))),
    );
  },
);
