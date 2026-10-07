import type * as Core from "@amends/core";
import type { Workspace } from "@amends/core/workspace";
import { Gateway } from "@amends/gateway";
import { Effect, type Scope } from "effect";

/**
 * Run `program` in the workspace with what core gives a host's jobs, holding the workspace only
 * while it runs.
 */
export const inWorkspace = <A, E>(
  workspaceId: Workspace.Id,
  program: Effect.Effect<A, E, Core.JobServices | Scope.Scope>,
) =>
  Effect.flatMap(Gateway.Service, (gateway) =>
    Effect.scoped(gateway.inWorkspace(workspaceId, program)),
  );
