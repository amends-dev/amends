import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { WorkspaceId } from "./id.ts";
import { MemberId } from "./member/id.ts";
import { Member } from "./member/member.ts";
import { Text } from "../text/text.ts";

export const Id = WorkspaceId.Id;
export type Id = WorkspaceId.Id;

/** A workspace's name as recorded; names chosen now are `NewName`. */
export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;
/** A name chosen for a workspace: 1 to 80 characters, without hidden ones. */
export const NewName = Name.check(Schema.isMaxLength(Text.nameLength), Text.isName);

/** A new workspace's name, and what its creator is called there. */
export const CreateInput = Schema.Struct({
  name: NewName,
  memberName: Member.NewName,
}).annotate({
  identifier: "WorkspaceCreateInput",
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/** Creation attribution stays fixed when ownership is transferred. */
export const Record = Schema.Struct({
  id: Id,
  name: Name,
  createdBy: Identity.HumanId,
  ownerMemberId: MemberId.Id,
}).annotate({ identifier: "Workspace" });
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Workspace from "./workspace.ts";
