/**
 * The `workspaces` endpoint group: what a person does with a workspace before they are its member,
 * creating one or accepting an invitation into one. Neither enters a workspace as a member, so
 * the workspace is in the path where there is one. `create` goes through the gateway's
 * `createWorkspace` for the authenticated person; any entitlement check is the host's.
 * `acceptInvitation` is for the invitation's recipient: it enters the workspace without an actor
 * and calls `InvitationService.accept`, answering `ApiErrors.NotFound` for a workspace never
 * created. An agent gets `ApiErrors.Denied` from both. A member reads and changes their
 * workspace's settings through the `settings` group. `WorkspacesHandlers` implements it.
 *
 * @since 0.1.0
 */

import { Invitation, Member, Workspace, WorkspaceId } from "@amends-dev/core/workspace"
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint"
import * as HttpApiGroup from "effect/http-api/HttpApiGroup"
import * as HttpApiSchema from "effect/http-api/HttpApiSchema"
import * as Schema from "effect/Schema"
import * as ApiErrors from "./ApiErrors.ts"
import * as Authentication from "./Authentication.ts"

/**
 * Workspace creation, and joining one by accepting its invitation. Creation entitlement checks
 * belong to the host.
 *
 * @category models
 * @since 0.1.0
 */
export class WorkspacesGroup extends HttpApiGroup.make("workspaces")
  .add(
    HttpApiEndpoint.post("create", "/", {
      headers: ApiErrors.requestKey,
      payload: Workspace.CreateInput,
      success: Workspace.Workspace.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "CreatedWorkspace"
      }),
      error: [ApiErrors.Denied, ApiErrors.Unavailable, ApiErrors.Uncertain, ApiErrors.Invalid]
    }),
    HttpApiEndpoint.post("acceptInvitation", "/:workspaceId/invitations/:invitationId/accept", {
      params: { workspaceId: WorkspaceId.WorkspaceId, invitationId: Invitation.InvitationId },
      // What the recipient wants people in the workspace to call them.
      payload: Schema.Struct({ name: Member.NewName }),
      success: Member.Member,
      error: [...ApiErrors.workspace, ...ApiErrors.delegation]
    })
  )
  .middleware(Authentication.Authentication)
  .prefix("/workspaces") {}
