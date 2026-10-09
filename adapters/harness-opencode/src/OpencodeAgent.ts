/**
 * opencode as an agent that hosts run. opencode works in the sandbox behind its bridge: the agent's
 * template installs both there, and a session launches the bridge when none answers. One bridge and
 * one opencode server serve every session that hosts start in a sandbox with the same options,
 * whichever host started it; other options, such as another model, get a bridge and a server of
 * their own. What runs in the sandbox is in `bridge/`.
 *
 * opencode runs on the model endpoints the agent is made with, which `Models` configures it for.
 * Their keys reach opencode in its configuration, in the sandbox, where the commands opencode runs
 * can read them.
 *
 * opencode's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 */
import { type Agent, BridgeClient, HarnessError } from "@amends/harness";
import type { Sandbox } from "@amends/sandbox";
import { type Crypto, Effect, type Redacted, Schema } from "effect";
import type { Socket } from "effect/socket";
import type { Options as DriverOptions } from "./bridge/Driver.ts";
import * as Models from "./Models.ts";
import * as Template from "./Template.ts";

// TODO: Keep the endpoints' keys out of the sandbox, giving opencode stand-ins that the sandbox
// replaces with the keys in the requests that leave it, once a sandbox provider can.
export interface Options extends Agent.Options {
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
 * The agent, which bundles the bridge program for its template when it is made. Each session
 * reaches opencode through the bridge in its sandbox, with the `WebSocketConstructor` the agent is
 * made with. Endpoints that opencode cannot serve together fail with `UnsupportedError`.
 */
export const make = Effect.fn("OpencodeAgent.make")(function* (options: Options) {
  const models = yield* Effect.fromResult(
    Models.fromEndpoints({ model: options.model, models: options.models ?? {} }),
  ).pipe(Effect.mapError((reason) => new HarnessError.HarnessError({ agent: "opencode", reason })));
  const installation = yield* Template.make();
  const services = yield* Effect.context<Socket.WebSocketConstructor | Crypto.Crypto>();
  const bridge: BridgeClient.Options = {
    id: "opencode",
    ...installation,
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
    createSession: (sessionOptions) =>
      Effect.provide(BridgeClient.createSession(bridge, sessionOptions), services),
  };
  return agent;
});
