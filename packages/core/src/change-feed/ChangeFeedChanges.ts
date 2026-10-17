/**
 * What a commit changed in what readers show, which the change feed delivers so that readers put
 * it in place rather than read it again: each change as it is now, with who may see it.
 * `ChangeFeedSource` asks once for each commit it prepares, after the commit, so a change may
 * reflect later commits too, and the last change to anything follows its last commit.
 * `ChangeFeedService` filters what it prepared for each reader, as it filters events.
 *
 * @since 0.1.0
 */

import type { Log, StoreError } from "@amends-dev/log"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as Group from "../group/Group.ts"
import type * as GroupId from "../group/GroupId.ts"
import * as GroupPermissions from "../group/GroupPermissions.ts"
import * as GroupStore from "../group/GroupStore.ts"
import type * as Audience from "../journal/Audience.ts"
import type * as Event from "../journal/Event.ts"
import type * as Thread from "../thread/Thread.ts"
import * as ThreadPermissions from "../thread/ThreadPermissions.ts"
import * as ThreadQuery from "../thread/ThreadQuery.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ChangeFeed from "./ChangeFeed.ts"

/**
 * A change, with who may see it: readers holding a scope in its audience and the read permission
 * it names, the same permission the read of what it changed requires.
 *
 * @category models
 * @since 0.1.0
 */
export interface Prepared {
  readonly change: ChangeFeed.Change
  readonly audience: Audience.Audience
  readonly requirement: Requirement.Requirement
}

/**
 * What commits changed in what readers show, for the change feed.
 *
 * @category services
 * @since 0.1.0
 */
export class ChangeFeedChanges extends Context.Service<
  ChangeFeedChanges,
  {
    /** What one committed batch changed, read as it is now. */
    readonly changesOf: (
      batch: Log.Batch<Event.Envelope>
    ) => Effect.Effect<ReadonlyArray<Prepared>, StoreError.StoreError>
  }
>()("@amends-dev/core/change-feed/ChangeFeedChanges") {}

/**
 * The changes over the queries that read what readers show: every timeline item about what the
 * commit's entries are about, and the preview of each thread those items are in, to the thread's
 * readers, and the latest activity of each group those threads are in, to the group's readers.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const groupStore = yield* GroupStore.GroupStore
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId
  const changesOf = Effect.fn("ChangeFeedChanges.changesOf")(function* (batch: Log.Batch<Event.Envelope>) {
    const subjects = [...new Set(batch.entries.map((entry) => entry.payload.subject))]
    const about = yield* threadQuery.timelineItemsAbout(subjects)
    if (about.length === 0) return []
    // A thread's preview shows its latest activity, replies, title, and task, which only change
    // with its timeline.
    const threads = new Map(about.map(({ thread }) => [thread.id, thread] as const))
    const previews = yield* threadQuery.previewsOf(yield* threadQuery.listedOf([...threads.values()]))
    // A group's latest activity is its threads' latest message.
    const groups = yield* groupStore.getLatest([...new Set(previews.map(({ thread }) => thread.groupId))])
    const toGroupReaders = (groupId: GroupId.GroupId, change: ChangeFeed.Change): Prepared => ({
      change,
      audience: [Group.audienceOf(groupId)],
      requirement: Requirement.make(GroupPermissions.Read, Target.Reference.cases.Group.make({ workspaceId, groupId }))
    })
    const toThreadReaders = (thread: Thread.Thread, change: ChangeFeed.Change): Prepared => ({
      change,
      audience: [Group.audienceOf(thread.groupId)],
      requirement: Requirement.make(
        ThreadPermissions.Read,
        Target.Reference.cases.Thread.make({ workspaceId, threadId: thread.id })
      )
    })
    return [
      ...about.map(({ thread, item }) => toThreadReaders(thread, ChangeFeed.Change.cases.TimelineItem.make({ item }))),
      ...previews.map((preview) => toThreadReaders(preview.thread, ChangeFeed.Change.cases.Preview.make({ preview }))),
      ...groups.map((latest) => toGroupReaders(latest.groupId, ChangeFeed.Change.cases.GroupLatest.make({ latest })))
    ]
  })
  return ChangeFeedChanges.of({ changesOf })
})

/**
 * `ChangeFeedChanges` from `make`, over the thread query and the group store.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChangeFeedChanges, make)
