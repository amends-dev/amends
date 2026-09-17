import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { Workspace } from "./workspace.ts";

/** Identifies one admission to a workspace; rejoining creates a new membership. */
export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceMemberId"));
export type Id = typeof Id.Type;

export const Status = Schema.Literals(["active", "removed"]);
export type Status = typeof Status.Type;

/** Removed memberships retain their identity for historical references. */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: Workspace.Id,
  identity: Identity.Reference,
  status: Status,
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Member from "./member.ts";
