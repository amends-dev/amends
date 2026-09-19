import type { Assignment } from "@amends/core/authorization";
import type { Member, Workspace } from "@amends/core/workspace";
import { Effect } from "effect";
import { Reactivity } from "effect/unstable/reactivity";
import { ApiClient } from "./client.ts";
import { keys } from "./keys.ts";

export const roles = (workspaceId: Workspace.Id) =>
  ApiClient.query("assignments", "roles", {
    params: { workspaceId },
    reactivityKeys: [keys.access(workspaceId)],
  });
export const list = (workspaceId: Workspace.Id, memberId: Member.Id) =>
  ApiClient.query("assignments", "list", {
    params: { workspaceId, memberId },
    reactivityKeys: [keys.access(workspaceId)],
  });
export const makeChange = () =>
  ApiClient.runtime.fn(
    Effect.fn("Assignments.change")(function* (input: {
      workspaceId: Workspace.Id;
      payload: Assignment.ChangeInput;
    }) {
      const client = yield* ApiClient;
      return yield* client.assignments
        .change({ params: { workspaceId: input.workspaceId }, payload: input.payload })
        .pipe(
          Reactivity.mutation([
            keys.access(input.workspaceId),
            keys.members.list(input.workspaceId),
            keys.invitations.list(input.workspaceId),
          ]),
        );
    }),
  );
export const makeRevoke = () =>
  ApiClient.runtime.fn(
    Effect.fn("Assignments.revoke")(function* (params: {
      workspaceId: Workspace.Id;
      memberId: Member.Id;
      assignmentId: Assignment.Id;
    }) {
      const client = yield* ApiClient;
      return yield* client.assignments
        .revoke({ params })
        .pipe(
          Reactivity.mutation([
            keys.access(params.workspaceId),
            keys.members.list(params.workspaceId),
            keys.invitations.list(params.workspaceId),
          ]),
        );
    }),
  );
export * as Assignments from "./assignments.ts";
