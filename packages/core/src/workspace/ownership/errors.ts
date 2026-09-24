import { Schema } from "effect";
import { Member } from "../member/member.ts";
import { Workspace } from "../workspace.ts";

/** The outcomes `OwnershipApplication` reports that a caller can act on; schemas only, for contracts. */
export class Changed extends Schema.TaggedError<Changed>()("OwnershipApplication.Changed", {
  workspaceId: Workspace.Id,
}) {}
export class InvalidRecipient extends Schema.TaggedError<InvalidRecipient>()(
  "OwnershipApplication.InvalidRecipient",
  {
    memberId: Member.Id,
    reason: Schema.Literals(["same-owner", "removed", "agent"]),
  },
) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "OwnershipApplication.MemberNotFound",
  { memberId: Member.Id },
) {}
export class NotOwner extends Schema.TaggedError<NotOwner>()("OwnershipApplication.NotOwner", {
  workspaceId: Workspace.Id,
}) {}

export * as OwnershipErrors from "./errors.ts";
