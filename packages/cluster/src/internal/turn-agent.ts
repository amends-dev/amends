/**
 * Starting the session of the agent a turn runs, built from the connections core gives as
 * `AgentQuery.Runnable` with the integrations the host installs: its harness, on its model, and
 * the sandbox the session works in, if the agent has one. `TurnRunner` calls `startSession` as each
 * run of a turn begins.
 */
import { Integrations } from "@amends-dev/connection";
import type { AgentQuery } from "@amends-dev/core/agent";
import type { Connection } from "@amends-dev/core/connection";
import type { Agent, Session } from "@amends-dev/harness";
import { Sandbox } from "@amends-dev/sandbox";
import { Effect } from "effect";
import type * as SessionLogWriter from "./session-log-writer.ts";

/**
 * The session a turn's agent started, and the agent's id, which what the session resumes from
 * names.
 */
export interface Started {
  readonly session: Session.Session;
  readonly agent: string;
}

/** A connection's key, as its integration takes it. */
const credentialOf = (access: Connection.Access) => access.credential ?? undefined;

// TODO: Stop a session's sandbox once its agent has been idle there for a while, and destroy it
// once the participation ends; sandboxes are left running between turns.
/**
 * Start the session `sessionId` of the agent `runnable` describes, from what `opening` says it
 * starts from: build the agent's harness on its model, resume the sandbox named for the session
 * when the agent has one, and create the session, anew with the conversation so far or from what
 * an earlier one left. It fails with the `ConnectionError`, `SandboxError`, or `HarnessError` of
 * what it could not build or reach, for which `TurnRunner` fails the turn.
 */
export const startSession = Effect.fn("TurnAgent.startSession")(function* (
  runnable: AgentQuery.Runnable,
  sessionId: Agent.SessionId,
  opening: SessionLogWriter.Opening,
) {
  const integrations = yield* Integrations.Integrations;
  const { model } = runnable;
  const modelIntegration = yield* integrations.find(model.connection.integration);
  const endpoint = yield* modelIntegration.modelEndpoint(model.connection, credentialOf(model), {
    model: model.model.id,
    ...(model.model.effort === undefined ? {} : { effort: model.model.effort }),
  });
  const harnessIntegration = yield* integrations.find(runnable.harness.connection.integration);
  const harness = yield* harnessIntegration.harness(
    runnable.harness.connection,
    credentialOf(runnable.harness),
    { model: endpoint },
  );
  const sandbox =
    runnable.sandbox === null
      ? undefined
      : yield* resumeSandbox(runnable.sandbox, sessionId, harness.agent.template);
  const { history, resumeFrom } = opening;
  const session = yield* harness.createSession({
    ...(sandbox === undefined ? {} : { sandbox }),
    ...(resumeFrom === undefined ? { id: sessionId, history } : { resumeFrom }),
  });
  const started: Started = { session, agent: harness.agent.id };
  return started;
});

/**
 * The sandbox named for the session, which `access` reaches: resumed, or created from `template`
 * when it does not exist yet, for the scope.
 */
const resumeSandbox = Effect.fnUntraced(function* (
  access: Connection.Access,
  sessionId: Agent.SessionId,
  template: Agent.Agent["template"],
) {
  const integrations = yield* Integrations.Integrations;
  const sandboxIntegration = yield* integrations.find(access.connection.integration);
  const sandboxProvider = yield* sandboxIntegration.sandboxProvider(
    access.connection,
    credentialOf(access),
  );
  const id = Sandbox.SandboxId.make(sessionId);
  return yield* sandboxProvider
    .resume(id)
    .pipe(
      Effect.catchReason("SandboxError", "NotFoundError", () =>
        sandboxProvider.create({ id, ...(template === undefined ? {} : { template }) }),
      ),
    );
});
