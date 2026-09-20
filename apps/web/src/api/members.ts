import type { Member, Workspace } from "@amends/core/workspace";
import { Effect } from "effect";
import { Reactivity } from "effect/unstable/reactivity";
import { ApiClient } from "./client.ts";
import { keys } from "./keys.ts";

export const list = (workspaceId: Workspace.Id) =>
  ApiClient.query("members", "list", {
    params: { workspaceId },
    reactivityKeys: [keys.workspace(workspaceId), keys.members.list(workspaceId)],
  });
export const get = (workspaceId: Workspace.Id, memberId: Member.Id) =>
  ApiClient.query("members", "get", {
    params: { workspaceId, memberId },
    reactivityKeys: [keys.workspace(workspaceId), keys.members.get(workspaceId, memberId)],
  });
export const makeRemove = () =>
  ApiClient.runtime.fn(
    Effect.fn("Members.remove")(function* (params: {
      workspaceId: Workspace.Id;
      memberId: Member.Id;
    }) {
      const client = yield* ApiClient;
      return yield* client.members
        .remove({ params })
        .pipe(
          Reactivity.mutation([
            keys.members.list(params.workspaceId),
            keys.members.get(params.workspaceId, params.memberId),
            keys.invitations.list(params.workspaceId),
            keys.me.workspaces,
          ]),
        );
    }),
  );
export * as Members from "./members.ts";
