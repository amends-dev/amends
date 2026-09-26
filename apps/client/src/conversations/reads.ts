import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Option } from "effect";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";
import { createMemo, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  groupsRead,
  inboxRead,
  membersRead,
  pendingCountRead,
  permissionsRead,
  rosterRead,
  streamRead,
  timelineRead,
  type Group,
  type GroupMembership,
  type InboxFilter,
  type Member,
  type NotificationInbox,
  type PagedRead,
  type Thread,
  type ThreadTimeline,
} from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";

/** A live read: its latest value, kept while it refreshes or a refresh fails. */
export interface Read<A> {
  readonly value: Accessor<A | undefined>;
  /** Why the latest read failed, once it settles; `value` keeps the last one that succeeded. */
  readonly failure: Accessor<WorkspaceFailure | undefined>;
  /** The first value is loading. */
  readonly loading: Accessor<boolean>;
  readonly retry: () => void;
}
const unread: Read<never> = {
  value: () => undefined,
  failure: () => "gone",
  loading: () => false,
  retry: () => {},
};
function connect<A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>): Read<A> {
  const result = useAtomValue(() => atom),
    retry = useAtomRefresh(() => atom);
  return {
    value: () => Option.getOrUndefined(AsyncResult.value(result())),
    failure: () => {
      const current = result();
      return AsyncResult.isFailure(current) && !current.waiting
        ? workspaceFailure(current.cause)
        : undefined;
    },
    loading: () => {
      const current = result();
      return Option.isNone(AsyncResult.value(current)) && !AsyncResult.isFailure(current);
    },
    retry,
  };
}

/** The reader's groups in a workspace, live while mounted. */
export function useGroups(workspaceId: string): Read<ReadonlyArray<Group.ListItem>> {
  const read = groupsRead(useApiClient(), workspaceId);
  return read ? connect(read) : unread;
}

/** A group's current members, live while mounted: whom its messages can mention. */
export function useGroupRoster(
  workspaceId: string,
  groupId: string,
): Read<ReadonlyArray<GroupMembership.Record>> {
  const read = rosterRead(useApiClient(), workspaceId, groupId);
  return read ? connect(read) : unread;
}
export interface Members {
  /** A workspace member by ID, current or removed, once the members have loaded. */
  readonly member: (memberId: string) => Member.Record | undefined;
  /** Every member, current or removed, once loaded. */
  readonly all: Accessor<ReadonlyArray<Member.Record> | undefined>;
}
/** The workspace's members, to name who wrote what and choose whom to include. */
export function useMembers(workspaceId: string): Members {
  const read = membersRead(useApiClient(), workspaceId);
  if (!read) return { member: () => undefined, all: () => undefined };
  const members = connect(read);
  const byId = createMemo(
    () => new Map((members.value() ?? []).map((member) => [member.id as string, member])),
  );
  return { member: (memberId) => byId().get(memberId), all: members.value };
}

/**
 * Whether the reader may do something across the workspace, by permission name, once known and
 * live while mounted, so a page offers only what they may do.
 */
export function useWorkspacePermission(
  workspaceId: string,
  permission: string,
): Accessor<boolean | undefined> {
  const read = permissionsRead(useApiClient(), workspaceId);
  if (!read) return () => undefined;
  const permissions = connect(read);
  return () => permissions.value()?.some((name) => name === permission);
}

/**
 * How many notifications are still pending for the reader, live while mounted: the inbox's own
 * count, including those from groups they have left.
 */
export function useInboxPending(workspaceId: string): Accessor<number | undefined> {
  const read = pendingCountRead(useApiClient(), workspaceId);
  if (!read) return () => undefined;
  const count = connect(read);
  return () => count.value()?.pending;
}

/** A view that opens at its newest items and pages back on request. */
export interface PagedView<A> extends Read<ReadonlyArray<A>> {
  /** Nothing older remains to read. */
  readonly complete: Accessor<boolean>;
  /** An older page is loading. */
  readonly loadingEarlier: Accessor<boolean>;
  /** Read one page further back, unless one is loading or nothing older remains. */
  readonly loadEarlier: () => void;
}
const unpaged: PagedView<never> = {
  ...unread,
  complete: () => true,
  loadingEarlier: () => false,
  loadEarlier: () => {},
};
function page<A, E>(read: PagedRead<A, E>): PagedView<A> {
  const base = connect(read.atom);
  const result = useAtomValue(() => read.atom),
    requested = useAtomValue(() => read.earlier),
    request = useAtomSet(() => read.earlier);
  const view = () => Option.getOrUndefined(AsyncResult.value(result()));
  const loadingEarlier = () => {
    const current = view();
    return current !== undefined && result().waiting && requested() > current.earlier;
  };
  return {
    ...base,
    value: () => view()?.items,
    complete: () => view()?.complete ?? false,
    loadingEarlier,
    loadEarlier: () => {
      const current = view();
      if (current === undefined || current.complete || loadingEarlier()) return;
      request(current.earlier + 1);
    },
  };
}

/** A group's stream of threads by when they started, oldest shown first, live while mounted. */
export function useGroupStream(workspaceId: string, groupId: string): PagedView<Thread.Opening> {
  const read = streamRead(useApiClient(), workspaceId, groupId);
  return read ? page(read) : unpaged;
}

/** A thread's timeline from its newest activity, oldest shown first, live while mounted. */
export function useThreadTimeline(
  workspaceId: string,
  threadId: string,
): PagedView<ThreadTimeline.Item> {
  const read = timelineRead(useApiClient(), workspaceId, threadId);
  return read ? page(read) : unpaged;
}

/**
 * The reader's inbox, newest first and live while mounted: every notification, or those still
 * pending for them. Older notifications load on request.
 */
export function useInbox(
  workspaceId: string,
  filter: InboxFilter,
): PagedView<NotificationInbox.Item> {
  const read = inboxRead(useApiClient(), workspaceId, filter);
  return read ? page(read) : unpaged;
}
