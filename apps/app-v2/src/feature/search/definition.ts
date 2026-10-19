/**
 * Finding anything in the workspace: a modal with a field, and under it what matches what is typed in the
 * person's replica, as groups, threads, and people, which the arrow keys walk and Enter or a click opens. It
 * opens when its parent asks, and reports the group, the thread, or the person the result opened is.
 */

import { Group, GroupId } from "@amends-dev/core/group"
import { Thread, ThreadId } from "@amends-dev/core/thread"
import { Member, MemberId, WorkspaceId } from "@amends-dev/core/workspace"
import { DialogBlock } from "@foldkit/ui/dialog"
import * as Option from "effect/Option"
import * as Schema from "effect/Schema"
import { Block } from "foldkit"
import { defineMessageUnion } from "foldkit/message"
import { defineTaggedUnion } from "foldkit/schema"

/** A group the search found, with its name as the person reads it. */
export const GroupMatch = Schema.Struct({ group: Group.Group, name: Schema.String })
export type GroupMatch = typeof GroupMatch.Type

/** A thread the search found, with the name of its group and the words the person reads it by. */
export const ThreadMatch = Schema.Struct({ thread: Thread.Thread, groupName: Schema.String, words: Schema.String })
export type ThreadMatch = typeof ThreadMatch.Type

/** What the search found, as the store gives it. */
export const SearchResults = Schema.Struct({
  groups: Schema.Array(GroupMatch),
  threads: Schema.Array(ThreadMatch),
  people: Schema.Array(Member.Member)
})
export type SearchResults = typeof SearchResults.Type

/**
 * Where the search for what is typed stands: nothing typed yet, on its way, found for the query it answers, or
 * failed.
 */
export const Results = defineTaggedUnion({
  Idle: {},
  Searching: { query: Schema.String },
  Found: { query: Schema.String, results: SearchResults },
  Failed: { error: Schema.String }
})
export type Results = typeof Results.Type

/** One result the person can open: a group, a thread, or a person. */
export const Result = defineTaggedUnion({
  Group: GroupMatch.fields,
  Thread: ThreadMatch.fields,
  Person: { member: Member.Member }
})
export type Result = typeof Result.Type

/**
 * Whose search, what is typed in its field, where the search for it stands, which result is active, and the
 * dialog it is in.
 */
export const Model = Schema.Struct({
  workspaceId: WorkspaceId.WorkspaceId,
  memberId: MemberId.MemberId,
  query: Schema.String,
  results: Results,
  activeIndex: Schema.Int,
  dialog: DialogBlock.Model
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  RequestedOpen: {},
  TypedQuery: { query: Schema.String },
  CompletedSearch: { query: Schema.String, results: SearchResults },
  FailedSearch: { query: Schema.String, error: Schema.String },
  MovedActive: { to: Schema.Int },
  CompletedScrollToResult: {},
  ChoseActive: {},
  ClickedResult: { result: Result }
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  OpenedGroup: { groupId: GroupId.GroupId },
  OpenedThread: { groupId: GroupId.GroupId, threadId: ThreadId.ThreadId },
  OpenedPerson: { memberId: MemberId.MemberId }
})
export type OutMessage = typeof OutMessage.Type

export const SearchDefinition = Block.makeDefinition("Search", { Model, Message, OutMessage })

/** Whether `query` holds anything to search for: more than spaces. */
export const isSearchable = (query: string): boolean => query.trim() !== ""

/** What was found as one list, the order the person walks it in: the groups, then the threads, then the people. */
export const resultsOf = ({ groups, threads, people }: SearchResults): ReadonlyArray<Result> => [
  ...groups.map((match) => Result.Group(match)),
  ...threads.map((match) => Result.Thread(match)),
  ...people.map((member) => Result.Person({ member }))
]

/** The id of the button that opens `result`, which the field names as its active descendant. */
export const resultId = (result: Result): string =>
  Result.match(result, {
    Group: ({ group }) => `search-group-${group.id}`,
    Thread: ({ thread }) => `search-thread-${thread.id}`,
    Person: ({ member }) => `search-person-${member.id}`
  })

/** The results shown, which are the last search's until the search for what is typed now answers. */
export const shownResults = (model: Model): ReadonlyArray<Result> =>
  Results.matchOrElse(model.results, { Found: ({ results }) => resultsOf(results) }, (): ReadonlyArray<Result> => [])

/** The result the person has reached with the arrow keys, while the search for what is typed has answered. */
export const activeResult = (model: Model): Option.Option<Result> =>
  Results.matchOrElse(
    model.results,
    {
      Found: ({ query, results }) =>
        query === model.query ? Option.fromUndefinedOr(resultsOf(results)[model.activeIndex]) : Option.none()
    },
    () => Option.none()
  )
