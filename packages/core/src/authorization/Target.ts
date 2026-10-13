/**
 * What an action is done to: a workspace, member, thread, group, connection, or channel, each named
 * with its workspace. A `Permission.Definition` declares the kind its action targets, a
 * `Requirement` pairs a permission with one target, and an exact `Scope` names one. A target is a
 * reference, not a grant's scope: a workspace target is the workspace itself, which a
 * workspace-scoped grant and an exact grant on it both cover.
 *
 * @since 0.1.0
 */

import { Connection as ConnectionContract } from "@amends-dev/connection"
import * as Record from "effect/Record"
import * as Schema from "effect/Schema"
import * as ChannelId from "../channel/ChannelId.ts"
import * as GroupId from "../group/GroupId.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * A concrete authorization target within a workspace, not a grant's scope.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Reference = Schema.TaggedUnion({
  Workspace: { workspaceId: WorkspaceId.WorkspaceId },
  Member: { workspaceId: WorkspaceId.WorkspaceId, memberId: MemberId.MemberId },
  Thread: { workspaceId: WorkspaceId.WorkspaceId, threadId: ThreadId.ThreadId },
  Group: { workspaceId: WorkspaceId.WorkspaceId, groupId: GroupId.GroupId },
  Connection: { workspaceId: WorkspaceId.WorkspaceId, connectionId: ConnectionContract.ConnectionId },
  Channel: { workspaceId: WorkspaceId.WorkspaceId, channelId: ChannelId.ChannelId }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type Reference = typeof Reference.Type

/**
 * The kinds of target, by tag. A permission declares the one its action is done to, and a
 * requirement's target must be of that kind.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Kind = Schema.Literals(Record.keys(Reference.cases))

/**
 * @category schemas
 * @since 0.1.0
 */
export type Kind = typeof Kind.Type

/**
 * The reference of one kind, so `Requirement.make` accepts only the target a permission's kind
 * calls for.
 *
 * @category models
 * @since 0.1.0
 */
export type Of<K extends Kind> = Extract<Reference, { readonly _tag: K }>
