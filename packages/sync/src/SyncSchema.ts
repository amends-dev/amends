/**
 * Every event a member's store holds, as one Effect eventlog schema: the actions their browser
 * writes, and the changes the server writes back. The server and the browser build their event logs
 * over it.
 *
 * @since 0.1.0
 */

import * as EventLog from "effect/eventlog/EventLog"
import * as AgentSync from "./AgentSync.ts"
import * as ChannelSync from "./ChannelSync.ts"
import * as ConnectionSync from "./ConnectionSync.ts"
import * as GroupSync from "./GroupSync.ts"
import * as NotificationSync from "./NotificationSync.ts"
import * as ReplicaSync from "./ReplicaSync.ts"
import * as TaskSync from "./TaskSync.ts"
import * as ThreadSync from "./ThreadSync.ts"
import * as TurnSync from "./TurnSync.ts"
import * as WorkspaceSync from "./WorkspaceSync.ts"

/**
 * The schema of a member's store: every domain's actions, and the replica's changes.
 *
 * @category schemas
 * @since 0.1.0
 */
export const SyncSchema = EventLog.schema(
  WorkspaceSync.Actions,
  GroupSync.Actions,
  ThreadSync.Actions,
  TaskSync.Actions,
  TurnSync.Actions,
  NotificationSync.Actions,
  ConnectionSync.Actions,
  AgentSync.Actions,
  ChannelSync.Actions,
  ReplicaSync.Changes
)
