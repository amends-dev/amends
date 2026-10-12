/**
 * The outcomes `MemberService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's error types add the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Member from "../Member.ts";
import * as Workspace from "../Workspace.ts";

/**
 * The member to remove was removed already; nothing more is recorded.
 */
export class AlreadyRemoved extends Schema.TaggedError<AlreadyRemoved>()(
  "MemberService.AlreadyRemoved",
  { workspaceId: Workspace.Id, memberId: Member.Id },
) {}

/**
 * No membership has this ID in the workspace. Only a caller authorized on that member learns it.
 */
export class NotFound extends Schema.TaggedError<NotFound>()("MemberService.NotFound", {
  workspaceId: Workspace.Id,
  memberId: Member.Id,
}) {}

/**
 * The member is the current owner, who cannot be removed; ownership must be transferred first.
 */
export class OwnerProtected extends Schema.TaggedError<OwnerProtected>()(
  "MemberService.OwnerProtected",
  { workspaceId: Workspace.Id, memberId: Member.Id },
) {}
