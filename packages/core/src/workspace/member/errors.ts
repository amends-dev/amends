import { Schema } from "effect";
import { Member } from "./member.ts";
import { Workspace } from "../workspace.ts";

/** The outcomes `MemberService` reports that a caller can act on; schemas only, for contracts. */
export class AlreadyRemoved extends Schema.TaggedError<AlreadyRemoved>()(
  "MemberService.AlreadyRemoved",
  { workspaceId: Workspace.Id, memberId: Member.Id },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()("MemberService.NotFound", {
  workspaceId: Workspace.Id,
  memberId: Member.Id,
}) {}
export class OwnerProtected extends Schema.TaggedError<OwnerProtected>()(
  "MemberService.OwnerProtected",
  { workspaceId: Workspace.Id, memberId: Member.Id },
) {}

export * as MemberErrors from "./errors.ts";
