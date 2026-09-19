import { Schema } from "effect";
import { Assignment } from "../../authorization/assignment/assignment.ts";
import { Member } from "../member/member.ts";
import { Workspace } from "../workspace.ts";

export const TransferInput = Schema.Struct({
  memberId: Member.Id,
  expectedOwnerAssignmentId: Assignment.Id,
}).annotate({ identifier: "OwnershipTransferInput" });
export interface TransferInput extends Schema.Schema.Type<typeof TransferInput> {}

/** A recorded ownership transition; attribution and other workspace metadata stay unchanged. */
export const Change = Schema.Struct({
  workspaceId: Workspace.Id,
  previousOwnerMemberId: Member.Id,
  ownerMemberId: Member.Id,
}).check(
  Schema.makeFilter(
    (change) =>
      change.previousOwnerMemberId !== change.ownerMemberId ||
      "Ownership must move to another member",
  ),
);
export interface Change extends Schema.Schema.Type<typeof Change> {}

/** Candidate discovery is part of transfer authority, and returns no candidates to other members. */
export const View = Schema.Struct({
  workspace: Workspace.Record,
  owner: Member.Record,
  ownerAssignmentId: Assignment.Id,
  canTransfer: Schema.Boolean,
  candidates: Schema.Array(Member.Record),
}).annotate({ identifier: "WorkspaceOwnership" });
export interface View extends Schema.Schema.Type<typeof View> {}

export * as Ownership from "./ownership.ts";
