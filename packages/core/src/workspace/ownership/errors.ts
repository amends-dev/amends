import { Schema } from "effect";
import * as Member from "../member/member.ts";
import * as Workspace from "../workspace.ts";

/** The outcomes `OwnershipService` reports that a caller can act on; schemas only, for contracts. */
export class Changed extends Schema.TaggedError<Changed>()("OwnershipService.Changed", {
  workspaceId: Workspace.Id,
}) {}
export class InvalidRecipient extends Schema.TaggedError<InvalidRecipient>()(
  "OwnershipService.InvalidRecipient",
  {
    memberId: Member.Id,
    reason: Schema.Literals(["same-owner", "removed", "agent"]),
  },
) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "OwnershipService.MemberNotFound",
  { memberId: Member.Id },
) {}
export class NotOwner extends Schema.TaggedError<NotOwner>()("OwnershipService.NotOwner", {
  workspaceId: Workspace.Id,
}) {}
