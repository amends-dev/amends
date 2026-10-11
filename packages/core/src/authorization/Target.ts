/**
 * What an action is done to: a workspace, member, thread, group, connection, or channel, each named
 * with its workspace. A `Permission.Definition` declares the kind its action targets, a
 * `Requirement` pairs a permission with one target, and an exact `Scope` names one. A target is a
 * reference, not a grant's scope: a workspace target is the workspace itself, which a
 * workspace-scoped grant and an exact grant on it both cover.
 *
 * @since 0.1.0
 */
import { Record, Schema } from "effect";
import * as ChannelId from "../channel/ChannelId.ts";
import * as Connection from "../connection/Connection.ts";
import * as ThreadId from "../thread/ThreadId.ts";
import * as GroupId from "../group/GroupId.ts";
import * as Member from "../workspace/Member.ts";
import * as Workspace from "../workspace/Workspace.ts";

/**
 * A concrete authorization target within a workspace, not a grant's scope.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.TaggedUnion({
  Workspace: { workspaceId: Workspace.Id },
  Member: { workspaceId: Workspace.Id, memberId: Member.Id },
  Thread: { workspaceId: Workspace.Id, threadId: ThreadId.Id },
  Group: { workspaceId: Workspace.Id, groupId: GroupId.Id },
  Connection: { workspaceId: Workspace.Id, connectionId: Connection.Id },
  Channel: { workspaceId: Workspace.Id, channelId: ChannelId.Id },
});

/**
 * @category schemas
 * @since 0.1.0
 */
export type Reference = typeof Reference.Type;

/**
 * The kinds of target, by tag. A permission declares the one its action is done to, and a
 * requirement's target must be of that kind.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Kind = Schema.Literals(Record.keys(Reference.cases));

/**
 * @category schemas
 * @since 0.1.0
 */
export type Kind = typeof Kind.Type;

/**
 * The reference of one kind, so `Requirement.make` accepts only the target a permission's kind
 * calls for.
 *
 * @category models
 * @since 0.1.0
 */
export type Of<K extends Kind> = Extract<Reference, { readonly _tag: K }>;
