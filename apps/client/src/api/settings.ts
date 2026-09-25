import { Assignment, Invitation, Ownership, Workspace, WorkspaceSettings } from "@amends/api-http";
import { Cause, DateTime, Effect, Exit, Option, Schema } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { directoryQuery } from "./directory.ts";
import { refreshResult } from "./refresh.ts";
import { workspaceKey } from "./keys.ts";
import { newWorkspaceRequestKey } from "./workspaces.ts";

export type SettingsSection = "workspace" | "members" | "invites";
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
export const formatInstant = (instant: DateTime.Utc) =>
  DateTime.toDateUtc(instant).toLocaleString();
export const invitationStatus = (record: Invitation.Record) =>
  record.state._tag === "Pending" && DateTime.toEpochMillis(record.details.expiresAt) <= Date.now()
    ? "Expired"
    : record.state._tag;
export function settingsFailure(cause: Cause.Cause<unknown>): string {
  const tags = cause.reasons.flatMap((reason) =>
    Cause.isFailReason(reason) &&
    typeof reason.error === "object" &&
    reason.error !== null &&
    "_tag" in reason.error
      ? [String(reason.error._tag)]
      : [],
  );
  if (tags.some((tag) => tag.endsWith(".Changed") || tag === "Gateway.Conflict"))
    return "This changed while you were editing. Refresh, review the latest values, and try again.";
  if (tags.some((tag) => /Denied|NotOwner|OwnerProtected|NotMember|InvalidActor/.test(tag)))
    return "You no longer have permission for this action. Refresh to review your access.";
  if (
    tags.some((tag) => /Unavailable|AlreadyMember|AlreadyRemoved|NotFound|InactiveMember/.test(tag))
  )
    return "This item is no longer available for that action. Refresh to see its current state.";
  if (tags.some((tag) => /InvalidInput|SchemaError|InvalidExpiry/.test(tag)))
    return "Check the values and try again.";
  return "The request could not be completed. Try again when the host is available.";
}
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

/**
 * Run one command, then refresh the section's reads and the directory before reporting, so a
 * completed write is always followed by the state it produced. A refresh command only refreshes.
 */
export const settingsRequest = (client: ApiClient, workspace: string, section: SettingsSection) =>
  client.runtime
    .fn<{ attempt: number; command: SettingsCommand }>()(
      Effect.fn("Client.Settings.request")(function* ({ attempt, command }, get) {
        const run = Effect.gen(function* () {
          const api = yield* client;
          const workspaceId = yield* Schema.decodeEffect(Workspace.Id)(workspace);
          const params = { workspaceId };
          const mutation = yield* Effect.exit(
            Effect.gen(function* () {
              switch (command.kind) {
                case "refresh":
                  return;
                case "rename":
                  return yield* api.workspaces.rename({
                    params,
                    payload: yield* Schema.decodeEffect(WorkspaceSettings.RenameInput)(command),
                  });
                case "transfer":
                  return yield* api.workspaces.transferOwnership({
                    params,
                    payload: yield* Schema.decodeEffect(Ownership.TransferInput)(command),
                  });
                case "role":
                  return yield* api.assignments.change({
                    params,
                    payload: yield* Schema.decodeEffect(Assignment.ChangeInput)(command),
                  });
                case "remove":
                  return yield* api.members.remove({
                    params: {
                      ...params,
                      memberId: yield* Schema.decodeEffect(Assignment.AssignInput.fields.memberId)(
                        command.memberId,
                      ),
                    },
                  });
                case "invite":
                  return yield* api.invitations.issue({
                    params,
                    payload: yield* Schema.decodeUnknownEffect(
                      Schema.toType(Invitation.IssueInput),
                    )(command),
                    headers: { "idempotency-key": command.key },
                  });
                case "revoke":
                  return yield* api.invitations.revoke({
                    params: {
                      ...params,
                      invitationId: yield* Schema.decodeEffect(Invitation.Id)(command.invitationId),
                    },
                  });
              }
            }),
          );
          if (Exit.isFailure(mutation))
            return { completed: false, exit: Exit.failCause(mutation.cause) };
          const current = reads(client, workspaceId);
          const refresh = <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>) =>
            refreshResult(get, atom);
          const exit = yield* Effect.exit(
            Effect.gen(function* () {
              const [settings] = yield* Effect.all(
                [
                  refresh(current.settings),
                  refresh(current.ownership),
                  refresh(directoryQuery(client)),
                  section === "members" ? refresh(current.members(true)) : Effect.void,
                ],
                { concurrency: "unbounded" },
              );
              if (section === "invites" && settings.canReadInvitations)
                yield* refresh(current.invitations(true));
            }),
          );
          return { completed: command.kind !== "refresh", exit };
        });
        const result = yield* run.pipe(
          Effect.catch((error) => Effect.succeed({ completed: false, exit: Exit.fail(error) })),
        );
        return { attempt, ...result };
      }),
    )
    .pipe(Atom.setIdleTTL(0));

export const acceptInvitationRequest = (client: ApiClient) =>
  client.runtime
    .fn<{ attempt: number; workspaceId: string; invitationId: string; refreshOnly: boolean }>()(
      Effect.fn("Client.Invitation.accept")(function* (request, get) {
        const mutation = yield* Effect.exit(
          Effect.gen(function* () {
            if (request.refreshOnly) return;
            const api = yield* client;
            return yield* api.invitations.accept({
              params: {
                workspaceId: yield* Schema.decodeEffect(Workspace.Id)(request.workspaceId),
                invitationId: yield* Schema.decodeEffect(Invitation.Id)(request.invitationId),
              },
            });
          }),
        );
        if (Exit.isFailure(mutation))
          return {
            attempt: request.attempt,
            completed: false,
            exit: Exit.failCause(mutation.cause),
          };
        const exit = yield* Effect.exit(Effect.asVoid(refreshResult(get, directoryQuery(client))));
        return { attempt: request.attempt, completed: true, exit };
      }),
    )
    .pipe(Atom.setIdleTTL(0));
