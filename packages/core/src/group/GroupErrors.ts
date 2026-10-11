/**
 * The outcomes `GroupService` reports that a caller can act on. They are schemas, so protocols
 * carry them to clients; the service's error types add the failures of what it depends on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Group from "./Group.ts";

/**
 * A member listed for a new team group is no longer active in the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupService.InactiveMember",
  {
    memberId: Member.Id,
  },
) {}

/**
 * A member listed for a new team group is not in the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupService.MemberNotFound",
  {
    memberId: Member.Id,
  },
) {}

/**
 * Missing groups and groups outside the caller's audience share this outcome, so nothing discloses
 * a group to someone outside it.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("GroupService.NotFound", {
  groupId: Group.Id,
}) {}

/**
 * The group's name is no longer the one the renamer expected: someone renamed it meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("GroupService.Changed", {
  groupId: Group.Id,
}) {}

/**
 * A direct group is named by its members, so it has no name to change.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotRenamable extends Schema.TaggedError<NotRenamable>()("GroupService.NotRenamable", {
  groupId: Group.Id,
}) {}
