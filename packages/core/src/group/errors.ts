import { Schema } from "effect";
import { Member } from "../workspace/member/member.ts";
import { Group } from "./group.ts";

/** The outcomes `GroupApplication` reports that a caller can act on; schemas only, for contracts. */
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupApplication.InactiveMember",
  {
    memberId: Member.Id,
  },
) {}
export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupApplication.MemberNotFound",
  {
    memberId: Member.Id,
  },
) {}
/** Missing groups and groups outside the caller's audience share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("GroupApplication.NotFound", {
  groupId: Group.Id,
}) {}

/** The group's name is no longer the one the renamer expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("GroupApplication.Changed", {
  groupId: Group.Id,
}) {}

/** A direct group is named by its members, so it has no name to change. */
export class NotRenamable extends Schema.TaggedError<NotRenamable>()(
  "GroupApplication.NotRenamable",
  { groupId: Group.Id },
) {}

export * as GroupErrors from "./errors.ts";
