/**
 * How a member endpoint enters its workspace: as the request's principal, through the gateway,
 * which resolves them into the actor core runs the program as.
 */
import type * as Core from "@amends-dev/core";
import type { Actor } from "@amends-dev/core/identity";
import type { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect } from "effect";
import type { Scope } from "effect";
import * as Authentication from "../Authentication.ts";

/**
 * Capture the gateway once, as a group's handlers are built, and give the function each handler
 * runs its program through: in the workspace as the request's principal, a member of it.
 */
export const makeAsMember = Gateway.Gateway.useSync(
  (gateway) =>
    <A, E, R extends Core.Operations | Actor.Actor | Scope.Scope>(
      workspaceId: Workspace.Id,
      program: Effect.Effect<A, E, R>,
    ) =>
      Effect.flatMap(Authentication.Principal, (principal) =>
        gateway.asMember(workspaceId, principal, program),
      ),
);
