import { Accounts } from "@amends-dev/gateway/accounts";
import { Invitation, Member, Workspace } from "@amends-dev/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/http-api";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

/**
 * An invitation to issue: the address it goes to, which the host resolves to that address's
 * account, the role the recipient joins with, and when it expires.
 */
const IssueInput = Schema.Struct({
  email: Accounts.Email,
  roleId: Invitation.IssueInput.fields.roleId,
  expiresAt: Invitation.IssueInput.fields.expiresAt,
}).annotate({ identifier: "WorkspaceInvitationIssueInput" });

/** Invitation issuance, acceptance, and revocation within one workspace. */
export class InvitationsGroup extends HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Invitation.Record),
      error: [...ApiErrors.member, ...ApiErrors.invitation],
    }),
    HttpApiEndpoint.post("issue", "/", {
      params: { workspaceId: Workspace.Id },
      headers: ApiErrors.requestKey,
      payload: IssueInput,
      success: Invitation.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "IssuedWorkspaceInvitation",
      }),
      error: [...ApiErrors.member, ...ApiErrors.invitation],
    }),
    HttpApiEndpoint.post("accept", "/:invitationId/accept", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      // What the recipient wants people in the workspace to call them.
      payload: Schema.Struct({ name: Member.NewName }),
      success: Member.Record,
      error: [
        ApiErrors.HumanRequired,
        ApiErrors.WorkspaceNotFound,
        ...ApiErrors.workspace,
        ...ApiErrors.invitation,
      ],
    }),
    HttpApiEndpoint.post("revoke", "/:invitationId/revoke", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      success: Invitation.Record,
      error: [...ApiErrors.member, ...ApiErrors.invitation],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/invitations") {}
