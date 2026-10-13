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
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Option from "effect/Option";
import * as Schema from "effect/Schema";
import * as Headers from "effect/http/Headers";
import * as HttpServerRequest from "effect/http/HttpServerRequest";
import * as HttpServerResponse from "effect/http/HttpServerResponse";
import * as Authentication from "../Authentication.ts";
import * as WorkspaceMember from "../WorkspaceMember.ts";

const decodeWorkspaceId = Schema.decodeUnknownOption(Workspace.Id);

/** A member's request that names no workspace, or no valid one. */
const unnamed = new CoreError.Invalid({
  reason: new CoreError.Malformed({
    description: `A member's request names its workspace in the ${WorkspaceMember.header} header`,
  }),
});

/** Enter the request's workspace as its principal, through the host's gateway. */
export const layer = Layer.effect(
  WorkspaceMember.WorkspaceMember,
  Gateway.Gateway.useSync((gateway) =>
    WorkspaceMember.WorkspaceMember.of((httpEffect) =>
      Effect.gen(function* () {
        const request = yield* HttpServerRequest.HttpServerRequest;
        const workspaceId = Option.flatMap(
          Headers.get(request.headers, WorkspaceMember.header),
          decodeWorkspaceId,
        );
        if (Option.isNone(workspaceId)) return yield* unnamed;
        const principal = yield* Authentication.Principal;
        const response = yield* gateway
          .asMember(workspaceId.value, principal, httpEffect)
          .pipe(
            Effect.annotateLogs("workspaceId", workspaceId.value),
            Effect.annotateSpans("workspaceId", workspaceId.value),
          );
        return HttpServerResponse.setHeader(response, "vary", WorkspaceMember.header);
      }),
    ),
  ),
);
