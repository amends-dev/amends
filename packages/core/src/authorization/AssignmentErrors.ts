/**
 * The outcomes `AssignmentService` reports that a caller can act on. They are schemas, so
 * protocols carry them to clients; the service's `Error` type adds the failures of what it depends
 * on.
 *
 * @since 0.1.0
 */
import { Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Assignment from "./Assignment.ts";

/**
 * The member's workspace role assignments are no longer the ones the caller expected: someone
 * changed them meanwhile.
 *
 * @category errors
 * @since 0.1.0
 */
export class Changed extends Schema.TaggedError<Changed>()("AssignmentService.Changed", {
  memberId: Member.Id,
}) {}

/**
 * The member has been removed; roles are given to and taken from active members only.
 *
 * @category errors
 * @since 0.1.0
 */
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "AssignmentService.InactiveMember",
  { memberId: Member.Id },
) {}

/**
 * No member with this ID is recorded in the workspace.
 *
 * @category errors
 * @since 0.1.0
 */
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "AssignmentService.MemberNotFound",
  { memberId: Member.Id },
) {}

/**
 * No assignment with this ID is recorded for the member.
 *
 * @category errors
 * @since 0.1.0
 */
export class NotFound extends Schema.TaggedError<NotFound>()("AssignmentService.NotFound", {
  assignmentId: Assignment.Id,
}) {}
