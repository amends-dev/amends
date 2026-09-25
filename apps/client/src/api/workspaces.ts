import { ApiErrors } from "@amends/api-http";
import { Cause, Effect, Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { WorkspaceDirectory } from "./contracts.ts";
import { directoryQuery } from "./directory.ts";

export type CreatedWorkspace = WorkspaceDirectory.Membership["workspace"];
export const isWorkspaceName = Schema.is(
  WorkspaceDirectory.Membership.to.fields.workspace.fields.name,
);
export const newWorkspaceRequestKey = () =>
  Schema.decodeSync(ApiErrors.requestKey["idempotency-key"])(crypto.randomUUID());
export type WorkspaceRequest =
  | {
      readonly attempt: number;
      readonly kind: "create";
      readonly name: string;
      readonly key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | { readonly attempt: number; readonly kind: "refresh" };

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

/** One private operation atom, sharing the credential's directory query and HTTP runtime. */
export const createWorkspaceRequest = (client: ApiClient) =>
  client.runtime
    .fn<WorkspaceRequest>()(
      Effect.fn("Client.Workspace.request")(function* (request, get) {
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            if (request.kind === "create") {
              const api = yield* client;
              return yield* api.workspaces.create({
                payload: { name: request.name },
                headers: { "idempotency-key": request.key },
              });
            }
            const query = directoryQuery(client);
            get.refresh(query);
            yield* get.result(query, { suspendOnWaiting: true });
            return undefined;
          }),
        );
        return { attempt: request.attempt, exit };
      }),
    )
    .pipe(Atom.setIdleTTL(0));
