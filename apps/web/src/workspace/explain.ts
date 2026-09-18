import { Cause, Option } from "effect";

/** The text a failure shows next to the control that caused it, in the server's words. */
export const explain = (cause: Cause.Cause<unknown>): string => {
  const error = Option.getOrUndefined(Cause.findErrorOption(cause)) as
    | { _tag?: string; message?: string; reason?: string }
    | undefined;
  switch (error?._tag) {
    case "Gateway.NotMember":
      return "You no longer have active membership in this workspace.";
    case "Authorization.Denied":
      return "You do not hold the permission this needs.";
    case "Authorization.InvalidActor":
      return "The acting membership is no longer active.";
    case "MemberApplication.NotFound":
      return "This member is no longer available.";
    case "MemberApplication.OwnerProtected":
      return "The current owner cannot be removed. Transfer ownership first.";
    case "MemberApplication.AlreadyRemoved":
      return "This membership has already ended.";
    case "InvitationApplication.NotOwner":
      return "Only the current owner can issue or revoke invitations.";
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
      return "The outcome is unknown. Reload before trying again.";
    default:
      return error?.message ?? "Something went wrong. Try again in a moment.";
  }
};
