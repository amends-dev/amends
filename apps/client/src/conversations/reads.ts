import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Option } from "effect";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";
import { createMemo, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import {
  groupsRead,
  membersRead,
  streamRead,
  timelineRead,
  type Group,
  type Member,
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

export interface Members {
  /** A workspace member by ID, current or removed, once the members have loaded. */
  readonly member: (memberId: string) => Member.Record | undefined;
}
/** The workspace's members, to name who wrote what. */
export function useMembers(workspaceId: string): Members {
  const read = membersRead(useApiClient(), workspaceId);
  if (!read) return { member: () => undefined };
  const members = connect(read);
  const byId = createMemo(
    () => new Map((members.value() ?? []).map((member) => [member.id as string, member])),
  );
  return { member: (memberId) => byId().get(memberId) };
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
