/**
 * opencode as an agent that hosts run. opencode works in the sandbox behind its bridge: the agent's
 * template installs both there, and a session launches the bridge when none answers. One bridge and
 * one opencode server serve every session in a sandbox, whichever host started it. What runs in the
 * sandbox is in `bridge/`.
 *
 * opencode's session API does not yet take a turn's instructions, an answer in JSON, the host's
 * tools, or a request to compact, which fail with `UnsupportedError`.
 */
import { BridgeClient } from "@amends/harness-v2";
import type { Network, Sandbox } from "@amends/sandbox-v2";
import { Effect, type Redacted, type Schema } from "effect";
import type { Options as AgentOptions } from "./bridge/Agent.ts";
import * as Template from "./Template.ts";

export interface Options {
  /**
   * The model a turn runs on when it names none, as opencode names models: `provider/model`, such
   * as `anthropic/claude-sonnet-4-5`. A turn names another the same way.
   */
  readonly model: string;

  /** The port the bridge listens on in its sandbox, which the sandbox must be created with. */
  readonly port: Network.Port;

  /**
   * The token the bridge in the sandbox `id` takes, derived from the id with a secret every host
   * shares, such as an HMAC of it, so that every host connects to a bridge any of them launched.
   */
  readonly token: (id: Sandbox.SandboxId) => Redacted.Redacted<string>;

  /**
   * opencode's configuration, as its `opencode.json` takes it. It takes effect when the bridge starts
   * opencode's server; a server already running in the sandbox keeps the one it started with.
   */
  readonly config?: { readonly [key: string]: Schema.Json };

  /** Environment variables opencode's server runs with, such as a model provider's API key. */
  readonly env?: Readonly<Record<string, string>>;
}

/** The agent, which bundles the bridge program for its template when it is made. */
export const make = Effect.fn("OpencodeAgent.make")(function* (options: Options) {
  const installation = yield* Template.make();
  return yield* BridgeClient.make({
    id: "opencode",
    ...installation,
    port: options.port,
    token: options.token,
    agentOptions: {
      model: options.model,
      config: options.config ?? {},
      env: options.env ?? {},
    } satisfies AgentOptions,
  });
});
