/**
 * The server's side of the contract's `WorkspaceMember`: each request enters the workspace its path
 * names through `Gateway.asMember`, as the principal `Authentication` resolved, and its handler runs
 * there. `Routes.layerHandlers` provides `layer` to every group's handlers.
 */
import { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect, Layer, Schema } from "effect";
import { HttpRouter } from "effect/http";
import { Principal } from "../Authentication.ts";
import { WorkspaceMember } from "../WorkspaceMember.ts";

const decodeWorkspaceId = Schema.decodeUnknownEffect(Workspace.Id);

/** Enter the request's workspace as its principal, through the host's gateway. */
export const layer = Layer.effect(
  WorkspaceMember,
  Gateway.Gateway.useSync((gateway) =>
    WorkspaceMember.of((httpEffect) =>
      Effect.gen(function* () {
        const route = yield* HttpRouter.RouteContext;
        // Every route that declares the middleware has `workspaceId` in its path.
        const workspaceId = yield* Effect.orDie(decodeWorkspaceId(route.params["workspaceId"]));
        const principal = yield* Principal;
        return yield* gateway.asMember(workspaceId, principal, httpEffect);
      }),
    ),
  ),
);
