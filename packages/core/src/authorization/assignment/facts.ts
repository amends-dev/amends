import { Subject } from "../../journal/subject.ts";
import { Schema } from "effect";
import { Audience } from "../../journal/audience.ts";
import { Fact } from "../../journal/fact.ts";
import { Member } from "../../workspace/member/member.ts";
import { Workspace } from "../../workspace/workspace.ts";
import { Assignment } from "./assignment.ts";

/** Establishes an active role or direct grant assignment with a fresh ID. */
export const Created = Fact.make("workspace.assignment.created", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("assignment", payload.assignmentId),
  version: 1,
  payload: Schema.Struct({
    assignmentId: Assignment.Id,
    workspaceId: Workspace.Id,
    memberId: Member.Id,
    source: Assignment.Source,
  }).check(Assignment.SourceInWorkspace),
  occurrence: (payload) => [payload.assignmentId],
});

/** Revocation is terminal; assigning access again uses Created with a new ID. */
export const Revoked = Fact.make("workspace.assignment.revoked", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("assignment", payload.assignmentId),
  version: 1,
  payload: Schema.Struct({
    assignmentId: Assignment.Id,
    workspaceId: Workspace.Id,
    /** The member whose access this ends, so readers need not look the assignment up. */
    memberId: Member.Id,
  }),
  occurrence: (payload) => [payload.assignmentId],
});

export * as AssignmentFacts from "./facts.ts";
