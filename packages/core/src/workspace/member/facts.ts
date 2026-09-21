import { Subject } from "../../journal/subject.ts";
import { Schema } from "effect";
import { Identity } from "../../identity/identity.ts";
import { Fact } from "../../journal/fact.ts";
import { Member } from "./member.ts";
import { Workspace } from "../workspace.ts";

/** Establishes an active membership with a fresh member ID. */
export const Added = Fact.make("workspace.member.added", {
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
    identity: Identity.MemberReference,
  }),
  occurrence: (payload) => [payload.memberId],
});

/** Removal is terminal for this membership; rejoining uses Added with a new ID. */
export const Removed = Fact.make("workspace.member.removed", {
  subject: (payload) => Subject.make("member", payload.memberId),
  version: 1,
  payload: Schema.Struct({
    memberId: Member.Id,
    workspaceId: Workspace.Id,
  }),
  occurrence: (payload) => [payload.memberId],
});

export * as MemberFacts from "./facts.ts";
