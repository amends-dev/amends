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
import * as Option from "effect/Option"
import * as Requirement from "../authorization/Requirement.ts"
import * as Target from "../authorization/Target.ts"
import * as Group from "../group/Group.ts"
import type * as GroupId from "../group/GroupId.ts"
import * as GroupPermissions from "../group/GroupPermissions.ts"
import * as GroupStore from "../group/GroupStore.ts"
import type * as Audience from "../journal/Audience.ts"
import type * as Event from "../journal/Event.ts"
import * as Subject from "../journal/Subject.ts"
import type * as Thread from "../thread/Thread.ts"
import type * as ThreadId from "../thread/ThreadId.ts"
import * as ThreadPermissions from "../thread/ThreadPermissions.ts"
import * as ThreadQuery from "../thread/ThreadQuery.ts"
import * as Turn from "../turn/Turn.ts"
import * as TurnId from "../turn/TurnId.ts"
import * as TurnQuery from "../turn/TurnQuery.ts"
import * as TurnStore from "../turn/TurnStore.ts"
import * as WorkspaceId from "../workspace/WorkspaceId.ts"
import * as ChangeFeed from "./ChangeFeed.ts"

/**
 * A change, with who may see it: readers holding a scope in its audience and the read permission
 * it names, the same permission the read of what it changed requires. `changeFor` gives it as one
 * of them sees it, given whether their grants cover a permission, for a change that shows what the
 * reader may do.
 *
 * @category models
 * @since 0.1.0
 */
export interface Prepared {
  readonly changeFor: (covers: (requirement: Requirement.Requirement) => boolean) => ChangeFeed.Change
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
 * readers; the latest activity of each group those threads are in, to the group's readers; and
 * each turn the entries are about, with the turn it retries, to its thread's readers.
 *
 * @category constructors
 * @since 0.1.0
 */
export const make = Effect.gen(function* () {
  const threadQuery = yield* ThreadQuery.ThreadQuery
  const groupStore = yield* GroupStore.GroupStore
  const turnStore = yield* TurnStore.TurnStore
  const turnQuery = yield* TurnQuery.TurnQuery
  const workspaceId = yield* WorkspaceId.CurrentWorkspaceId
  const readThread = (threadId: ThreadId.ThreadId) =>
    Requirement.make(ThreadPermissions.Read, Target.Reference.cases.Thread.make({ workspaceId, threadId }))
  /** Each turn the subjects name, and the turn each of those retries, whose retry it settles. */
  const turnsChanged = Effect.fnUntraced(function* (subjects: ReadonlyArray<Subject.Subject>) {
    const turns = new Map<TurnId.TurnId, Turn.Turn>()
    const add = Effect.fnUntraced(function* (turnId: TurnId.TurnId) {
      if (turns.has(turnId)) return undefined
      const found = yield* turnStore.get(turnId)
      if (Option.isSome(found)) turns.set(turnId, found.value)
      return Option.getOrUndefined(found)
    })
    for (const subject of subjects) {
      const turnId = Subject.idOf("turn", subject)
      if (turnId === undefined) continue
      const turn = yield* add(TurnId.TurnId.make(turnId))
      if (turn !== undefined && turn.retry !== null) yield* add(turn.retry.of)
    }
    return [...turns.values()]
  })
  /** Each turn as its thread's readers see it, with what each may do with it. */
  const turnChanges = Effect.fnUntraced(function* (subjects: ReadonlyArray<Subject.Subject>) {
    const prepared: Array<Prepared> = []
    for (const turn of yield* turnsChanged(subjects)) {
      const retryOpen = (yield* turnQuery.whyNotRetryable(turn)) === undefined
      prepared.push({
        changeFor: (covers) =>
          ChangeFeed.Change.cases.Turn.make({ turn: Turn.view(turn, covers(Turn.directRequirement(turn)), retryOpen) }),
        audience: [Group.audienceOf(turn.groupId)],
        requirement: readThread(turn.threadId)
      })
    }
    return prepared
  })
  const changesOf = Effect.fn("ChangeFeedChanges.changesOf")(function* (batch: Log.Batch<Event.Envelope>) {
    const subjects = [...new Set(batch.entries.map((entry) => entry.payload.subject))]
    const turns = yield* turnChanges(subjects)
    const about = yield* threadQuery.timelineItemsAbout(subjects)
    if (about.length === 0) return turns
    // A thread's preview shows its latest activity, replies, title, and task, which only change
    // with its timeline.
    const threads = new Map(about.map(({ thread }) => [thread.id, thread] as const))
    const previews = yield* threadQuery.previewsOf(yield* threadQuery.listedOf([...threads.values()]))
    // A group's latest activity is its threads' latest message.
    const groups = yield* groupStore.getLatest([...new Set(previews.map(({ thread }) => thread.groupId))])
    const toGroupReaders = (groupId: GroupId.GroupId, change: ChangeFeed.Change): Prepared => ({
      changeFor: () => change,
      audience: [Group.audienceOf(groupId)],
      requirement: Requirement.make(GroupPermissions.Read, Target.Reference.cases.Group.make({ workspaceId, groupId }))
    })
    const toThreadReaders = (thread: Thread.Thread, change: ChangeFeed.Change): Prepared => ({
      changeFor: () => change,
      audience: [Group.audienceOf(thread.groupId)],
      requirement: readThread(thread.id)
    })
    return [
      ...about.map(({ thread, item }) => toThreadReaders(thread, ChangeFeed.Change.cases.TimelineItem.make({ item }))),
      ...previews.map((preview) => toThreadReaders(preview.thread, ChangeFeed.Change.cases.Preview.make({ preview }))),
      ...groups.map((latest) => toGroupReaders(latest.groupId, ChangeFeed.Change.cases.GroupLatest.make({ latest }))),
      ...turns
    ]
  })
  return ChangeFeedChanges.of({ changesOf })
})

/**
 * `ChangeFeedChanges` from `make`, over the thread and turn queries and their stores.
 *
 * @category layers
 * @since 0.1.0
 */
export const layer = Layer.effect(ChangeFeedChanges, make)
