import type { ConversationStatus } from "@amends-dev/ui/screens/group";
import type { InboxItem } from "@amends-dev/ui/screens/inbox";
import * as Exit from "effect/Exit";
import { createMemo, createSignal, type Accessor } from "solid-js";
import {
  markSeen,
  type InboxFilter,
  type NotificationInbox,
  Notification,
  ThreadMessage,
} from "./api.ts";
import { workspaceFailure, type WorkspaceFailure } from "../api/failures.ts";
import { useWorkspaceMutation } from "../api/mutation.ts";
import { useInbox, useInboxPending } from "./reads.ts";
import { useMarkAllSeen } from "./seen.ts";
import { toDate } from "./time.ts";
import { usePeople, useWorkspaceGroups } from "./views.ts";

/** One notification as the inbox lists it, with where it points, for the page that links it. */
export type InboxEntry = Omit<InboxItem, "href"> & {
  /** Its thread, at the timeline position that notified the reader. */
  readonly thread:
    | { readonly groupId: string; readonly threadId: string; readonly sequence: number }
    | undefined;
};

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
  // Opened notifications waiting their turn to be marked seen, one request at a time.
  const queue: Array<string> = [];
  const seen = useWorkspaceMutation(workspaceId, markSeen);
  async function markOpenedSeen() {
    for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
      const exit = await seen.run(next);
      if (exit === undefined) return;
      if (Exit.isSuccess(exit)) continue;
      const failure = workspaceFailure(exit.cause);
      const unseen = new Set(opened());
      unseen.delete(next);
      setOpened(unseen);
      setSeenError(failure);
      events.failed?.("seen", failure);
    }
  }
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
    // A deleted message has no text to show; the notification still says where it was.
    const content =
      readable !== undefined && ThreadMessage.Content.isAnyOf(["Text"])(readable.message.content)
        ? readable.message.content
        : undefined;
    const recipient = notification.recipient;
    const mentioned =
      content !== undefined &&
      "memberId" in recipient &&
      content.mentions.includes(recipient.memberId);
    return {
      id: notification.id,
      at: toDate(notification.recordedAt),
      unread:
        Notification.State.isAnyOf(["Pending"])(notification.state) &&
        !opened().has(notification.id),
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
      text: content?.text,
      mentions: content ? people.mentionsOf(content.text) : [],
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
      queue.push(notificationId);
      if (!seen.pending()) void markOpenedSeen();
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
