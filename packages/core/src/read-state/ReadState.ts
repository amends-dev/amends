/**
 * Read state is how far a person has read: each thread by timeline sequence, and each group by when
 * they last read it. It is private to the member; the journal records it as `ReadStateFacts`, and
 * `ReadStateStore` keeps it. What lies past a position is unread, so nothing is recorded per
 * message. `ReadStateService` is the operations that advance it. Agents keep no read state.
 *
 * @since 0.1.0
 */

import * as Schema from "effect/Schema"
import * as GroupId from "../group/GroupId.ts"
import * as ThreadId from "../thread/ThreadId.ts"
import * as MemberId from "../workspace/MemberId.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"

/**
 * How far a human member has read a thread, by timeline sequence. Private to that member.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ThreadPosition = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  threadId: ThreadId.ThreadId,
  readThrough: Schema.Int.check(Schema.isGreaterThan(0))
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface ThreadPosition extends Schema.Schema.Type<typeof ThreadPosition> {}

/**
 * When a human member last read a group's threads. Private to that member.
 *
 * @category schemas
 * @since 0.1.0
 */
export const GroupRead = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  groupId: GroupId.GroupId,
  readAt: Schema.DateTimeUtcFromString
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface GroupRead extends Schema.Schema.Type<typeof GroupRead> {}

/**
 * What marking a thread read takes: the thread, and the timeline position read through, which may
 * not be past its latest activity.
 *
 * @category options
 * @since 0.1.0
 */
export const MarkThreadReadInput = Schema.Struct({
  threadId: ThreadId.ThreadId,
  throughSequence: ThreadPosition.fields.readThrough
})

/**
 * @category options
 * @since 0.1.0
 */
export interface MarkThreadReadInput extends Schema.Schema.Type<typeof MarkThreadReadInput> {}

/**
 * What marking a group read takes: the group, which is read as of now.
 *
 * @category options
 * @since 0.1.0
 */
export const MarkGroupReadInput = Schema.Struct({ groupId: GroupId.GroupId })

/**
 * @category options
 * @since 0.1.0
 */
export interface MarkGroupReadInput extends Schema.Schema.Type<typeof MarkGroupReadInput> {}
