import { Exit } from "effect";
import { createMemo, createSignal, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { seenRequest, type InboxFilter, type NotificationInbox } from "../api/conversations.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";
import { useInbox, useInboxPending } from "./reads.ts";
import { useMarkAllSeen } from "./seen.ts";
import { toDate } from "./time.ts";
import {
  usePeople,
  useWorkspaceGroups,
  type Author,
  type ConversationStatus,
  type MentionedMember,
} from "./views.ts";

/** Why a notification came: the reader was mentioned, someone replied, or a thread started. */
export type NotificationReason = "mention" | "reply" | "thread";

/** One notification as the inbox lists it. */
export interface InboxEntry {
  readonly id: string;
  readonly at: Date;
  /** Still pending for the reader. */
  readonly unread: boolean;
  /** Why it came, while the reader can read its source; otherwise the thread is unavailable. */
  readonly reason: NotificationReason | undefined;
  readonly author: Author | undefined;
  /** The group it came from: a team by name, or a direct group by its other people. */
  readonly place: { readonly name: string; readonly direct: boolean } | undefined;
  /** What was said, as markdown whose mentions link to members by id. */
  readonly text: string | undefined;
  readonly mentions: ReadonlyArray<MentionedMember>;
  /** Where it points, at the timeline position that notified the reader. */
  readonly thread:
    | { readonly groupId: string; readonly threadId: string; readonly sequence: number }
    | undefined;
}

type Item = NotificationInbox.Item;
const order = (left: Item, right: Item) =>
  right.notification.recordedAt.epochMilliseconds -
    left.notification.recordedAt.epochMilliseconds ||
  (left.notification.id < right.notification.id ? 1 : -1);

/**
 * The reader's inbox, newest first and live while mounted: everything, or only what is still
 * unread. Unread keeps `retain`, the notification open beside it, in place after it is seen, until
 * another opens or it closes. `open` marks a notification seen at once, as opening it does; if
 * that fails, it is unread again and `failed` hears of it, as it does when marking all seen fails.
 */
export function useInboxView(
  workspaceId: string,
  filter: Accessor<InboxFilter>,
  retain: Accessor<string | undefined>,
  events: {
    readonly failed?: (change: "seen" | "all-seen", failure: WorkspaceFailure) => void;
  } = {},
) {
  const session = useSession();
  const people = usePeople(workspaceId);
  const groups = useWorkspaceGroups(workspaceId);
  const all = useInbox(workspaceId, "all");
  const pending = useInbox(workspaceId, "pending");
  const count = useInboxPending(workspaceId);
  const seenAll = useMarkAllSeen(workspaceId, {
    failed: (failure) => events.failed?.("all-seen", failure),
  });
  // Notifications the reader opened here, unread no more even before the inbox refreshes.
  const [opened, setOpened] = createSignal<ReadonlySet<string>>(new Set());
  const [seenError, setSeenError] = createSignal<WorkspaceFailure>();
  const queue: string[] = [];
  const seen = useRequest(
    seenRequest(useApiClient(), workspaceId),
    (exit, notificationId) => {
      if (Exit.isFailure(exit)) {
        const failure = workspaceFailure(exit.cause);
        const unseen = new Set(opened());
        unseen.delete(notificationId);
        setOpened(unseen);
        setSeenError(failure);
        events.failed?.("seen", failure);
      }
      const next = queue.shift();
      if (next !== undefined) seen.run(next);
    },
    { when: () => session.session !== undefined },
  );
  // The last version of every notification read, so a retained one survives leaving Unread.
  const known = new Map<string, Item>();
  const read = () => (filter() === "pending" ? pending : all);
  const items = createMemo(() => {
    for (const item of all.value() ?? []) known.set(item.notification.id, item);
    for (const item of pending.value() ?? []) known.set(item.notification.id, item);
    const listed = read().value();
    if (listed === undefined) return undefined;
    const kept = retain();
    const retained = kept === undefined ? undefined : known.get(kept);
    if (filter() !== "pending" || !retained || listed.some((item) => item.notification.id === kept))
      return listed;
    return [...listed, retained].toSorted(order);
  });
  const placeOf = (groupId: string | undefined) => {
    const group = groupId === undefined ? undefined : groups.group(groupId);
    return group && { name: group.name, direct: group.kind === "direct" };
  };
  const entryOf = ({ notification, source }: Item): InboxEntry => {
    const readable = source !== undefined && "message" in source ? source : undefined;
    const recipient = notification.recipient;
    const mentioned =
      readable !== undefined &&
      "memberId" in recipient &&
      readable.message.mentions.includes(recipient.memberId);
    return {
      id: notification.id,
      at: toDate(notification.recordedAt),
      unread: notification.state._tag === "Pending" && !opened().has(notification.id),
      reason:
        readable === undefined
          ? undefined
          : mentioned
            ? "mention"
            : readable.activity.sequence === 1
              ? "thread"
              : "reply",
      author: readable && people.authorOf(readable.message.author),
      place: readable ? placeOf(notification.thread?.groupId) : undefined,
      text: readable?.message.text,
      mentions: readable ? people.mentionsOf(readable.message.text) : [],
      thread: readable ? notification.thread : undefined,
    };
  };
  const entries = createMemo(() => (items() ?? []).map(entryOf));
  return {
    entries,
    status: (): ConversationStatus | undefined =>
      items() !== undefined ? undefined : read().failure() ? "failed" : "loading",
    retry: () => read().retry(),
    earlier: () => items() !== undefined && !read().complete(),
    loadingEarlier: () => read().loadingEarlier(),
    earlierFailed: () => read().earlierFailed(),
    loadEarlier: () => read().loadEarlier(),
    /** How many notifications are still unread, the inbox's own count. */
    unread: count,
    /** Mark a notification seen as the reader opens it. */
    open: (notificationId: string) => {
      const entry = entries().find((candidate) => candidate.id === notificationId);
      if (!entry?.unread) return;
      setOpened(new Set([...opened(), notificationId]));
      setSeenError(undefined);
      if (!seen.run(notificationId)) queue.push(notificationId);
    },
    seenError,
    /** Mark everything seen through the newest notification listed; later arrivals stay unread. */
    markAllSeen: () => {
      const newest = all.value()?.[0]?.notification;
      if (newest) seenAll.markAllSeen(newest);
    },
    markingAll: seenAll.pending,
    markAllError: seenAll.error,
  };
}
