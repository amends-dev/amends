/**
 * The integrations of the agents this host runs, which workspaces connect to: amends's own agent,
 * which runs in this process, and opencode, Codex, and Claude, which work in sandboxes behind their
 * bridges, with an integration for each opencode version. A connection to any gives no settings and no
 * credential, and reaches nothing, so it is always healthy. Its harness runs the agent on the
 * endpoints it is given, which connections to model providers give. `LocalHost.makeIntegrations`
 * installs them.
 *
 * @since 0.1.0
 */

import { Connection, Integration } from "@amends-dev/connection"
import { type Agent, Harness, type HarnessError } from "@amends-dev/harness"
import { AmendsAgent, Models } from "@amends-dev/harness-amends"
import { ClaudeAgent } from "@amends-dev/harness-claude"
import { CodexAgent } from "@amends-dev/harness-codex"
import { Opencode2Agent, OpencodeAgent } from "@amends-dev/harness-opencode"
import type * as Crypto from "effect/Crypto"
import * as Effect from "effect/Effect"
import type * as PlatformError from "effect/PlatformError"
import type * as Socket from "effect/socket/Socket"

/** The health of a connection to an agent, which reaches nothing. */
const healthy = () => Effect.succeed<Connection.Health>({ status: "healthy" })

/**
 * The integration of amends's agent, for the host to install with what the agent takes besides
 * its models: the most steps a turn takes, and how long a command runs. The agent makes its models
 * with the `Models.LanguageModels` the integration is made with.
 *
 * @category constructors
 * @since 0.1.0
 */
export const amends = Effect.fn("HarnessIntegrations.amends")(function* (
  options: Omit<AmendsAgent.Options, keyof Agent.Options> = {}
) {
  const languageModels = yield* Models.LanguageModels
  return Integration.make({
    id: "amends",
    name: "amends",
    auth: ["none"],
    harnesses: {
      requiresSandbox: false,
      harness: (_access, agentOptions) =>
        AmendsAgent.make({ ...options, ...agentOptions }).pipe(
          Effect.map(Harness.make),
          Effect.provideService(Models.LanguageModels, languageModels)
        )
    },
    check: healthy
  })
})

/**
 * What the host installs opencode's agents with besides their models.
 *
 * @category options
 * @since 0.1.0
 */
export type OpencodeOptions = Omit<OpencodeAgent.Options, keyof Agent.Options>

/**
 * The integration of opencode 1, opencode's stable release, for the host to install with what the
 * agent takes besides its models: the `token` function its bridges' tokens come from, and
 * opencode's `config` and `env`. Endpoints that opencode cannot serve together are refused with
 * `UnsupportedError`. Its id is `opencode-agent`, as `opencode` is the id of OpenCode Zen, a
 * provider of models in the catalog.
 *
 * @category constructors
 * @since 0.1.0
 */
export const opencode = (options: OpencodeOptions) =>
  makeSandboxHarnessIntegration({
    id: "opencode-agent",
    name: "opencode",
    docs: "https://opencode.ai/docs",
    make: (agentOptions) => OpencodeAgent.make({ ...options, ...agentOptions })
  })

/**
 * The integration of opencode 2, as `opencode` gives that of opencode 1, with the id
 * `opencode2-agent`. Its agent records a session started on another agent as opencode's own, but
 * refuses an answer in JSON.
 *
 * @category constructors
 * @since 0.1.0
 */
export const opencode2 = (options: OpencodeOptions) =>
  makeSandboxHarnessIntegration({
    id: "opencode2-agent",
    name: "opencode 2",
    docs: "https://opencode.ai/v2/docs",
    make: (agentOptions) => Opencode2Agent.make({ ...options, ...agentOptions })
  })

/**
 * What the host installs Codex with besides its models.
 *
 * @category options
 * @since 0.1.0
 */
export type CodexOptions = Omit<CodexAgent.Options, keyof Agent.Options>

/**
 * Codex's app-server, running behind the harness bridge in the session's sandbox.
 *
 * @category constructors
 * @since 0.1.0
 */
export const codex = (options: CodexOptions) =>
  makeSandboxHarnessIntegration({
    id: "codex-agent",
    name: "Codex",
    docs: "https://developers.openai.com/codex/app-server",
    make: (agentOptions) => CodexAgent.make({ ...options, ...agentOptions })
  })

/**
 * What the host installs Claude with besides its models.
 *
 * @category options
 * @since 0.1.0
 */
export type ClaudeOptions = Omit<ClaudeAgent.Options, keyof Agent.Options>

/**
 * Claude Agent SDK, running behind the harness bridge in the session's sandbox.
 *
 * @category constructors
 * @since 0.1.0
 */
export const claude = (options: ClaudeOptions) =>
  makeSandboxHarnessIntegration({
    id: "claude-agent",
    name: "Claude Agent",
    docs: "https://code.claude.com/docs/en/agent-sdk/overview",
    make: (agentOptions) => ClaudeAgent.make({ ...options, ...agentOptions })
  })

/** Installs an agent whose sessions run behind a bridge in a sandbox. */
const makeSandboxHarnessIntegration = Effect.fn("HarnessIntegrations.makeSandboxHarnessIntegration")(function* (agent: {
  readonly id: string
  readonly name: string
  readonly docs: string
  readonly make: (
    options: Agent.Options
  ) => Effect.Effect<
    Agent.Agent,
    HarnessError.HarnessError | PlatformError.PlatformError,
    Socket.WebSocketConstructor | Crypto.Crypto
  >
}) {
  const context = yield* Effect.context<Socket.WebSocketConstructor | Crypto.Crypto>()
  return Integration.make({
    id: agent.id,
    name: agent.name,
    docs: agent.docs,
    auth: ["none"],
    harnesses: {
      requiresSandbox: true,
      harness: (_access, agentOptions) =>
        agent.make(agentOptions).pipe(
          Effect.map(Harness.make),
          Effect.mapError((error) => new Connection.UnsupportedError({ description: error.reason.message })),
          Effect.provideContext(context)
        )
    },
    check: healthy
  })
})
