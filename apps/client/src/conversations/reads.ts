import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-solid/Hooks"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import { createMemo, type Accessor } from "solid-js"
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts"
import { useWorkspaceClient } from "../provider.tsx"
import {
  groupsRead,
  inboxRead,
  membersRead,
  pendingCountsRead,
  permissionsRead,
  publicGroupsRead,
  rosterRead,
  streamRead,
  threadRead,
  timelineRead,
  type Group,
  type GroupMembership,
  type InboxFilter,
  type Member,
  type NotificationInbox,
  type PagedRead,
  type Thread,
  type ThreadTimeline
} from "./api.ts"

/** A live read: its latest value, kept while it refreshes or a refresh fails. */
export interface Read<A> {
  readonly value: Accessor<A | undefined>
  /** Why the latest read failed, once it settles; `value` keeps the last one that succeeded. */
  readonly failure: Accessor<WorkspaceFailure | undefined>
  /** The first value is loading. */
  readonly loading: Accessor<boolean>
  readonly retry: () => void
}
const unread: Read<never> = {
  value: () => undefined,
  failure: () => "gone",
  loading: () => false,
  retry: () => {}
}
function connect<A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>): Read<A> {
  const result = useAtomValue(() => atom),
    retry = useAtomRefresh(() => atom)
  return {
    value: () => Option.getOrUndefined(AsyncResult.value(result())),
    failure: () => {
      const current = result()
      return AsyncResult.isFailure(current) && !current.waiting ? workspaceFailure(current.cause) : undefined
    },
    loading: () => {
      const current = result()
      return Option.isNone(AsyncResult.value(current)) && !AsyncResult.isFailure(current)
    },
    retry
  }
}

/** The reader's groups in a workspace, live while mounted. */
export function useGroups(workspaceId: string): Read<ReadonlyArray<Group.ListItem>> {
  const read = groupsRead(useWorkspaceClient(workspaceId), workspaceId)
  return read ? connect(read) : unread
}

/**
 * The public groups the reader may join, with how many belong to each and whether the reader
 * does, live while mounted as groups are created, renamed, joined, and left.
 */
export function usePublicGroups(workspaceId: string): Read<ReadonlyArray<Group.PublicItem>> {
  const read = publicGroupsRead(useWorkspaceClient(workspaceId), workspaceId)
  return read ? connect(read) : unread
}

/** A group's current members, live while mounted: whom its messages can mention. */
export function useGroupRoster(
  workspaceId: string,
  groupId: string
): Read<ReadonlyArray<GroupMembership.GroupMembership>> {
  const read = rosterRead(useWorkspaceClient(workspaceId), workspaceId, groupId)
  return read ? connect(read) : unread
}
export interface Members {
  /** A workspace member by ID, current or removed, once the members have loaded. */
  readonly member: (memberId: string) => Member.Member | undefined
  /** Every member, current or removed, once loaded. */
  readonly all: Accessor<ReadonlyArray<Member.Member> | undefined>
}
/** The workspace's members, to name who wrote what and choose whom to include. */
export function useMembers(workspaceId: string): Members {
  const read = membersRead(useWorkspaceClient(workspaceId), workspaceId)
  if (!read) return { member: () => undefined, all: () => undefined }
  const members = connect(read)
  const byId = createMemo(() => new Map((members.value() ?? []).map((member) => [member.id as string, member])))
  return { member: (memberId) => byId().get(memberId), all: members.value }
}

/**
 * Whether the reader may do something across the workspace, by permission name, once known and
 * live while mounted, so a page offers only what they may do.
 */
export function useWorkspacePermission(workspaceId: string, permission: string): Accessor<boolean | undefined> {
  const read = permissionsRead(useWorkspaceClient(workspaceId), workspaceId)
  if (!read) return () => undefined
  const permissions = connect(read)
  return () => permissions.value()?.some((name) => name === permission)
}

/**
 * How many notifications are still pending for the reader, live while mounted: in all, the inbox's
 * own count, including those from groups they have left, and from each group's threads.
 */
export function usePendingCounts(workspaceId: string): Read<NotificationInbox.Counts> {
  const read = pendingCountsRead(useWorkspaceClient(workspaceId), workspaceId)
  return read ? connect(read) : unread
}

/** How many notifications are still pending for the reader in all, live while mounted. */
export function useInboxPending(workspaceId: string): Accessor<number | undefined> {
  const counts = usePendingCounts(workspaceId)
  return () => counts.value()?.pending
}

/** A view that opens at its newest items and pages back on request. */
export interface PagedView<A> extends Read<ReadonlyArray<A>> {
  /** Nothing older remains to read. */
  readonly complete: Accessor<boolean>
  /** An older page is loading. */
  readonly loadingEarlier: Accessor<boolean>
  /** The last older page failed to load; `loadEarlier` tries it again. */
  readonly earlierFailed: Accessor<boolean>
  /** Read one page further back, unless one is loading or nothing older remains. */
  readonly loadEarlier: () => void
}
const unpaged: PagedView<never> = {
  ...unread,
  complete: () => true,
  loadingEarlier: () => false,
  earlierFailed: () => false,
  loadEarlier: () => {}
}
function page<A, E>(read: PagedRead<A, E>): PagedView<A> {
  const base = connect(read.atom)
  const result = useAtomValue(() => read.atom),
    requested = useAtomValue(() => read.earlier),
    request = useAtomSet(() => read.earlier)
  const view = () => Option.getOrUndefined(AsyncResult.value(result()))
  // An older page was asked for and has not arrived.
  const outstanding = () => {
    const current = view()
    return current !== undefined && requested() > current.earlier
  }
  const loadingEarlier = () => outstanding() && result().waiting
  const earlierFailed = () => outstanding() && !result().waiting && AsyncResult.isFailure(result())
  return {
    ...base,
    value: () => view()?.items,
    complete: () => view()?.complete ?? false,
    loadingEarlier,
    earlierFailed,
    loadEarlier: () => {
      const current = view()
      if (current === undefined || current.complete || loadingEarlier()) return
      // After a failure the request stands, and writing it again changes nothing: read again.
      if (outstanding()) base.retry()
      else request(current.earlier + 1)
    }
  }
}

/** A group's stream of threads by when they started, oldest shown first, live while mounted. */
export function useGroupStream(workspaceId: string, groupId: string): PagedView<Thread.Opening> {
  const read = streamRead(useWorkspaceClient(workspaceId), workspaceId, groupId)
  return read ? page(read) : unpaged
}

/** One thread's record, live while mounted: its title as renamed, its group, and who started it. */
export function useThread(workspaceId: string, threadId: string): Read<Thread.Thread> {
  const read = threadRead(useWorkspaceClient(workspaceId), workspaceId, threadId)
  return read ? connect(read) : unread
}

/** A thread's timeline from its newest activity, oldest shown first, live while mounted. */
export function useThreadTimeline(workspaceId: string, threadId: string): PagedView<ThreadTimeline.Item> {
  const read = timelineRead(useWorkspaceClient(workspaceId), workspaceId, threadId)
  return read ? page(read) : unpaged
}

/**
 * The reader's inbox, newest first and live while mounted: every notification, or those still
 * pending for them. Older notifications load on request.
 */
export function useInbox(workspaceId: string, filter: InboxFilter): PagedView<NotificationInbox.Item> {
  const read = inboxRead(useWorkspaceClient(workspaceId), workspaceId, filter)
  return read ? page(read) : unpaged
}
