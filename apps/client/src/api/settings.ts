import {
  Assignment,
  Invitation,
  Member,
  Ownership,
  Workspace,
  WorkspaceSettings,
} from "@amends/api-http";
import { DateTime, Effect, type Exit, Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { command } from "./failures.ts";
import { requestAtom } from "./request.ts";
import { directoryQuery } from "./directory.ts";
import { refreshResult } from "./refresh.ts";
import { workspaceKey } from "./keys.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

/** The Workspace tab reads settings and ownership; Members adds the roster and invitations. */
export type SettingsSection = "workspace" | "members";
export interface SettingsData {
  readonly settings: WorkspaceSettings.View;
  readonly ownership: Ownership.View;
  readonly members: ReadonlyArray<WorkspaceSettings.MemberEntry>;
  readonly invitations: ReadonlyArray<Invitation.Record>;
}
export type SettingsCommand =
  | { kind: "refresh" }
  | { kind: "rename"; name: string; expectedName: string }
  | { kind: "transfer"; memberId: string; expectedOwnerAssignmentId: string }
  | { kind: "role"; memberId: string; roleId: string; expectedAssignmentIds: ReadonlyArray<string> }
  | { kind: "remove"; memberId: string }
  | {
      kind: "invite";
      recipientId: string;
      roleId: string;
      expiresAt: DateTime.Utc;
      key: ReturnType<typeof newWorkspaceRequestKey>;
    }
  | { kind: "revoke"; invitationId: string };
export const invitationIntent = (recipientId: string, roleId: string) => ({
  kind: "invite" as const,
  recipientId: recipientId.trim(),
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
  const idleMembers = idle(members),
    idleInvitations = idle(invitations);
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

/** Commands that change settings; a refresh command only reloads. */
const mutate = Effect.fnUntraced(function* (
  client: ApiClient,
  workspaceId: Workspace.Id,
  change: Exclude<SettingsCommand, { kind: "refresh" }>,
) {
  const api = yield* client;
  const params = { workspaceId };
  switch (change.kind) {
    case "rename":
      return yield* api.workspaces.rename({
        params,
        payload: yield* command(WorkspaceSettings.RenameInput)(change),
      });
    case "transfer":
      return yield* api.workspaces.transferOwnership({
        params,
        payload: yield* command(Ownership.TransferInput)(change),
      });
    case "role":
      return yield* api.assignments.change({
        params,
        payload: yield* command(Assignment.ChangeInput)(change),
      });
    case "remove":
      return yield* api.members.remove({
        params: { ...params, memberId: yield* command(Member.Id)(change.memberId) },
      });
    case "invite":
      return yield* api.invitations.issue({
        params,
        payload: yield* command(Schema.toType(Invitation.IssueInput))(change),
        headers: { "idempotency-key": change.key },
      });
    case "revoke":
      return yield* api.invitations.revoke({
        params: { ...params, invitationId: yield* command(Invitation.Id)(change.invitationId) },
      });
  }
});
/**
 * What a completed command leaves behind: whether reading its result back succeeded, and the
 * invitation it created, if any.
 */
export interface Settled {
  readonly refreshed: Exit.Exit<void, unknown>;
  readonly created?: string;
}
/**
 * Run one command, then refresh the section's reads and the directory before answering, so a
 * completed write is followed by the state it produced. A refresh command only refreshes.
 */
export const settingsRequest = (client: ApiClient, workspace: string, section: SettingsSection) =>
  requestAtom(client, (input: SettingsCommand, get) =>
    Effect.gen(function* () {
      const workspaceId = yield* command(Workspace.Id)(workspace);
      const outcome =
        input.kind === "refresh" ? undefined : yield* mutate(client, workspaceId, input);
      const created =
        input.kind === "invite" && outcome !== undefined && "details" in outcome
          ? outcome.details.id
          : undefined;
      const current = reads(client, workspaceId);
      const refreshed = yield* Effect.exit(
        Effect.gen(function* () {
          const [settings] = yield* Effect.all(
            [
              refreshResult(get, current.settings),
              refreshResult(get, current.ownership),
              refreshResult(get, directoryQuery(client)),
              section === "members" ? refreshResult(get, current.members(true)) : Effect.void,
            ],
            { concurrency: "unbounded" },
          );
          if (section === "members" && settings.canReadInvitations)
            yield* refreshResult(get, current.invitations(true));
        }),
      );
      return { refreshed, created } satisfies Settled;
    }),
  );

/**
 * Accept an invitation, with what the member will be called there, then refresh the directory;
 * `refreshOnly` retries just the refresh.
 */
export const acceptInvitationRequest = (client: ApiClient) =>
  requestAtom(
    client,
    (
      input: { workspaceId: string; invitationId: string; name?: string; refreshOnly: boolean },
      get,
    ) =>
      Effect.gen(function* () {
        if (!input.refreshOnly) {
          const api = yield* client;
          yield* api.invitations.accept({
            params: {
              workspaceId: yield* command(Workspace.Id)(input.workspaceId),
              invitationId: yield* command(Invitation.Id)(input.invitationId),
            },
            payload: input.name ? { name: yield* command(Member.Name)(input.name.trim()) } : {},
          });
        }
        const refreshed = yield* Effect.exit(
          Effect.asVoid(refreshResult(get, directoryQuery(client))),
        );
        return { refreshed } satisfies Settled;
      }),
  );
