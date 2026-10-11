import * as Subject from "../../journal/subject.ts";
import { Schema } from "effect";
import * as Identity from "../../identity/identity.ts";
import * as Audience from "../../journal/audience.ts";
import * as Fact from "../../journal/fact.ts";
import * as Member from "./member.ts";
import * as Workspace from "../workspace.ts";

/** Establishes an active membership with a fresh member ID. */
export const Added = Fact.make("workspace.member.added", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
    /** What the member is called on joining; later facts may rename them. */
    name: Member.Name,
  }),
  occurrence: (payload) => [payload.memberId],
});

/** A member chose what people in the workspace call them; each change is its own fact. */
export const Renamed = Fact.make("workspace.member.renamed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
    name: Member.Name,
  }),
});

/** Removal is terminal for this membership; rejoining uses Added with a new ID. */
export const Removed = Fact.make("workspace.member.removed", {
  audience: () => [Audience.workspace],
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
  }),
  occurrence: (payload) => [payload.memberId],
});
