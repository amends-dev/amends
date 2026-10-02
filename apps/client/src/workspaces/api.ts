import { ApiErrors, Invitation, Member, Workspace } from "@amends/api-http";
import { Cause, Effect, Schema } from "effect";
import { Reactivity } from "effect/unstable/reactivity";
import type { Api } from "../api/client.ts";
import { WorkspaceDirectory } from "../api/contracts.ts";
import { command } from "../api/failures.ts";
import { directoryKey, workspaceKey } from "../api/keys.ts";

export type CreatedWorkspace = WorkspaceDirectory.Membership["workspace"];
export const isWorkspaceName = Schema.is(Workspace.NewName);
/**
 * Whether text can name a member: 1 to 80 characters without surrounding space, once trimmed, and
 * without hidden ones.
 */
export const isMemberName = (name: string) => Schema.is(Member.NewName)(name.trim());
/**
 * A first suggestion for what people call someone, from their identity: an email's local part,
 * its first letter capitalized, or nothing when the identity is not an email.
 */
export const suggestedName = (identity: string | undefined) => {
  const local = identity?.includes("@") ? identity.slice(0, identity.indexOf("@")) : "";
  const words = local.split(/[._+-]+/u).filter(Boolean);
  const name = words.map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1)).join(" ");
  return isMemberName(name) ? name : "";
};
export const newWorkspaceRequestKey = () =>
  Schema.decodeSync(ApiErrors.requestKey["idempotency-key"])(crypto.randomUUID());
export interface NewWorkspace {
  readonly name: string;
  /** What the creator is called there; none shows their identity. */
  readonly memberName?: string;
  readonly key: ReturnType<typeof newWorkspaceRequestKey>;
}

export function workspaceRejection(
  cause: Cause.Cause<unknown>,
): "invalid-name" | "denied" | "request-failed" {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    if (Schema.is(ApiErrors.InvalidInput)(reason.error)) return "invalid-name";
    if (Schema.is(ApiErrors.HumanRequired)(reason.error)) return "denied";
  }
  return "request-failed";
}

/** Create a workspace; a retry with the same key returns the first attempt's workspace. */
export const createWorkspace = (api: Api, workspace: NewWorkspace) =>
  api.workspaces.create({
    payload: {
      name: workspace.name,
      ...(workspace.memberName ? { memberName: workspace.memberName } : {}),
    },
    headers: { "idempotency-key": workspace.key },
  });

/**
 * Choose what people in a workspace call the reader, then invalidate the reads that name members
 * and the directory, as the change feed would when the commit arrives.
 */
export const renameSelf = (workspace: string) => (api: Api, name: string) =>
  Effect.gen(function* () {
    const renamed = yield* api.members.rename({
      params: { workspaceId: yield* command(Workspace.Id)(workspace) },
      payload: { name: yield* command(Member.NewName)(name.trim()) },
    });
    yield* Reactivity.invalidate([workspaceKey(workspace, "members"), directoryKey]);
    return renamed;
  });

/** An invitation to accept, with what the member will be called there; none shows the identity. */
export interface Acceptance {
  readonly workspaceId: string;
  readonly invitationId: string;
  readonly name?: string;
}
/** Accept an invitation, joining its workspace. */
export const acceptInvitation = (api: Api, acceptance: Acceptance) =>
  Effect.gen(function* () {
    yield* api.invitations.accept({
      params: {
        workspaceId: yield* command(Workspace.Id)(acceptance.workspaceId),
        invitationId: yield* command(Invitation.Id)(acceptance.invitationId),
      },
      payload: acceptance.name ? { name: yield* command(Member.NewName)(acceptance.name) } : {},
    });
  });
