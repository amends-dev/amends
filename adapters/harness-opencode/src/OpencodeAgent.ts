/**
 * opencode as an agent that hosts run. opencode works in the sandbox behind its bridge: the agent's
 * template installs both there, and a session launches the bridge when none answers. One bridge and
 * one opencode server serve every session in a sandbox, whichever host started it. What runs in the
 * sandbox is in `bridge/`.
 *
 * opencode runs on the model endpoints the agent is made with, which `Models` configures it for.
 * Their keys reach opencode in its configuration, in the sandbox, where the commands opencode runs
 * can read them.
 *
 * opencode's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 *
 * `integration` gives the agent to connections, for a host to install.
 */
import { Connection, Integration } from "@amends/connection-v2";
import { type Agent, BridgeClient, Harness, HarnessError } from "@amends/harness-v2";
import type { Network, Sandbox } from "@amends/sandbox-v2";
import { type Crypto, Effect, type Redacted, Schema } from "effect";
import type { Socket } from "effect/socket";
import type { Options as DriverOptions } from "./bridge/Driver.ts";
import * as Models from "./Models.ts";
import * as Template from "./Template.ts";

// TODO: Keep the endpoints' keys out of the sandbox, giving opencode stand-ins that the sandbox
// replaces with the keys in the requests that leave it, once a sandbox provider can.
export interface Options extends Agent.Options {
  /** The port the bridge listens on in its sandbox, which the sandbox must be created with. */
  readonly port: Network.Port;

  /**
   * The token the bridge in the sandbox `id` takes, derived from the id with a secret every host
   * shares, such as an HMAC of it, so that every host connects to a bridge any of them launched.
   */
  readonly token: (id: Sandbox.SandboxId) => Redacted.Redacted<string>;

  /**
   * opencode's configuration, as opencode 1.18 writes its `opencode.json`, which names providers
   * `providers`; the providers that serve the models replace any it has. It takes effect when the
   * bridge starts opencode's server; a server already running in the sandbox keeps the one it
   * started with.
   */
  readonly config?: { readonly [key: string]: Schema.Json };

  /** Environment variables opencode's server runs with. */
  readonly env?: Readonly<Record<string, string>>;
}

/**
 * The agent, which bundles the bridge program for its template when it is made. Endpoints that
 * opencode cannot serve together fail with `UnsupportedError`.
 */
export const make = Effect.fn("OpencodeAgent.make")(function* (options: Options) {
  const models = yield* Effect.fromResult(modelsOf(options)).pipe(
    Effect.mapError((reason) => new HarnessError.HarnessError({ agent: "opencode", reason })),
  );
  return yield* agentOf(yield* Template.make(), models, options);
});

/**
 * The integration of opencode, for a host to install with what the agent takes besides its models.
 * It bundles the bridge program once, when it is made. A connection to it gives no settings and no
 * credential, and reaches nothing, so it is always healthy. Its id is `opencode-agent`, as
 * `opencode` is the id of OpenCode Zen, a provider of models in the catalog.
 */
export const integration = Effect.fn("OpencodeAgent.integration")(function* (
  options: Omit<Options, keyof Agent.Options>,
) {
  const installation = yield* Template.make();
  const context = yield* Effect.context<Socket.WebSocketConstructor | Crypto.Crypto>();
  return Integration.make({
    id: "opencode-agent",
    name: "opencode",
    docs: "https://opencode.ai/docs",
    auth: ["none"],
    harnesses: (_access, agentOptions) =>
      Effect.fromResult(modelsOf(agentOptions)).pipe(
        Effect.mapError(
          (reason) => new Connection.UnsupportedError({ description: reason.message }),
        ),
        Effect.flatMap((models) => agentOf(installation, models, { ...options, ...agentOptions })),
        Effect.map(Harness.make),
        Effect.provideContext(context),
      ),
    check: () => Effect.succeed({ status: "healthy" }),
  });
});

/** The models opencode runs on for the endpoints `options` gives. */
const modelsOf = (options: Agent.Options) =>
  Models.fromEndpoints({ model: options.model, models: options.models ?? {} });

/**
 * The agent, installed in its sandboxes as `installation` says, running on `models`. Each session
 * reaches opencode through the bridge in its sandbox, with the `WebSocketConstructor` the agent is
 * made with.
 */
const agentOf = Effect.fnUntraced(function* (
  installation: Template.Installation,
  models: Models.Models,
  options: Options,
) {
  const services = yield* Effect.context<Socket.WebSocketConstructor | Crypto.Crypto>();
  const bridge: BridgeClient.Options = {
    id: "opencode",
    ...installation,
    port: options.port,
    token: options.token,
    agentOptions: {
      model: models.model,
      models: models.models,
      config: { ...options.config, providers: models.providers },
      env: options.env ?? {},
    } satisfies DriverOptions,
  };
  const agent: Agent.Agent = {
    id: "opencode",
    requiresSandbox: true,
    template: installation.template,
    ports: [options.port],
    startSession: (startOptions) =>
      Effect.provide(BridgeClient.startSession(bridge, startOptions), services),
  };
  return agent;
});
