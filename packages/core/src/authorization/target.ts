import { Record, Schema } from "effect";
import { ChannelId } from "../channel/ChannelId.ts";
import { Connection } from "../connection/connection.ts";
import { ThreadId } from "../thread/ThreadId.ts";
import { GroupId } from "../group/id.ts";
import { Member } from "../workspace/member/member.ts";
import { Workspace } from "../workspace/workspace.ts";

/** A concrete authorization target within a workspace, not a grant's scope. */
export const Reference = Schema.TaggedUnion({
  Workspace: { workspaceId: Workspace.Id },
  Member: { workspaceId: Workspace.Id, memberId: Member.Id },
  Thread: { workspaceId: Workspace.Id, threadId: ThreadId.Id },
  Group: { workspaceId: Workspace.Id, groupId: GroupId.Id },
  Connection: { workspaceId: Workspace.Id, connectionId: Connection.Id },
  Channel: { workspaceId: Workspace.Id, channelId: ChannelId.Id },
});
export type Reference = typeof Reference.Type;

export const Kind = Schema.Literals(Record.keys(Reference.cases));
export type Kind = typeof Kind.Type;

export type Of<K extends Kind> = Extract<Reference, { readonly _tag: K }>;

export * as Target from "./target.ts";
