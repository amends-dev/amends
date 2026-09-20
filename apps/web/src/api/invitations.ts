import type { Invitation, Workspace } from "@amends/core/workspace";
import { Effect } from "effect";
import { Reactivity } from "effect/unstable/reactivity";
import { ApiClient } from "./client.ts";
import { keys } from "./keys.ts";

export const list = (workspaceId: Workspace.Id) =>
  ApiClient.query("invitations", "list", {
    params: { workspaceId },
    reactivityKeys: [keys.workspace(workspaceId), keys.invitations.list(workspaceId)],
  });
export const makeIssue = () =>
  ApiClient.runtime.fn(
    Effect.fn("Invitations.issue")(function* (input: {
      workspaceId: Workspace.Id;
      payload: Invitation.IssueInput;
    }) {
      const client = yield* ApiClient;
      return yield* client.invitations
        .issue({ params: { workspaceId: input.workspaceId }, payload: input.payload })
        .pipe(Reactivity.mutation([keys.invitations.list(input.workspaceId), keys.me.workspaces]));
    }),
  );
type Target = { workspaceId: Workspace.Id; invitationId: Invitation.Id };
export const makeRevoke = () =>
  ApiClient.runtime.fn(
    Effect.fn("Invitations.revoke")(function* (params: Target) {
      const client = yield* ApiClient;
      return yield* client.invitations
        .revoke({ params })
        .pipe(Reactivity.mutation([keys.invitations.list(params.workspaceId), keys.me.workspaces]));
    }),
  );
export const makeAccept = () =>
  ApiClient.runtime.fn(
    Effect.fn("Invitations.accept")(function* (params: Target) {
      const client = yield* ApiClient;
      const member = yield* client.invitations.accept({ params });
      yield* Reactivity.invalidate([
        keys.members.list(params.workspaceId),
        keys.members.get(params.workspaceId, member.id),
        keys.invitations.list(params.workspaceId),
        keys.me.workspaces,
      ]);
      return member;
    }),
  );
export * as Invitations from "./invitations.ts";
