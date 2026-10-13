/**
 * The middleware every endpoint a workspace member calls declares: the request acts as the
 * principal's membership in the workspace its `Amends-Workspace` header names, so no path names
 * the workspace and an endpoint's routes are core's operations for one workspace. A server enters
 * that workspace as the `Principal` that `Authentication` resolved and runs the handler there, with
 * core's operations and the `Actor`, so a handler calls the core service it is named for. A request
 * without the header, or with one that holds no workspace ID, is `CoreError.Invalid`
 * (`Malformed`); a principal with no active membership is `CoreError.Denied` (`NotMember`). A
 * client provides `layerClient` with the workspace it acts in, which sets the header, or
 * `layerClientOutsideWorkspace` when it calls no member's endpoint.
 *
 * @since 0.1.0
 */
import type * as Core from "@amends-dev/core";
import type { Actor } from "@amends-dev/core/identity";
import type { Workspace } from "@amends-dev/core/workspace";
import * as Effect from "effect/Effect";
import * as HttpClientRequest from "effect/http/HttpClientRequest";
import * as HttpApiMiddleware from "effect/http-api/HttpApiMiddleware";
import * as ApiErrors from "./ApiErrors.ts";
import type * as Authentication from "./Authentication.ts";

/**
 * The header that names the workspace a member's request acts in.
 *
 * @category utils
 * @since 0.1.0
 */
export const header = "Amends-Workspace";

/**
 * Runs an endpoint as the principal's membership in the workspace the `Amends-Workspace` header
 * names, providing core's operations and the actor. Declare it before `Authentication`, which runs
 * first and provides the `Principal` it requires. Clients must provide `layerClient`.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceMember extends HttpApiMiddleware.Service<
  WorkspaceMember,
  { provides: Core.Operations | Actor.Actor; requires: Authentication.Principal }
>()("@amends-dev/http/WorkspaceMember", {
  error: [ApiErrors.Denied, ApiErrors.Invalid],
  requiredForClient: true,
}) {}

/**
 * The client's side of `WorkspaceMember`: each request to an endpoint that declares it names
 * `workspaceId` in the `Amends-Workspace` header.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerClient = (workspaceId: Workspace.Id) =>
  HttpApiMiddleware.layerClient(WorkspaceMember, ({ next, request }) =>
    next(HttpClientRequest.setHeader(request, header, workspaceId)),
  );

/**
 * The client's side of `WorkspaceMember` for a client in no workspace, such as one that signs in or
 * creates a workspace: a request to an endpoint that declares it is a defect.
 *
 * @category layers
 * @since 0.1.0
 */
export const layerClientOutsideWorkspace = HttpApiMiddleware.layerClient(
  WorkspaceMember,
  ({ endpoint, group }) =>
    Effect.die(
      `${group.identifier}.${endpoint.identifier} acts in a workspace; call it through that workspace's client`,
    ),
);
