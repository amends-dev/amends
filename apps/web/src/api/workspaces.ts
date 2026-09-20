import { Effect } from "effect";
import type { Ownership, Workspace } from "@amends/core/workspace";
import { Reactivity } from "effect/unstable/reactivity";
import { ApiClient } from "./client.ts";
import { keys } from "./keys.ts";
export const makeCreate = () =>
  ApiClient.runtime.fn(
    Effect.fn("Workspaces.create")(function* (payload: Workspace.CreateInput) {
      const client = yield* ApiClient;
      return yield* client.workspaces
        .create({ payload })
        .pipe(Reactivity.mutation([keys.me.workspaces]));
    }),
  );
export const ownership = (workspaceId: Workspace.Id) =>
  ApiClient.query("workspaces", "ownership", {
    params: { workspaceId },
    reactivityKeys: [
      keys.workspace(workspaceId),
      keys.ownership(workspaceId),
      keys.access(workspaceId),
      keys.members.list(workspaceId),
    ],
  });
export const makeTransferOwnership = () =>
  ApiClient.runtime.fn(
    Effect.fn("Workspaces.transferOwnership")(function* (input: {
      workspaceId: Workspace.Id;
      payload: Ownership.TransferInput;
    }) {
      const client = yield* ApiClient;
      return yield* client.workspaces
        .transferOwnership({ params: { workspaceId: input.workspaceId }, payload: input.payload })
        .pipe(
          Reactivity.mutation([
            keys.ownership(input.workspaceId),
            keys.access(input.workspaceId),
            keys.members.list(input.workspaceId),
            keys.invitations.list(input.workspaceId),
            keys.me.workspaces,
          ]),
        );
    }),
  );
export * as Workspaces from "./workspaces.ts";
