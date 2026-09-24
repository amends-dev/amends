import { Schema } from "effect";
import { Member } from "../../workspace/member/member.ts";
import { Assignment } from "./assignment.ts";

/** The outcomes `AssignmentApplication` reports that a caller can act on; schemas only, for contracts. */
export class Changed extends Schema.TaggedError<Changed>()("AssignmentApplication.Changed", {
  memberId: Member.Id,
}) {}
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "AssignmentApplication.InactiveMember",
  { memberId: Member.Id },
) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "AssignmentApplication.MemberNotFound",
  { memberId: Member.Id },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()("AssignmentApplication.NotFound", {
  assignmentId: Assignment.Id,
}) {}

export * as AssignmentErrors from "./errors.ts";
