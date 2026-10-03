/**
 * A harness runs one agent in sandboxes: it starts sessions with the agent and resumes sessions that
 * any agent ran before, so callers do not depend on which agent works for them. `make` builds one
 * from an agent's adapter, as `LanguageModel.make` builds a language model from a provider's.
 *
 * The caller creates the sandbox, from the harness's `template`, and owns it: a harness never
 * stops or destroys a sandbox. Each session works in its own directory there, named by its id, so
 * that its files stay in place when the session moves from one agent to another.
 */
import { Sandbox, type Template } from "@amends/sandbox-v2";
import { Context, Effect, FileSystem, Layer, Path } from "effect";
import { Prompt } from "effect/ai";
import type { Agent, SessionId } from "./Agent.ts";
import { HarnessError, UnknownError } from "./HarnessError.ts";
import * as Session from "./Session.ts";

export interface StartSessionOptions {
  /** The sandbox the agent works in, created from the harness's `template`. */
  readonly sandbox: Sandbox.Sandbox["Service"];

  readonly id: SessionId;
}

export interface ResumeSessionOptions {
  /**
   * The sandbox the agent works in. A sandbox other than the one the session last ran in has the
   * conversation but not the files the session made.
   */
  readonly sandbox: Sandbox.Sandbox["Service"];

  /** What `suspend`, `detach`, or `stop` returned, on this harness's agent or any other. */
  readonly state: Session.SessionState;
}

export class Harness extends Context.Service<
  Harness,
  {
    /** The agent the harness runs, such as `opencode`. */
    readonly agent: string;

    /** Installs the agent in a sandbox. Absent for an agent that runs in the host's process. */
    readonly template?: Template.Template;

    /** Starts a new session. */
    readonly startSession: (
      options: StartSessionOptions,
    ) => Effect.Effect<Session.Session, HarnessError>;

    /**
     * Picks up a session where `state` left it. The agent that last ran the session resumes from its
     * own state. Any other agent loads the conversation instead, and runs an unfinished turn again.
     */
    readonly resumeSession: (
      options: ResumeSessionOptions,
    ) => Effect.Effect<Session.Session, HarnessError>;
  }
>()("@amends/harness-v2/Harness") {}

export const make = (agent: Agent): Harness["Service"] => {
  /** Creates the session's directory in the sandbox, if it does not exist yet. */
  const makeWorkingDirectory = (
    method: string,
    sandbox: Sandbox.Sandbox["Service"],
    id: SessionId,
  ) =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const workingDirectory = path.join(sandbox.workingDirectory, id);
      yield* fs.makeDirectory(workingDirectory, { recursive: true });
      return workingDirectory;
    }).pipe(
      Effect.provide(Sandbox.layerServices(sandbox)),
      Effect.mapError(
        (cause) =>
          new HarnessError({
            harness: agent.id,
            method,
            reason: new UnknownError({ description: cause.message }),
            cause,
          }),
      ),
    );

  return Harness.of({
    agent: agent.id,
    template: agent.template,

    startSession: Effect.fn("Harness.startSession")(function* ({ sandbox, id }) {
      const workingDirectory = yield* makeWorkingDirectory("startSession", sandbox, id);
      const agentSession = yield* agent.start({
        id,
        sandbox,
        workingDirectory,
        history: Prompt.empty,
      });
      return yield* Session.make({
        id,
        agent: agent.id,
        agentSession,
        history: Prompt.empty,
        unfinishedTurn: undefined,
      });
    }),

    resumeSession: Effect.fn("Harness.resumeSession")(function* ({ sandbox, state }) {
      const workingDirectory = yield* makeWorkingDirectory("resumeSession", sandbox, state.id);
      const { agentState, unfinishedTurn } = stateFor(agent.id, state);
      const agentSession = yield* agent.start({
        id: state.id,
        sandbox,
        workingDirectory,
        history: state.history,
        resume: agentState,
        unfinishedTurn: unfinishedTurn?.agentState,
      });
      return yield* Session.make({
        id: state.id,
        agent: agent.id,
        agentSession,
        history: state.history,
        unfinishedTurn,
      });
    }),
  });
};

/** A harness over `agent`, for programs that run one agent. */
export const layer = (agent: Agent): Layer.Layer<Harness> => Layer.succeed(Harness, make(agent));

/**
 * What of `state` the agent `agentId` can use. An agent's own state means something only to the
 * agent that wrote it, so any other agent gets the unfinished turn's prompt alone.
 */
const stateFor = (agentId: string, state: Session.SessionState) => {
  const own = state.agent === agentId;
  return {
    agentState: own ? state.agentState : undefined,
    unfinishedTurn:
      state.unfinishedTurn === undefined
        ? undefined
        : {
            prompt: state.unfinishedTurn.prompt,
            agentState: own ? state.unfinishedTurn.agentState : undefined,
          },
  };
};
