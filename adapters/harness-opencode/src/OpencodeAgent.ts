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
 */
import { BridgeClient, HarnessError, type ModelEndpoint } from "@amends/harness-v2";
import type { Network, Sandbox } from "@amends/sandbox-v2";
import { Effect, type Redacted, type Schema } from "effect";
import type { Options as AgentOptions } from "./bridge/Agent.ts";
import * as Models from "./Models.ts";
import * as Template from "./Template.ts";

// TODO: Keep the endpoints' keys out of the sandbox, giving opencode stand-ins that the sandbox
// replaces with the keys in the requests that leave it, once a sandbox provider can.
export interface Options {
  /** The model a turn runs on when it names none. */
  readonly model: ModelEndpoint.ModelEndpoint;

  /** The models a turn can name, by name. A turn that names another fails with `UnsupportedError`. */
  readonly models?: Readonly<Record<string, ModelEndpoint.ModelEndpoint>>;

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
  const models = yield* Effect.fromResult(
    Models.fromEndpoints({ model: options.model, models: options.models ?? {} }),
  ).pipe(Effect.mapError((reason) => new HarnessError.HarnessError({ agent: "opencode", reason })));
  const installation = yield* Template.make();
  return yield* BridgeClient.make({
    id: "opencode",
    ...installation,
    port: options.port,
    token: options.token,
    agentOptions: {
      model: models.model,
      models: models.models,
      config: { ...options.config, providers: models.providers },
      env: options.env ?? {},
    } satisfies AgentOptions,
  });
});
