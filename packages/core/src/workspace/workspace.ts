import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { WorkspaceId } from "./id.ts";
import { MemberId } from "./member/id.ts";

export const Id = WorkspaceId.Id;
export type Id = WorkspaceId.Id;

export const Name = Schema.Trimmed.check(Schema.isMinLength(1));
export type Name = typeof Name.Type;

export const CreateInput = Schema.Struct({ name: Name }).annotate({
  identifier: "WorkspaceCreateInput",
});
export interface CreateInput extends Schema.Schema.Type<typeof CreateInput> {}

/** Creation attribution stays fixed when ownership is transferred in a later workflow. */
export const Record = Schema.Struct({
  id: Id,
  name: Name,
  createdBy: Identity.HumanId,
  ownerMemberId: MemberId.Id,
}).annotate({ identifier: "Workspace" });
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Workspace from "./workspace.ts";
