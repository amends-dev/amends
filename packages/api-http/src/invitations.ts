import { Invitation, Member, Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import { ApiErrors } from "./errors.ts";

const invitation = [
  ...ApiErrors.delegation,
  ApiErrors.InvitationNotFound,
  ApiErrors.NotRecipient,
  ApiErrors.AlreadyMember,
  ApiErrors.InvitationUnavailable,
  ApiErrors.InvitationInvalidExpiry,
] as const;

/** Invitation issuance, acceptance, and revocation within one workspace. */
export class InvitationsGroup extends HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Invitation.Record),
      error: [...ApiErrors.member, ...invitation],
    }),
    HttpApiEndpoint.post("issue", "/", {
      params: { workspaceId: Workspace.Id },
      payload: Invitation.IssueInput,
      success: Invitation.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "IssuedWorkspaceInvitation",
      }),
      error: [...ApiErrors.member, ...invitation],
    }),
    HttpApiEndpoint.post("accept", "/:invitationId/accept", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      success: Member.Record,
      error: [
        ApiErrors.HumanRequired,
        ApiErrors.WorkspaceNotFound,
        ...ApiErrors.workspace,
        ...invitation,
      ],
    }),
    HttpApiEndpoint.post("revoke", "/:invitationId/revoke", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      success: Invitation.Record,
      error: [...ApiErrors.member, ...invitation],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/invitations") {}
