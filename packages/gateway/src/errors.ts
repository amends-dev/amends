import { Authorization, PermissionCatalog } from "@amends/core/authorization";
import { Commit } from "@amends/core/journal";
import {
  InvitationApplication,
  MemberApplication,
  Workspace,
  WorkspaceInitialization,
} from "@amends/core/workspace";
import { Schema } from "effect";

export class NotMember extends Schema.TaggedError<NotMember>()("Gateway.NotMember", {
  workspaceId: Workspace.Id,
}) {}

/** Storage contention; the operation did not apply and may be retried. */
export class Conflict extends Schema.TaggedError<Conflict>()("Gateway.Conflict", {
  workspaceId: Workspace.Id,
  operation: Schema.String,
  message: Schema.String,
}) {}

/** The commit's outcome is unknown; reconcile stored state before repeating. */
export class Uncertain extends Schema.TaggedError<Uncertain>()("Gateway.Uncertain", {
  workspaceId: Workspace.Id,
  commitId: Commit.Id,
}) {}

/** Core rejected the operation's input, such as invitation grants for the wrong workspace or target kind. */
export class InvalidInput extends Schema.TaggedError<InvalidInput>()("Gateway.InvalidInput", {
  message: Schema.String,
}) {}

/**
 * Domain outcomes a caller can act on. Storage, transaction, projection, and
 * consistency failures reveal nothing actionable and become defects that keep
 * their original cause for host logging.
 */
export const Public = Schema.Union([
  NotMember,
  Conflict,
  Uncertain,
  InvalidInput,
  Authorization.Denied,
  Authorization.InvalidActor,
  PermissionCatalog.Unknown,
  MemberApplication.NotFound,
  MemberApplication.OwnerProtected,
  MemberApplication.AlreadyRemoved,
  InvitationApplication.NotFound,
  InvitationApplication.NotRecipient,
  InvitationApplication.NotOwner,
  InvitationApplication.AlreadyMember,
  InvitationApplication.Unavailable,
  InvitationApplication.InvalidExpiry,
  WorkspaceInitialization.NotOwner,
]);
export type Public = typeof Public.Type;

/** The public outcomes of a core program whose error type is E. */
export type Exposed<E> = Extract<E, Public> | Conflict | Uncertain | InvalidInput;
