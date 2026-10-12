/**
 * The middleware every endpoint a workspace member calls declares: the request acts as the
 * principal's membership in the workspace its path names. A server enters that workspace as the
 * `Principal` that `Authentication` resolved and runs the handler there, with core's operations and
 * the `Actor`, so a handler calls the core service it is named for. A principal with no active
 * membership is `CoreError.Denied` (`NotMember`). Clients implement nothing for it.
 *
 * @since 0.1.0
 */
import type * as Core from "@amends-dev/core";
import type { Actor } from "@amends-dev/core/identity";
import { HttpApiMiddleware } from "effect/http-api";
import * as ApiErrors from "./ApiErrors.ts";
import type { Principal } from "./Authentication.ts";

/**
 * Runs an endpoint as the principal's membership in the workspace its path's `workspaceId` names,
 * providing core's operations and the actor. Declare it before `Authentication`, which runs first
 * and provides the `Principal` it requires.
 *
 * @category services
 * @since 0.1.0
 */
export class WorkspaceMember extends HttpApiMiddleware.Service<
  WorkspaceMember,
  { provides: Core.Operations | Actor.Actor; requires: Principal }
>()("@amends-dev/http/WorkspaceMember", { error: ApiErrors.Denied }) {}
