import { Schema } from "effect";
import { Identity } from "../identity/identity.ts";
import { Member } from "./member.ts";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("WorkspaceId"));
export type Id = typeof Id.Type;

/** Creation attribution stays fixed when ownership is transferred in a later workflow. */
export const Record = Schema.Struct({
  id: Id,
  createdBy: Identity.HumanId,
  // Memberships also reference Workspace.Id; defer this side of the schema dependency.
  ownerMemberId: Schema.suspend(() => Member.Id),
});
export interface Record extends Schema.Schema.Type<typeof Record> {}

export * as Workspace from "./workspace.ts";
