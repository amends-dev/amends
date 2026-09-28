import { Record, Schema } from "effect";
import { ConnectionId } from "../connection/id.ts";
import { ThreadId } from "../thread/id.ts";
import { GroupId } from "../group/id.ts";
import { Member } from "../workspace/member/member.ts";
import { Workspace } from "../workspace/workspace.ts";

/** A concrete authorization target within a workspace, not a grant's scope. */
export const Reference = Schema.TaggedUnion({
  Workspace: { workspaceId: Workspace.Id },
  Member: { workspaceId: Workspace.Id, memberId: Member.Id },
  Thread: { workspaceId: Workspace.Id, threadId: ThreadId.Id },
  Group: { workspaceId: Workspace.Id, groupId: GroupId.Id },
  Connection: { workspaceId: Workspace.Id, connectionId: ConnectionId.Id },
});
export type Reference = typeof Reference.Type;

export const Kind = Schema.Literals(Record.keys(Reference.cases));
export type Kind = typeof Kind.Type;

export type Of<K extends Kind> = Extract<Reference, { readonly _tag: K }>;

export * as Target from "./target.ts";
