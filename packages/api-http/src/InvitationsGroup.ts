/**
 * The `invitations` endpoint group: inviting people into a workspace by address. Its endpoints call
 * `InvitationService`: `list`, `issue`, `accept`, and `revoke`. Listing, issuing, and revoking need
 * active membership and `invitation.manage`, and the role an invitation gives follows the
 * delegation rules; issuing resolves the address to its account first, creating one the first
 * time. Accepting is for the recipient, a person not yet a member, so it enters the workspace
 * without an actor and answers `ApiErrors.WorkspaceNotFound` for a workspace never created.
 * `InvitationsHandlers` in `@amends-dev/server-http` implements it.
 *
 * @since 0.1.0
 */
import * as Accounts from "@amends-dev/gateway/Accounts";
import { Invitation, Member, Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./Authentication.ts";
import * as ApiErrors from "./ApiErrors.ts";

/**
 * An invitation to issue: the address it goes to, which the host resolves to that address's
 * account, the role the recipient joins with, and when it expires.
 */
const IssueInput = Schema.Struct({
  email: Accounts.Email,
  roleId: Invitation.IssueInput.fields.roleId,
  expiresAt: Invitation.IssueInput.fields.expiresAt,
}).annotate({ identifier: "WorkspaceInvitationIssueInput" });

/**
 * Invitation listing, issuance, acceptance, and revocation within one workspace.
 *
 * @category models
 * @since 0.1.0
 */
export class InvitationsGroup extends HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Invitation.Invitation),
      error: [...ApiErrors.member, ...ApiErrors.invitation],
    }),
    HttpApiEndpoint.post("issue", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: IssueInput,
      success: Invitation.Invitation.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "IssuedWorkspaceInvitation",
      }),
      error: [...ApiErrors.member, ...ApiErrors.invitation],
    }),
    HttpApiEndpoint.post("accept", "/:invitationId/accept", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      // What the recipient wants people in the workspace to call them.
      payload: Schema.Struct({ name: Member.NewName }),
      success: Member.Member,
      error: [
        ApiErrors.HumanRequired,
        ApiErrors.WorkspaceNotFound,
        ...ApiErrors.workspace,
        ...ApiErrors.invitation,
      ],
    }),
    HttpApiEndpoint.post("revoke", "/:invitationId/revoke", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      success: Invitation.Invitation,
      error: [...ApiErrors.member, ...ApiErrors.invitation],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/invitations") {}
