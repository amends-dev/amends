import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { WorkspaceId } from "./id.ts";
import { MemberId } from "./member/id.ts";

export const Id = WorkspaceId.Id;
export type Id = WorkspaceId.Id;

/** Creation attribution stays fixed when ownership is transferred in a later workflow. */
export const Record = Schema.Struct({
  id: Id,
  createdBy: Identity.HumanId,
  ownerMemberId: MemberId.Id,
}).annotate({ identifier: "Workspace" });
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Workspace from "./workspace.ts";
