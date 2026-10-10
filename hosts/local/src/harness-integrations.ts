/**
 * The integrations of the agents this host runs, which workspaces connect to: amends's own agent,
 * which runs in this process, and opencode, which works in a sandbox behind its bridge. A
 * connection to either gives no settings and no credential, and reaches nothing, so it is always
 * healthy. Its harness runs the agent on the endpoints it is given, which connections to model
 * providers give.
 */
import { Connection, Integration } from "@amends/connection";
import { type Agent, Harness } from "@amends/harness";
import { AmendsAgent, Models } from "@amends/harness-amends";
import { Opencode2Agent } from "@amends/harness-opencode";
import { type Crypto, Effect } from "effect";
import type { Socket } from "effect/socket";

/** The health of a connection to an agent, which reaches nothing. */
const healthy = () => Effect.succeed<Connection.Health>({ status: "healthy" });

/**
 * The integration of amends's agent, for the host to install with what the agent takes besides
 * its models: the most steps a turn takes, and how long a command runs. The agent makes its models
 * with the `Models.LanguageModels` the integration is made with.
 */
export const amends = Effect.fn("HarnessIntegrations.amends")(function* (
  options: Omit<AmendsAgent.Options, keyof Agent.Options> = {},
) {
  const languageModels = yield* Models.LanguageModels;
  return Integration.make({
    id: "amends",
    name: "amends",
    auth: ["none"],
    harnesses: {
      requiresSandbox: false,
      harness: (_access, agentOptions) =>
        AmendsAgent.make({ ...options, ...agentOptions }).pipe(
          Effect.map(Harness.make),
          Effect.provideService(Models.LanguageModels, languageModels),
        ),
    },
    check: healthy,
  });
});

/**
 * The integration of opencode, for the host to install with what the agent takes besides its
 * models: the `token` function its bridges' tokens come from, and opencode's `config` and `env`.
 * Endpoints that opencode cannot serve together are refused with `UnsupportedError`. Its id is
 * `opencode-agent`, as `opencode` is the id of OpenCode Zen, a provider of models in the catalog.
 */
export const opencode = Effect.fn("HarnessIntegrations.opencode")(function* (
  options: Omit<Opencode2Agent.Options, keyof Agent.Options>,
) {
  const context = yield* Effect.context<Socket.WebSocketConstructor | Crypto.Crypto>();
  return Integration.make({
    id: "opencode-agent",
    name: "opencode",
    docs: "https://opencode.ai/docs",
    auth: ["none"],
    harnesses: {
      requiresSandbox: true,
      harness: (_access, agentOptions) =>
        Opencode2Agent.make({ ...options, ...agentOptions }).pipe(
          Effect.map(Harness.make),
          Effect.mapError(
            (error) => new Connection.UnsupportedError({ description: error.reason.message }),
          ),
          Effect.provideContext(context),
        ),
    },
    check: healthy,
  });
});

export * as HarnessIntegrations from "./harness-integrations.ts";
