/**
 * The `invitations` endpoint group: inviting people into the workspace a member's request names, by
 * address. Its endpoints call `InvitationService`: `list`, `issue`, and `revoke`. Each needs active
 * membership and `invitation.manage`, and the role an invitation gives follows the delegation
 * rules; issuing resolves the address to its account first, creating one the first time. Its
 * recipient accepts it through the `workspaces` group, not yet a member. `InvitationsHandlers`
 * implements it.
 *
 * @since 0.1.0
 */
import * as Accounts from "@amends-dev/gateway/Accounts";
import { Invitation } from "@amends-dev/core/workspace";
import * as Schema from "effect/Schema";
import * as HttpApiEndpoint from "effect/http-api/HttpApiEndpoint";
import * as HttpApiGroup from "effect/http-api/HttpApiGroup";
import * as HttpApiSchema from "effect/http-api/HttpApiSchema";
import * as Authentication from "./Authentication.ts";
import * as WorkspaceMember from "./WorkspaceMember.ts";
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
 * Invitation listing, issuance, and revocation within the member's workspace.
 *
 * @category models
 * @since 0.1.0
 */
export class InvitationsGroup extends HttpApiGroup.make("invitations")
  .add(
    HttpApiEndpoint.get("list", "/", {
      success: Schema.Array(Invitation.Invitation),
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.post("issue", "/", {
      headers: ApiErrors.requestKey,
      payload: IssueInput,
      success: Invitation.Invitation.pipe(HttpApiSchema.status(201)).annotate({
        identifier: "IssuedWorkspaceInvitation",
      }),
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
    HttpApiEndpoint.post("revoke", "/:invitationId/revoke", {
      params: { invitationId: Invitation.Id },
      success: Invitation.Invitation,
      error: [...ApiErrors.workspace, ...ApiErrors.delegation],
    }),
  )
  .middleware(WorkspaceMember.WorkspaceMember)
  .middleware(Authentication.Authentication)
  .prefix("/invitations") {}
