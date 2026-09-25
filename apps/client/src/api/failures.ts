import { Cause, Effect, Schema } from "effect";
import type { ApiClient } from "./client.ts";

/**
 * Why a workspace operation failed, for the reader. `changed`, `denied`, and `gone` mean what the
 * reader sees is out of date; `invalid` and `failed` leave it current, so they may retry at once.
 */
export type WorkspaceFailure = "changed" | "denied" | "gone" | "invalid" | "failed";
/** Whether a failure means the values on screen are out of date, so edits wait for a refresh. */
export const isStale = (failure: WorkspaceFailure) =>
  failure === "changed" || failure === "denied" || failure === "gone";

/** A command the reader composed that fails the contract's schema before any request. */
export class InvalidCommand extends Schema.TaggedError<InvalidCommand>()("Client.InvalidCommand", {
  message: Schema.String,
}) {}
/** Decode a reader's input for a request, reporting a mismatch as an invalid command. */
export const command = <S extends Schema.Top>(schema: S) => {
  const decode = Schema.decodeUnknownEffect(schema);
  return (input: unknown) =>
    decode(input).pipe(Effect.mapError((error) => new InvalidCommand({ message: error.message })));
};

type Client = ApiClient["Service"];
type Failure<F> = F extends (...args: never) => Effect.Effect<unknown, infer E, unknown>
  ? E
  : never;
/** Every failure the workspace, member, access, and invitation endpoints report, from the contract. */
type Reported =
  | Failure<Client["workspaces"][keyof Client["workspaces"]]>
  | Failure<Client["members"][keyof Client["members"]]>
  | Failure<Client["assignments"][keyof Client["assignments"]]>
  | Failure<Client["invitations"][keyof Client["invitations"]]>
  | InvalidCommand;
// Keyed by every reported tag, so a new or renamed failure fails to compile until it is placed.
const failures: { readonly [Tag in Reported["_tag"]]: WorkspaceFailure } = {
  "WorkspaceSettings.Changed": "changed",
  "AssignmentApplication.Changed": "changed",
  "OwnershipApplication.Changed": "changed",
  "Gateway.Conflict": "changed",
  "Authorization.Denied": "denied",
  "Authorization.InvalidActor": "denied",
  "Delegation.Denied": "denied",
  "Delegation.OwnerProtected": "denied",
  "Gateway.NotMember": "denied",
  "MemberApplication.OwnerProtected": "denied",
  "OwnershipApplication.NotOwner": "denied",
  "InvitationApplication.NotRecipient": "denied",
  "Api.HumanRequired": "denied",
  "AssignmentApplication.NotFound": "gone",
  "AssignmentApplication.MemberNotFound": "gone",
  "AssignmentApplication.InactiveMember": "gone",
  "Delegation.RoleNotFound": "gone",
  "Gateway.WorkspaceNotFound": "gone",
  "InvitationApplication.AlreadyMember": "gone",
  "InvitationApplication.NotFound": "gone",
  "InvitationApplication.Unavailable": "gone",
  "MemberApplication.AlreadyRemoved": "gone",
  "MemberApplication.NotFound": "gone",
  "OwnershipApplication.InvalidRecipient": "gone",
  "OwnershipApplication.MemberNotFound": "gone",
  "Client.InvalidCommand": "invalid",
  "Gateway.InvalidInput": "invalid",
  "InvitationApplication.InvalidExpiry": "invalid",
  "Delegation.UnsupportedRole": "invalid",
  "PermissionCatalog.Unknown": "invalid",
  // Rejected credentials sign out in the HTTP layer; the rest are transport or host failures.
  "Api.Unauthorized": "failed",
  "Gateway.Uncertain": "failed",
  "Request.Reused": "failed",
  HttpClientError: "failed",
  // A response that fails its schema; readers' inputs fail as Client.InvalidCommand instead.
  SchemaError: "failed",
};
const isFailure = (error: unknown): error is { readonly _tag: keyof typeof failures } =>
  typeof error === "object" &&
  error !== null &&
  "_tag" in error &&
  Object.hasOwn(failures, error._tag as string);
/** Classify an operation's cause; transport failures, malformed responses, and defects fail. */
export const workspaceFailure = (cause: Cause.Cause<unknown>): WorkspaceFailure => {
  for (const reason of cause.reasons)
    if (Cause.isFailReason(reason) && isFailure(reason.error)) return failures[reason.error._tag];
  return "failed";
};
