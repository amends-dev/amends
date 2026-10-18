/**
 * Every event a member's store holds, as one Effect eventlog schema: the actions their browser
 * writes, and the changes and rejections the server writes back. The server and the browser build
 * their event logs over it.
 *
 * @since 0.1.0
 */

import * as EventLog from "effect/eventlog/EventLog"
import * as AgentSync from "./AgentSync.ts"
import * as ChannelSync from "./ChannelSync.ts"
import * as ConnectionSync from "./ConnectionSync.ts"
import * as GroupSync from "./GroupSync.ts"
import * as NotificationSync from "./NotificationSync.ts"
import * as Rejections from "./Rejections.ts"
import * as TaskSync from "./TaskSync.ts"
import * as ThreadSync from "./ThreadSync.ts"
import * as TurnSync from "./TurnSync.ts"
import * as WorkspaceSync from "./WorkspaceSync.ts"

/**
 * The schema of a member's store: every domain's actions and changes, and the rejections.
 *
 * @category schemas
 * @since 0.1.0
 */
export const SyncSchema = EventLog.schema(
  WorkspaceSync.Actions,
  WorkspaceSync.Changes,
  GroupSync.Actions,
  GroupSync.Changes,
  ThreadSync.Actions,
  ThreadSync.Changes,
  TaskSync.Actions,
  TaskSync.Changes,
  TurnSync.Actions,
  TurnSync.Changes,
  NotificationSync.Actions,
  NotificationSync.Changes,
  ConnectionSync.Actions,
  ConnectionSync.Changes,
  AgentSync.Actions,
  AgentSync.Changes,
  ChannelSync.Actions,
  ChannelSync.Changes,
  Rejections.Rejections
)
