import { Schema } from "effect";
import { MemberId } from "../workspace/member/id.ts";
import { WorkspaceId } from "../workspace/id.ts";
import { GroupId } from "./id.ts";

export const Id = GroupId.Id;
export type Id = GroupId.Id;
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;

/** This slice supports private team groups; other kinds arrive with their workflows. */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  kind: Schema.Literal("Team"),
  visibility: Schema.Literal("Private"),
  name: Name,
  createdBy: MemberId.Id,
  createdAt: Schema.DateTimeUtcFromString,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** The creator is admitted only when explicitly included. Empty groups are allowed. */
export const CreatePrivateTeamInput = Schema.Struct({
  name: Name,
  memberIds: Schema.UniqueArray(MemberId.Id),
});
export interface CreatePrivateTeamInput extends Schema.Schema.Type<typeof CreatePrivateTeamInput> {}

export * as Group from "./group.ts";
