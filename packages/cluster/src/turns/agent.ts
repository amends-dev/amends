/**
 * The agent a turn runs, built from the connections core gives as `AgentQuery.Runnable` with the
 * integrations the host installs: its harness, on its model, and the sandbox its session works in,
 * if it has one.
 */
import { Integrations } from "@amends/connection";
import type { AgentQuery } from "@amends/core/agent";
import { Sandbox } from "@amends/sandbox";
import { Effect } from "effect";

/** A connection's key, as its integration takes it. */
const credentialOf = (access: AgentQuery.Access) => access.credential ?? undefined;

// TODO: Stop a session's sandbox once its agent has been idle there for a while, and destroy it
// once the participation ends; sandboxes are left running between turns.
/**
 * Build the agent's harness on its model, and resume the sandbox named for the session, or create
 * it from the harness's template when it does not exist yet, for the scope.
 */
export const open = Effect.fn("TurnAgent.open")(function* (
  runnable: AgentQuery.Runnable,
  sessionId: string,
) {
  const integrations = yield* Integrations.Integrations;
  const { model } = runnable;
  const endpoint = yield* Effect.flatMap(
    integrations.find(model.connection.integration),
    (integration) =>
      integration.modelEndpoint(model.connection, credentialOf(model), {
        model: model.model.id,
        ...(model.model.effort === undefined ? {} : { effort: model.model.effort }),
      }),
  );
  const harness = yield* Effect.flatMap(
    integrations.find(runnable.harness.connection.integration),
    (integration) =>
      integration.harness(runnable.harness.connection, credentialOf(runnable.harness), {
        model: endpoint,
      }),
  );
  if (runnable.sandbox === null) return { harness, sandbox: undefined };
  const access = runnable.sandbox;
  const sandboxProvider = yield* Effect.flatMap(
    integrations.find(access.connection.integration),
    (integration) => integration.sandboxProvider(access.connection, credentialOf(access)),
  );
  const id = Sandbox.SandboxId.make(sessionId);
  const sandbox = yield* sandboxProvider.resume(id).pipe(
    Effect.catchReason("SandboxError", "NotFoundError", () =>
      sandboxProvider.create({
        id,
        ...(harness.agent.template === undefined ? {} : { template: harness.agent.template }),
      }),
    ),
  );
  return { harness, sandbox };
});

export * as TurnAgent from "./agent.ts";
