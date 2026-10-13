/**
 * The server's side of the contract's `WorkspaceMember`: each request enters the workspace its
 * `Amends-Workspace` header names through `Gateway.asMember`, as the principal `Authentication`
 * resolved, and its handler runs there. Logs and spans name the workspace, since the URL does not,
 * and responses vary by the header. `Routes.layerHandlers` provides `layer` to every group's
 * handlers.
 */
import { CoreError } from "@amends-dev/core/error";
import { Workspace } from "@amends-dev/core/workspace";
import { Gateway } from "@amends-dev/gateway";
import { Effect, Layer, Option, Schema } from "effect";
import { Headers, HttpServerRequest, HttpServerResponse } from "effect/http";
import { Principal } from "../Authentication.ts";
import { header, WorkspaceMember } from "../WorkspaceMember.ts";

const decodeWorkspaceId = Schema.decodeUnknownOption(Workspace.Id);

/** A member's request that names no workspace, or no valid one. */
const unnamed = new CoreError.Invalid({
  reason: new CoreError.Malformed({
    description: `A member's request names its workspace in the ${header} header`,
  }),
});

/** Enter the request's workspace as its principal, through the host's gateway. */
export const layer = Layer.effect(
  WorkspaceMember,
  Gateway.Gateway.useSync((gateway) =>
    WorkspaceMember.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const workspaceId = Option.flatMap(Headers.get(request.headers, header), decodeWorkspaceId);
        if (Option.isNone(workspaceId)) return yield* unnamed;
        const principal = yield* Principal;
        const response = yield* gateway
          .asMember(workspaceId.value, principal, httpEffect)
          .pipe(
            Effect.annotateLogs("workspaceId", workspaceId.value),
            Effect.annotateSpans("workspaceId", workspaceId.value),
          );
        return HttpServerResponse.setHeader(response, "vary", header);
      }),
    ),
  ),
);
