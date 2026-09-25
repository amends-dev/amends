import { Assignment, Invitation, Ownership, Workspace, WorkspaceSettings } from "@amends/api-http";
import { Cause, DateTime, Effect, Exit, Schema } from "effect";
import { Atom } from "effect/unstable/reactivity";
import type { ApiClient } from "./client.ts";
import { directoryQuery } from "./directory.ts";
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
          const exit = yield* Effect.exit(
            Effect.gen(function* () {
              const query = directoryQuery(client);
              get.refresh(query);
              yield* get.result(query, { suspendOnWaiting: true });
              const settings = yield* api.workspaces.settings({ params });
              const ownership = yield* api.workspaces.ownership({ params });
              const members =
                section === "members" ? yield* api.workspaces.members({ params }) : [];
              const invitations =
                section === "invites" && settings.canReadInvitations
                  ? yield* api.invitations.list({ params })
                  : [];
              return { settings, ownership, members, invitations } satisfies SettingsData;
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
        const exit = yield* Effect.exit(
          Effect.gen(function* () {
            const query = directoryQuery(client);
            get.refresh(query);
            yield* get.result(query, { suspendOnWaiting: true });
          }),
        );
        return { attempt: request.attempt, completed: true, exit };
      }),
    )
    .pipe(Atom.setIdleTTL(0));
