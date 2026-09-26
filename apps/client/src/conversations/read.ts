import { createEffect, createSignal, onCleanup, type Accessor } from "solid-js";
import { useApiClient } from "../api/context.tsx";
import { readRequest, type ReadMark } from "../api/conversations.ts";
import { useRequest } from "../request/use-request.ts";
import { useSession } from "../session/provider.tsx";

/** Whether the page is showing, so that what it shows can count as read. */
export function usePageVisible(): Accessor<boolean> {
  const [visible, setVisible] = createSignal(document.visibilityState === "visible");
  const update = () => setVisible(document.visibilityState === "visible");
  document.addEventListener("visibilitychange", update);
  onCleanup(() => document.removeEventListener("visibilitychange", update));
  return visible;
}
/**
 * Send read marks for one target while mounted and the page is visible, one at a time. `due`
 * is what is unread now, as a number that grows with newer activity; each value is marked once.
 * A mark that fails is tried again only once something newer is due.
 */
function useReadMarks(
  workspaceId: string,
  due: Accessor<number | undefined>,
  mark: (value: number) => ReadMark,
) {
  const session = useSession();
  const visible = usePageVisible();
  let attempted: number | undefined;
  const request = useRequest(readRequest(useApiClient(), workspaceId), () => {}, {
    when: () => session.session !== undefined,
  });
  createEffect(() => {
    const value = due();
    if (value === undefined || !visible() || request.pending()) return;
    if (attempted !== undefined && value <= attempted) return;
    attempted = value;
    request.run(mark(value));
  });
}
/**
 * While mounted and visible, mark a thread read through `through`, its newest timeline position
 * shown, again whenever newer activity is shown.
 */
export function useMarkThreadRead(
  workspaceId: string,
  threadId: string,
  through: Accessor<number | undefined>,
) {
  useReadMarks(workspaceId, through, (value) => ({ kind: "thread", threadId, through: value }));
}
/**
 * While mounted and visible, mark a group caught up whenever `unreadSince` names new activity in
 * it: a time, in epoch milliseconds, that grows with newer activity, or undefined when nothing is
 * new to the reader.
 */
export function useMarkGroupRead(
  workspaceId: string,
  groupId: string,
  unreadSince: Accessor<number | undefined>,
) {
  useReadMarks(workspaceId, unreadSince, () => ({ kind: "group", groupId }));
}
