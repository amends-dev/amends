import { Subject } from "../../journal/subject.ts";
import { Schema } from "effect";
import { Fact } from "../../journal/fact.ts";
import { Member } from "../../workspace/member/member.ts";
import { Workspace } from "../../workspace/workspace.ts";
import { Assignment } from "./assignment.ts";

/** Establishes an active role or direct grant assignment with a fresh ID. */
export const Created = Fact.make("workspace.assignment.created", {
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
  subject: (payload) => Subject.make("assignment", payload.assignmentId),
  version: 1,
  payload: Schema.Struct({
    assignmentId: Assignment.Id,
    workspaceId: Workspace.Id,
  }),
  occurrence: (payload) => [payload.assignmentId],
});

export * as AssignmentFacts from "./facts.ts";
