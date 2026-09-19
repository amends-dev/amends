import { Authorization, PermissionCatalog } from "@amends/core/authorization";
import { InvitationApplication, MemberApplication } from "@amends/core/workspace";
import { GatewayErrors } from "@amends/gateway/errors";
import { Schema } from "effect";
import { HttpApiSchema } from "effect/unstable/httpapi";

/** The principal is an agent where only a human may act. */
export class HumanRequired extends Schema.TaggedError<HumanRequired>()(
  "Api.HumanRequired",
  {},
  { httpApiStatus: 403 },
) {}

/**
 * HTTP statuses for gateway and core outcomes. Core declares no transport
 * concerns, so the status lives on the contract's view of each error.
 */
export const NotMember = GatewayErrors.NotMember.pipe(HttpApiSchema.status(403));
export const Conflict = GatewayErrors.Conflict.pipe(HttpApiSchema.status(409));
export const Uncertain = GatewayErrors.Uncertain.pipe(HttpApiSchema.status(500));
export const InvalidInput = GatewayErrors.InvalidInput.pipe(HttpApiSchema.status(400));
export const Denied = Authorization.Denied.pipe(HttpApiSchema.status(403));
export const InvalidActor = Authorization.InvalidActor.pipe(HttpApiSchema.status(403));
export const UnknownPermission = PermissionCatalog.Unknown.pipe(HttpApiSchema.status(400));
export const MemberNotFound = MemberApplication.NotFound.pipe(HttpApiSchema.status(404));
export const OwnerProtected = MemberApplication.OwnerProtected.pipe(HttpApiSchema.status(409));
export const AlreadyRemoved = MemberApplication.AlreadyRemoved.pipe(HttpApiSchema.status(409));
export const InvitationNotFound = InvitationApplication.NotFound.pipe(HttpApiSchema.status(404));
export const NotRecipient = InvitationApplication.NotRecipient.pipe(HttpApiSchema.status(403));
export const InvitationNotOwner = InvitationApplication.NotOwner.pipe(HttpApiSchema.status(403));
export const AlreadyMember = InvitationApplication.AlreadyMember.pipe(HttpApiSchema.status(409));
export const InvitationUnavailable = InvitationApplication.Unavailable.pipe(
  HttpApiSchema.status(410),
);
export const InvitationInvalidExpiry = InvitationApplication.InvalidExpiry.pipe(
  HttpApiSchema.status(400),
);

/** Outcomes every operation in a workspace shares: authorization, input, and storage. */
export const workspace = [
  Denied,
  InvalidActor,
  UnknownPermission,
  InvalidInput,
  Conflict,
  Uncertain,
] as const;

/** Outcomes every member operation shares: the workspace set plus membership. */
export const member = [NotMember, ...workspace] as const;

export * as ApiErrors from "./errors.ts";
