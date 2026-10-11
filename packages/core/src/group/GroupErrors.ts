import { Schema } from "effect";
import * as Member from "../workspace/Member.ts";
import * as Group from "./Group.ts";

/** The outcomes `GroupService` reports that a caller can act on; schemas only, for contracts. */
export class InactiveMember extends Schema.TaggedError<InactiveMember>()(
  "GroupService.InactiveMember",
  {
    memberId: Member.Id,
  },
) {}

export class MemberNotFound extends Schema.TaggedError<MemberNotFound>()(
  "GroupService.MemberNotFound",
  {
    memberId: Member.Id,
  },
) {}

/** Missing groups and groups outside the caller's audience share this outcome. */
export class NotFound extends Schema.TaggedError<NotFound>()("GroupService.NotFound", {
  groupId: Group.Id,
}) {}

/** The group's name is no longer the one the renamer expected: someone renamed it meanwhile. */
export class Changed extends Schema.TaggedError<Changed>()("GroupService.Changed", {
  groupId: Group.Id,
}) {}

/** A direct group is named by its members, so it has no name to change. */
export class NotRenamable extends Schema.TaggedError<NotRenamable>()("GroupService.NotRenamable", {
  groupId: Group.Id,
}) {}
