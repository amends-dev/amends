/**
 * The outcomes `GroupService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's error types add the failures of what it depends on.
 */
import { Schema } from "effect";
import * as Member from "../../workspace/Member.ts";
import * as Group from "../Group.ts";

/**
 * A member listed for a new team group is no longer active in the workspace.
 */
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupService.InactiveMember",
  {
    memberId: Member.Id,
  },
) {}

/**
 * The group's name is no longer the one the renamer expected: someone renamed it meanwhile.
 */
export class Changed extends Schema.TaggedError<Changed>()("GroupService.Changed", {
  groupId: Group.Id,
}) {}

/**
 * A direct group is named by its members, so it has no name to change.
 */
export class NotRenamable extends Schema.TaggedError<NotRenamable>()("GroupService.NotRenamable", {
  groupId: Group.Id,
}) {}
