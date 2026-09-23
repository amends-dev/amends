import { Schema } from "effect";
import { Audience } from "../../journal/audience.ts";
import { Identity } from "../../identity/identity.ts";
import { WorkspaceId } from "../id.ts";
import { MemberId } from "./id.ts";

/** Identifies one admission to a workspace; rejoining creates a new membership. */
export const Id = MemberId.Id;
export type Id = MemberId.Id;

export const Status = Schema.Literals(["active", "removed"]);
export type Status = typeof Status.Type;

/** Removed memberships retain their identity for historical references. */
export const Record = Schema.Struct({
  id: Id,
  workspaceId: WorkspaceId.Id,
  identity: Identity.MemberReference,
  status: Status,
}).annotate({ identifier: "WorkspaceMember" });
export interface Record extends Schema.Schema.Type<typeof Record> {}

/** One workspace membership alone. */
export const audienceOf = (memberId: Id): Audience.Scope => Audience.make("member", memberId);

export * as Member from "./member.ts";
