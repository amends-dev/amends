import type { SettingsTab } from "@amends-dev/ui/screens/settings";
import {
  Assignment,
  Invitation,
  Member,
  Ownership,
  Workspace,
  WorkspaceSettings,
  Scope,
  Identity,
} from "@amends-dev/api-http";
import { DateTime, Effect, Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import type { Api, ApiClient } from "../api/client.ts";
import { Accounts } from "../api/contracts.ts";
import { directoryQuery } from "../api/directory.ts";
import { command } from "../api/failures.ts";
import { refreshResult } from "../api/refresh.ts";
import { workspaceKey } from "../api/keys.ts";
import { newWorkspaceRequestKey } from "../workspaces/api.ts";

export { Assignment, Scope, Invitation, Identity };

/**
 * The Workspace tab reads settings and ownership; Members adds the roster and invitations, with
 * the addresses of the people in them for a reader who manages invitations.
 */
export interface SettingsData {
  readonly settings: WorkspaceSettings.View;
  readonly ownership: Ownership.View;
  readonly members: ReadonlyArray<WorkspaceSettings.MemberEntry>;
  readonly invitations: ReadonlyArray<Invitation.Invitation>;
  readonly accounts: ReadonlyArray<Accounts.Account>;
}
/** A change the reader makes in settings. */
export type SettingsCommand =
  | { kind: "rename"; name: string; expectedName: string }
  | { kind: "transfer"; memberId: string; expectedOwnerAssignmentId: string }
  | { kind: "role"; memberId: string; roleId: string; expectedAssignmentIds: ReadonlyArray<string> }
  | { kind: "remove"; memberId: string }
  | {
      kind: "invite";
      email: string;
      roleId: string;
      expiresAt: DateTime.Utc;
      key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | { kind: "revoke"; invitationId: string };
export const invitationIntent = (email: string, roleId: string) => ({
  kind: "invite" as const,
  email: email.trim(),
  roleId,
  expiresAt: DateTime.add(DateTime.makeUnsafe(Date.now()), { days: 7 }),
  key: newWorkspaceRequestKey(),
});
/** A read left unmounted: it reports nothing and makes no request. */
const idle = <A>(atom: Atom.Atom<AsyncResult.AsyncResult<ReadonlyArray<A>, unknown>>) =>
  Atom.make(AsyncResult.success([])) as unknown as typeof atom;
const reads = (client: ApiClient, workspaceId: Workspace.Id) => {
  const params = { workspaceId };
  const members = client.query("workspaces", "members", {
    params,
    reactivityKeys: [workspaceKey(workspaceId, "members")],
  });
  const invitations = client.query("invitations", "list", {
    params,
    reactivityKeys: [workspaceKey(workspaceId, "invitations")],
  });
  // Whom the roster and the invitations name changes with either.
  const accounts = client.query("accounts", "list", {
    params,
    reactivityKeys: [
      workspaceKey(workspaceId, "members"),
      workspaceKey(workspaceId, "invitations"),
    ],
  });
  const idleMembers = idle(members),
    idleInvitations = idle(invitations),
    idleAccounts = idle(accounts);
  return {
    settings: client.query("workspaces", "settings", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "settings")],
    }),
    ownership: client.query("workspaces", "ownership", {
      params,
      reactivityKeys: [workspaceKey(workspaceId, "ownership")],
    }),
    members: (enabled: boolean) => (enabled ? members : idleMembers),
    invitations: (enabled: boolean) => (enabled ? invitations : idleInvitations),
    accounts: (enabled: boolean) => (enabled ? accounts : idleAccounts),
  };
};
/**
 * The credential-scoped reads behind the settings sections. Each registers its invalidation key,
 * so the workspace change feed and writes refresh whichever are mounted. Undefined for an
 * invalid workspace ID.
 */
export const settingsReads = (client: ApiClient, workspaceId: string) =>
  Option.getOrUndefined(
    Option.map(Schema.decodeOption(Workspace.Id)(workspaceId), (id) => reads(client, id)),
  );
export type SettingsReads = ReturnType<typeof reads>;

/** Make one change to the workspace's settings, answering with the invitation it issued, if any. */
export const changeSettings = (workspace: string) => (api: Api, change: SettingsCommand) =>
  Effect.gen(function* () {
    const params = { workspaceId: yield* command(Workspace.Id)(workspace) };
    switch (change.kind) {
      case "rename":
        yield* api.workspaces.rename({
          params,
          payload: yield* command(WorkspaceSettings.RenameInput)(change),
        });
        return undefined;
      case "transfer":
        yield* api.workspaces.transferOwnership({
          params,
          payload: yield* command(Ownership.TransferInput)(change),
        });
        return undefined;
      case "role":
        yield* api.assignments.change({
          params,
          payload: yield* command(Assignment.ChangeInput)(change),
        });
        return undefined;
      case "remove":
        yield* api.members.remove({
          params: { ...params, memberId: yield* command(Member.Id)(change.memberId) },
        });
        return undefined;
      case "invite": {
        const issued = yield* api.invitations.issue({
          params,
          payload: {
            email: yield* command(Accounts.Email)(change.email),
            roleId: yield* command(Invitation.IssueInput.fields.roleId)(change.roleId),
            expiresAt: change.expiresAt,
          },
          headers: { "idempotency-key": change.key },
        });
        return issued.details.id as string;
      }
      case "revoke":
        yield* api.invitations.revoke({
          params: { ...params, invitationId: yield* command(Invitation.Id)(change.invitationId) },
        });
        return undefined;
    }
  });
/** Reload a section and the directory, which names the workspace, as a change's result shows. */
export const reloadSettings = (client: ApiClient, reads: SettingsReads, section: SettingsTab) =>
  Effect.gen(function* () {
    const [settings] = yield* Effect.all(
      [
        refreshResult(reads.settings),
        refreshResult(reads.ownership),
        refreshResult(directoryQuery(client)),
        section === "members" ? refreshResult(reads.members(true)) : Effect.void,
      ],
      { concurrency: "unbounded" },
    );
    if (section === "members" && settings.canReadInvitations)
      yield* Effect.all(
        [refreshResult(reads.invitations(true)), refreshResult(reads.accounts(true))],
        {
          concurrency: "unbounded",
        },
      );
  });
