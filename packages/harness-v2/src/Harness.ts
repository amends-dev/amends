/**
 * A harness runs one agent: it starts sessions with the agent and resumes sessions that any agent
 * ran before, so callers do not depend on which agent works for them. `make` builds one from an
 * agent's adapter, as `LanguageModel.make` builds a language model from a provider's.
 *
 * The caller creates the sandbox a session works in, from the `template` of the harness's `agent`,
 * and owns it: a harness never stops or destroys a sandbox. Each session works in its own directory
 * there, named by its id, so that its files stay in place when the session moves from one agent to
 * another. A session needs no sandbox when its agent does not require one, such as for a plain
 * conversation.
 */
import { Sandbox } from "@amends/sandbox-v2";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { Prompt } from "effect/ai";
import type { Agent, SessionId, Workspace } from "./Agent.ts";
import { HarnessError, UnknownError, UnsupportedError } from "./HarnessError.ts";
import { makeSession } from "./internal/session.ts";
import type * as Session from "./Session.ts";

/**
 * What a session starts from: the `id` of a new session, with the conversation it starts with if
 * any, or what an earlier one returned.
 */
export type StartSessionOptions = {
  /**
   * The sandbox the agent works in, created from the agent's `template`. Required when the agent
   * `requiresSandbox`. A sandbox other than the one a resumed session last ran in has the
   * conversation but not the files the session made.
   */
  readonly sandbox?: Sandbox.Sandbox["Service"];
} & (
  | {
      /** Names a new session. */
      readonly id: SessionId;
      /**
       * The conversation the session starts with, as when the agent joins one already under way.
       * Empty when omitted.
       */
      readonly history?: Prompt.Prompt;
      readonly resumeFrom?: never;
    }
  | {
      /** What `suspendTurn`, `detach`, or `stop` returned, on this harness's agent or any other. */
      readonly resumeFrom: Session.SessionState;
      readonly id?: never;
      readonly history?: never;
    }
);

export class Harness extends Context.Service<
  Harness,
  {
    /**
     * The agent the harness runs, as its adapter describes it: its id, the sandbox it works in, and
     * the names of tools it takes. Only the harness starts its sessions. Starting one fails with
     * `UnsupportedError` without a sandbox when the agent `requiresSandbox`, or in a sandbox
     * created without the agent's `ports`.
     */
    readonly agent: Omit<Agent, "startSession">;

    /**
     * Starts a session: a new one, which loads the `history` it is given, or one that goes on where
     * `resumeFrom` left it. The agent that last ran the session resumes from its own state. Any
     * other agent loads the conversation instead, and runs an unfinished turn again.
     */
    readonly startSession: (
      options: StartSessionOptions,
    ) => Effect.Effect<Session.Session, HarnessError>;
  }
>()("@amends/harness-v2/Harness") {}

export const make = (agent: Agent): Harness["Service"] => {
  /** Fails with `UnsupportedError` when the agent cannot work in `sandbox`. */
  const checkSandbox = (sandbox: Sandbox.Sandbox["Service"] | undefined) => {
    const description = sandboxRefusal(agent, sandbox);
    return description === undefined
      ? Effect.void
      : Effect.fail(
          new HarnessError({ agent: agent.id, reason: new UnsupportedError({ description }) }),
        );
  };

  /** The session's workspace in `sandbox`, creating its directory if it does not exist yet. */
  const makeWorkspace = Effect.fnUntraced(
    function* (sandbox: Sandbox.Sandbox["Service"], id: SessionId) {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = path.join(sandbox.workingDirectory, id);
      yield* fs.makeDirectory(directory, { recursive: true });
      return { sandbox, directory } satisfies Workspace;
    },
    (effect, sandbox) => Effect.provide(effect, Sandbox.layerServices(sandbox)),
    Effect.mapError(
      (cause) =>
        new HarnessError({
          agent: agent.id,
          reason: new UnknownError({ description: cause.message }),
          cause,
        }),
    ),
  );

  return Harness.of({
    agent,

    startSession: Effect.fn("Harness.startSession")(function* (options) {
      const { sandbox, resumeFrom } = options;
      const id = options.resumeFrom === undefined ? options.id : options.resumeFrom.id;
      yield* checkSandbox(sandbox);
      const workspace = sandbox === undefined ? undefined : yield* makeWorkspace(sandbox, id);
      const history = resumeFrom?.history ?? options.history ?? Prompt.empty;
      // An agent's own state means something only to the agent that wrote it. Any other agent
      // starts from the conversation, and the session runs an unfinished turn again on it.
      const own = resumeFrom !== undefined && resumeFrom.agent === agent.id;
      const agentSession = yield* agent.startSession({
        id,
        workspace,
        history,
        agentState: own ? resumeFrom.agentState : undefined,
        unfinishedTurn: own ? resumeFrom.unfinishedTurn?.agentState : undefined,
      });
      return yield* makeSession({
        id,
        agent: agent.id,
        agentSession,
        history,
        unfinishedTurn: resumeFrom?.unfinishedTurn,
      });
    }),
  });
};

/**
 * Why `agent` cannot work in `sandbox`, or nothing when it can: it requires a sandbox and has none,
 * or listens on ports the sandbox was not created with.
 */
const sandboxRefusal = (
  agent: Agent,
  sandbox: Sandbox.Sandbox["Service"] | undefined,
): string | undefined => {
  if (sandbox === undefined) {
    return agent.requiresSandbox ? `${agent.id} works in a sandbox` : undefined;
  }
  const missing = (agent.ports ?? []).filter((port) => !sandbox.ports.includes(port));
  return missing.length === 0
    ? undefined
    : `${agent.id} listens on ports ${missing.join(", ")}, which the sandbox was not created with`;
};

/** A harness over `agent`, for programs that run one agent. */
export const layer = (agent: Agent): Layer.Layer<Harness> => Layer.succeed(Harness, make(agent));
