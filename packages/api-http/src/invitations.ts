import { Invitation, Member, Workspace } from "@amends/core/workspace";
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { Authentication } from "./authentication.ts";
import * as Errors from "./errors.ts";

const invitation = [
  Errors.InvitationNotFound,
  Errors.NotRecipient,
  Errors.NotOwner,
  Errors.AlreadyMember,
  Errors.Unavailable,
  Errors.InvalidExpiry,
] as const;

/** Invitation issuance, acceptance, and revocation within one workspace. */
export class InvitationsGroup extends HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/", {
      params: { workspaceId: Workspace.Id },
      success: Schema.Array(Invitation.Record),
      error: [...Errors.member, ...invitation],
    }),
    HttpApiEndpoint.post("issue", "/", {
      params: { workspaceId: Workspace.Id },
      payload: Invitation.IssueInput,
      success: Invitation.Record.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "IssuedWorkspaceInvitation",
      }),
      error: [...Errors.member, ...invitation],
    }),
    HttpApiEndpoint.post("accept", "/:invitationId/accept", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      success: Member.Record,
      error: [Errors.HumanRequired, ...Errors.workspace, ...invitation],
    }),
    HttpApiEndpoint.post("revoke", "/:invitationId/revoke", {
      params: { workspaceId: Workspace.Id, invitationId: Invitation.Id },
      success: Invitation.Record,
      error: [...Errors.member, ...invitation],
    }),
    HttpApiEndpoint.post("enable", "/enable", {
      params: { workspaceId: Workspace.Id },
      success: HttpApiSchema.NoContent,
      error: [...Errors.member, Errors.NotWorkspaceOwner],
    }),
  )
  .middleware(Authentication)
  .prefix("/workspaces/:workspaceId/invitations") {}
