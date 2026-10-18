/**
 * The facts recorded about read state: a person read a thread through a position, or read a group.
 * `ReadStateProjection` keeps `ReadStateStore` from them, and `NotificationProjection` marks what
 * the person had pending from a thread seen as they read it. Both happen when the fact is recorded,
 * so its time is when they read.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as Fact from "../journal/Fact.ts"
import * as Subject from "../journal/Subject.ts"
import * as ReadState from "./ReadState.ts"

/**
 * A person read a thread through a timeline position. Recording one at or before their position
 * leaves it where it is.
 *
 * @category facts
 * @since 0.1.0
 */
export const ThreadRead = Fact.make("read-state.thread-read", {
  version: 1,
  subject: (payload) => Subject.make("thread-position", JSON.stringify([payload.memberId, payload.threadId])),
  payload: ReadState.ThreadPosition
})

/**
 * A person read a group's threads.
 *
 * @category facts
 * @since 0.1.0
 */
export const GroupRead = Fact.make("read-state.group-read", {
  version: 1,
  subject: (payload) => Subject.make("group-read", JSON.stringify([payload.memberId, payload.groupId])),
  payload: Schema.Struct({
    workspaceId: ReadState.GroupRead.fields.workspaceId,
    memberId: ReadState.GroupRead.fields.memberId,
    groupId: ReadState.GroupRead.fields.groupId
  })
})
