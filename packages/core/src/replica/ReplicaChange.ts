/**
 * What a member's replica receives as the workspace changes: for each commit, one batch of the
 * changes to the records it holds, and the outcomes of the member's own requests the commit
 * recorded, whole, so a replica applies a commit or none of it. A batch names its commit's position,
 * which the member's browser keeps, to ask for what follows it when it reconnects, and when the
 * commit was recorded.
 *
 * @since 0.1.0
 */

import * as Entry from "@amends-dev/log/Entry"
import * as Schema from "effect/Schema"
import * as CoreError from "../error/CoreError.ts"
import * as Request from "../request/Request.ts"
import * as ReplicaRecord from "./ReplicaRecord.ts"

/**
 * One change to a replica: `Changed`, a record as it is now, which the replica holds from then
 * on; `Dropped`, a record that left the member's reach, and with a group or a thread everything in
 * it; `Reset`, everything the replica held dropped, before the records it holds now; and
 * `Completed` and `Rejected`, how one of the member's own requests ended.
 *
 * @category schemas
 * @since 0.1.0
 */
export const ReplicaChange = Schema.TaggedUnion({
  Changed: { record: ReplicaRecord.ReplicaRecord },
  Dropped: { key: ReplicaRecord.Key },
  Reset: {},
  Completed: { key: Request.Key },
  Rejected: { key: Request.Key, error: CoreError.Rejection }
})

/**
 * @category schemas
 * @since 0.1.0
 */
export type ReplicaChange = typeof ReplicaChange.Type

/**
 * The changes one commit makes to a replica, at the commit's position and time. A reset's batch is
 * at the position it reset to, as of when it was read.
 *
 * @category schemas
 * @since 0.1.0
 */
export const Batch = Schema.Struct({
  position: Entry.Position,
  recordedAt: Schema.DateTimeUtcFromString,
  changes: Schema.Array(ReplicaChange)
})

/**
 * @category schemas
 * @since 0.1.0
 */
export interface Batch extends Schema.Schema.Type<typeof Batch> {}
