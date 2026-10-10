/**
 * The integrations of the agents this host runs, which workspaces connect to: amends's own agent,
 * which runs in this process, and opencode, which works in a sandbox behind its bridge, in an
 * integration for each of its versions. A connection to any of them gives no settings and no
 * credential, and reaches nothing, so it is always healthy. Its harness runs the agent on the
 * endpoints it is given, which connections to model providers give.
 */
import { Connection, Integration } from "@amends-dev/connection";
import { type Agent, Harness } from "@amends-dev/harness";
import { AmendsAgent, Models } from "@amends-dev/harness-amends";
import { Opencode2Agent, OpencodeAgent } from "@amends-dev/harness-opencode";
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

/** What the host installs opencode's agents with besides their models. */
export type OpencodeOptions = Omit<OpencodeAgent.Options, keyof Agent.Options>;

/**
 * The integration of opencode 1, opencode's stable release, for the host to install with what the
 * agent takes besides its models: the `token` function its bridges' tokens come from, and
 * opencode's `config` and `env`. Endpoints that opencode cannot serve together are refused with
 * `UnsupportedError`. Its id is `opencode-agent`, as `opencode` is the id of OpenCode Zen, a
 * provider of models in the catalog.
 */
export const opencode = (options: OpencodeOptions) =>
  makeOpencodeIntegration(options, {
    id: "opencode-agent",
    name: "opencode",
    docs: "https://opencode.ai/docs",
    make: OpencodeAgent.make,
  });

/**
 * The integration of opencode 2, as `opencode` gives that of opencode 1, with the id
 * `opencode2-agent`. Its agent records a session started on another agent as opencode's own, but
 * refuses an answer in JSON.
 */
export const opencode2 = (options: OpencodeOptions) =>
  makeOpencodeIntegration(options, {
    id: "opencode2-agent",
    name: "opencode 2",
    docs: "https://opencode.ai/v2/docs",
    make: Opencode2Agent.make,
  });

/** The integration of one of opencode's agents, which `make` makes with `options`. */
const makeOpencodeIntegration = Effect.fn("HarnessIntegrations.makeOpencodeIntegration")(function* (
  options: OpencodeOptions,
  agent: {
    readonly id: string;
    readonly name: string;
    readonly docs: string;
    readonly make: typeof OpencodeAgent.make;
  },
) {
  const context = yield* Effect.context<Socket.WebSocketConstructor | Crypto.Crypto>();
  return Integration.make({
    id: agent.id,
    name: agent.name,
    docs: agent.docs,
    auth: ["none"],
    harnesses: {
      requiresSandbox: true,
      harness: (_access, agentOptions) =>
        agent.make({ ...options, ...agentOptions }).pipe(
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
