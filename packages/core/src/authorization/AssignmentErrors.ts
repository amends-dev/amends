import { Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Assignment from "./Assignment.ts";

/** The outcomes `AssignmentService` reports that a caller can act on; schemas only, for contracts. */
export class Changed extends Schema.TaggedError<Changed>()("AssignmentService.Changed", {
  memberId: Member.Id,
}) {}
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "AssignmentService.InactiveMember",
  { memberId: Member.Id },
) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "AssignmentService.MemberNotFound",
  { memberId: Member.Id },
) {}
export class NotFound extends Schema.TaggedError<NotFound>()("AssignmentService.NotFound", {
  assignmentId: Assignment.Id,
}) {}
