/**
 * opencode as an agent that hosts run. opencode works in the sandbox behind its bridge: the agent's
 * template installs both there, and a session launches the bridge when none answers. One bridge and
 * one opencode server serve every session that hosts start in a sandbox with the same options,
 * whichever host started it; other options, such as another model, get a bridge and a server of
 * their own. What runs in the sandbox is in `internal/bridge/`.
 *
 * opencode runs on the model endpoints the agent is made with, which it is configured for.
 * Their keys reach opencode in its configuration, in the sandbox, where the commands opencode runs
 * can read them.
 *
 * opencode's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 *
 * @since 0.1.0
 */
import { type Agent, BridgeClient, HarnessError } from "@amends/harness";
import type { Sandbox } from "@amends/sandbox";
import { type Crypto, Effect, type Redacted, Schema } from "effect";
import type { Socket } from "effect/socket";
import type { Options as DriverOptions } from "./internal/bridge/Driver.ts";
import { modelsOf } from "./internal/models.ts";
import { makeInstallation } from "./internal/template.ts";

/**
 * What the agent is made with: the endpoints its turns run on, as `Agent.Options` give them, and
 * what only opencode takes. All of it, the keys included, names the bridge, so an agent made with
 * other options gets a bridge and a server of its own in a sandbox, and never runs on another's.
 *
 * @category options
 * @since 0.1.0
 */
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
 * The agent, which bundles the bridge program for its template when it is made, with `Bun.build`,
 * so the host runs on Bun. Each session reaches opencode through the bridge in its sandbox, with
 * the `Crypto` and the `WebSocketConstructor` the agent is made with; the constructor must send
 * headers, as Bun's and Node's do. Endpoints that opencode cannot serve together fail with
 * `UnsupportedError`.
 *
 * **Example** (A turn of opencode in a new sandbox)
 *
 * ```ts
 * import { OpencodeAgent } from "@amends/harness-opencode";
 * import { Agent, Harness } from "@amends/harness";
 * import { SandboxProvider } from "@amends/sandbox";
 * import { BunServices, BunSocket } from "@effect/platform-bun";
 * import { Config, Effect, Layer, Redacted } from "effect";
 * import { createHmac } from "node:crypto";
 *
 * declare const sandboxes: Layer.Layer<SandboxProvider.SandboxProvider>; // a sandbox provider
 *
 * const program = Effect.gen(function* () {
 *   // Every host derives a sandbox's bridge token from its id with a secret the hosts share.
 *   const secret = yield* Config.Redacted("BRIDGE_SECRET");
 *   const agent = yield* OpencodeAgent.make({
 *     model: {
 *       provider: "anthropic",
 *       model: "claude-sonnet-5-5",
 *       protocol: "anthropic-messages",
 *       url: "https://api.anthropic.com/v1",
 *       apiKey: yield* Config.Redacted("ANTHROPIC_API_KEY"),
 *     },
 *     token: (sandboxId) =>
 *       Redacted.make(
 *         createHmac("sha256", Redacted.value(secret)).update(sandboxId).digest("base64url"),
 *       ),
 *   });
 *   const harness = Harness.make(agent);
 *   const sandboxProvider = yield* SandboxProvider.SandboxProvider;
 *   const sandbox = yield* sandboxProvider.createScoped({ template: harness.agent.template });
 *   const session = yield* harness.createSession({ sandbox, id: Agent.SessionId.make("review") });
 *   const answer = yield* session.generate({ prompt: "Summarize README.md" });
 *   return answer.text;
 * }).pipe(
 *   Effect.scoped,
 *   Effect.provide(
 *     Layer.mergeAll(sandboxes, BunServices.layer, BunSocket.layerWebSocketConstructor),
 *   ),
 * );
 * ```
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.fn("OpencodeAgent.make")(function* (options: Options) {
  const models = yield* Effect.fromResult(modelsOf(options)).pipe(
    Effect.mapError((reason) => new HarnessError.HarnessError({ agent: "opencode", reason })),
  );
  const installation = yield* makeInstallation();
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
