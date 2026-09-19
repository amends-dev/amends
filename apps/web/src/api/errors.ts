import { Cause, Option, Schema } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";

const envelope = Schema.Struct({
  _tag: Schema.String,
  message: Schema.optionalKey(Schema.String),
  reason: Schema.optionalKey(Schema.String),
  commitId: Schema.optionalKey(Schema.String),
});
const decode = Schema.decodeUnknownOption(envelope);
const errorOf = (cause: Cause.Cause<unknown>) =>
  Option.getOrUndefined(Option.flatMap(Cause.findErrorOption(cause), decode));
export const isUnauthorized = (cause: Cause.Cause<unknown>) =>
  errorOf(cause)?._tag === "Api.Unauthorized";
export const isNotMember = (cause: Cause.Cause<unknown>) =>
  ["Gateway.NotMember", "Authorization.InvalidActor"].includes(errorOf(cause)?._tag ?? "");
export const mayRetainData = (cause: Cause.Cause<unknown>) =>
  ![
    "Api.Unauthorized",
    "Api.HumanRequired",
    "Gateway.NotMember",
    "Authorization.InvalidActor",
    "Authorization.Denied",
    "Delegation.Denied",
    "AssignmentApplication.MemberNotFound",
    "AssignmentApplication.NotFound",
    "MemberApplication.NotFound",
    "InvitationApplication.NotFound",
  ].includes(errorOf(cause)?._tag ?? "");
export const failureOf = <A, E>(result: AsyncResult.AsyncResult<A, E>) =>
  AsyncResult.isFailure(result) ? result : undefined;
export const valueOf = <A, E>(result: AsyncResult.AsyncResult<A, E>): A | undefined =>
  AsyncResult.isFailure(result) && !mayRetainData(result.cause)
    ? undefined
    : Option.getOrUndefined(AsyncResult.value(result));

export const explain = (cause: Cause.Cause<unknown>): string => {
  const error = errorOf(cause);
  switch (error?._tag) {
    case "Api.Unauthorized":
      return "Your session has ended. Sign in again.";
    case "Api.HumanRequired":
      return "This operation requires a signed-in human account.";
    case "Gateway.NotMember":
      return "You no longer have active membership in this workspace.";
    case "Authorization.InvalidActor":
      return "The acting membership is no longer active.";
    case "Authorization.Denied":
      return "You do not hold the permission this needs.";
    case "MemberApplication.NotFound":
      return "This member is no longer available.";
    case "MemberApplication.OwnerProtected":
      return "The current owner cannot be removed. Transfer ownership first.";
    case "MemberApplication.AlreadyRemoved":
      return "This membership has already ended.";
    case "Delegation.Denied":
      return "Only the workspace owner can manage administrators or members with additional access.";
    case "Delegation.OwnerProtected":
      return "Owner access can only change through ownership transfer.";
    case "Delegation.UnsupportedRole":
      return "Select an available built-in role.";
    case "Delegation.RoleNotFound":
      return "This role is unavailable in the workspace.";
    case "AssignmentApplication.Changed":
      return "Their roles changed since you loaded them. Refresh access before trying again.";
    case "AssignmentApplication.InactiveMember":
      return "Removed members cannot receive access. Invite them again to rejoin.";
    case "AssignmentApplication.MemberNotFound":
    case "AssignmentApplication.NotFound":
      return "This member or assignment is no longer available.";
    case "InvitationApplication.NotRecipient":
      return "This invitation belongs to a different signed-in address.";
    case "InvitationApplication.AlreadyMember":
      return "That person is already an active member.";
    case "InvitationApplication.InvalidExpiry":
      return "The expiry must be in the future.";
    case "InvitationApplication.Unavailable":
      return `This invitation is ${error.reason ?? "no longer available"}.`;
    case "InvitationApplication.NotFound":
      return "This invitation is gone.";
    case "Gateway.InvalidInput":
    case "PermissionCatalog.Unknown":
      return error.message ?? "The request was not accepted.";
    case "Gateway.Conflict":
      return "The workspace was busy. Try again.";
    case "Gateway.Uncertain":
      return `The outcome is unknown. Reload before trying again.${error.commitId ? ` Commit: ${error.commitId}.` : ""}`;
    default:
      return "The request could not be completed. Check your connection and try again.";
  }
};
