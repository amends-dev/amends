import { type Integration, Integrations } from "@amends-dev/connection";
import { expect, it } from "@effect/vitest";
import { Effect } from "effect";
import * as LocalHost from "../src/host.ts";

it.effect(
  "the host installs integrations of every capability, with distinct ids, reaching nothing yet",
  () =>
    Effect.gen(function* () {
      // Making the integrations creates no sandbox directory: only a connection's check does.
      const integrations = yield* LocalHost.makeIntegrations("/nonexistent/amends-sandboxes");
      const installed = yield* Integrations.make(integrations);
      const providing = (capability: Integration.Capability) =>
        installed.all
          .filter((integration) => integration.provides.includes(capability))
          .map((integration) => integration.id);

      expect(providing("harnesses")).toEqual(["amends", "opencode-agent", "opencode2-agent"]);
      expect(providing("sandboxes")).toEqual(["local", "daytona"]);
      expect(providing("tools")).toEqual(["mcp", "openapi"]);
      expect(providing("models")).toContain("anthropic");
      expect(providing("models")).toContain("openai-compatible");
      // opencode's agent is `opencode-agent`, beside OpenCode Zen, the catalog's `opencode`.
      expect(providing("models")).toContain("opencode");
      expect(providing("models").length).toBeGreaterThan(100);
    }),
);
