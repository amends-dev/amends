/** Day grouping and message stacking for the thread list. */

import * as Array from "effect/Array"
import type * as DateTime from "effect/DateTime"
import * as Option from "effect/Option"
import { isStackedUnder, type Stackable } from "../../../view/messages.ts"
import { type Day, groupByDay } from "../../../view/time.ts"
import { byCreated, type ThreadItem } from "../definition.ts"

/**
 * `items` oldest first by when their threads were created, as the days they were created on by the person's own
 * clock, each named as it is from `now`: "Today", "Yesterday", a weekday, or a date.
 */
export const byDay = (items: ReadonlyArray<ThreadItem>, now: DateTime.Utc): ReadonlyArray<Day<ThreadItem>> =>
  groupByDay(Array.sort(items, byCreated), ({ thread }) => thread.createdAt, now)

/**
 * What a thread's opening is to the thread before it when they stack: who wrote it, when the thread began, and replies.
 */
const stackableOf = (item: ThreadItem): Option.Option<Stackable> =>
  Option.map(item.opening, ({ author }) => ({
    author,
    at: item.thread.createdAt,
    hasReplies: item.replies > 0
  }))

/**
 * Whether the opening of `item` stacks under the opening of `previous`, the thread just before it within a day, as the
 * timeline stacks messages: see `isStackedUnder`. An opening not yet read stacks under none and none stacks under it.
 */
export const openingStacksUnder = (item: ThreadItem, previous: ThreadItem | undefined): boolean =>
  Option.exists(stackableOf(item), (stackable) =>
    isStackedUnder(stackable, Option.getOrUndefined(Option.flatMap(Option.fromUndefinedOr(previous), stackableOf)))
  )
