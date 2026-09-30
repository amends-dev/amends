import { ApiErrors, Member, Workspace } from "@amends/api-http";
import { Cause, Effect, Schema } from "effect";
import { Reactivity } from "effect/unstable/reactivity";
import { command } from "./failures.ts";
import { directoryKey, workspaceKey } from "./keys.ts";
import type { ApiClient } from "./client.ts";
import { WorkspaceDirectory } from "./contracts.ts";
import { directoryQuery } from "./directory.ts";
import { refreshResult } from "./refresh.ts";
import { requestAtom } from "./request.ts";

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
export type WorkspaceRequest =
  | {
      readonly kind: "create";
      readonly name: string;
      /** What the creator is called there; none shows their identity. */
      readonly memberName?: string;
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | { readonly kind: "refresh" };

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

/** Create a workspace, or refresh the shared directory once one exists. */
export const createWorkspaceRequest = (client: ApiClient) =>
  requestAtom(client, (input: WorkspaceRequest, get) =>
    Effect.gen(function* () {
      if (input.kind === "refresh") {
        yield* refreshResult(get, directoryQuery(client));
        return undefined;
      }
      const api = yield* client;
      return yield* api.workspaces.create({
        payload: {
          name: input.name,
          ...(input.memberName ? { memberName: input.memberName } : {}),
        },
        headers: { "idempotency-key": input.key },
      });
    }),
  );

/**
 * Choose what people in a workspace call the reader, then invalidate the reads that name members
 * and the directory, as the change feed would when the commit arrives.
 */
export const renameSelfRequest = (client: ApiClient, workspace: string) =>
  requestAtom(client, (name: string) =>
    Effect.gen(function* () {
      const api = yield* client;
      const renamed = yield* api.members.rename({
        params: { workspaceId: yield* command(Workspace.Id)(workspace) },
        payload: { name: yield* command(Member.NewName)(name.trim()) },
      });
      yield* Reactivity.invalidate([workspaceKey(workspace, "members"), directoryKey]);
      return renamed;
    }),
  );
