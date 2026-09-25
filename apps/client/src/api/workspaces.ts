import { ApiErrors } from "@amends/api-http";
import { Cause, Effect, Schema } from "effect";
import type { ApiClient } from "./client.ts";
import { WorkspaceDirectory } from "./contracts.ts";
import { directoryQuery } from "./directory.ts";
import { refreshResult } from "./refresh.ts";
import { requestAtom } from "./request.ts";

export type CreatedWorkspace = WorkspaceDirectory.Membership["workspace"];
export const isWorkspaceName = Schema.is(
  WorkspaceDirectory.Membership.to.fields.workspace.fields.name,
);
export const newWorkspaceRequestKey = () =>
  Schema.decodeSync(ApiErrors.requestKey["idempotency-key"])(crypto.randomUUID());
export type WorkspaceRequest =
  | {
      readonly kind: "create";
      readonly name: string;
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | { readonly kind: "refresh" };

export function workspaceRejection(
  cause: Cause.Cause<unknown>,
): "invalid-name" | "denied" | "request-reused" | "request-failed" {
  for (const reason of cause.reasons) {
    if (!Cause.isFailReason(reason)) continue;
    if (Schema.is(ApiErrors.InvalidInput)(reason.error)) return "invalid-name";
    if (Schema.is(ApiErrors.HumanRequired)(reason.error)) return "denied";
    if (Schema.is(ApiErrors.RequestReused)(reason.error)) return "request-reused";
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
        payload: { name: input.name },
        headers: { "idempotency-key": input.key },
      });
    }),
  );
