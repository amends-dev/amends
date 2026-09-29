import { paths, useInboxView, useWorkspace } from "@amends/client";
import { InboxPane, type InboxTab } from "@amends/ui/screens/inbox";
import { useParams, useSearchParams } from "@solidjs/router";
import { createEffect, createSignal } from "solid-js";
import { useWorkspaceActions } from "../workspace-actions.ts";

const href = (path: string) => `#${path}`;
/** The reader's inbox; the workspace layout shows a thread opened from it beside it. */
export function InboxPage() {
  const params = useParams<{ workspaceId: string; threadId?: string }>();
  const [search] = useSearchParams<{ at?: string }>();
  const workspace = useWorkspace(() => params.workspaceId);
  const [tab, setTab] = createSignal<InboxTab>("all");
  // The notification whose thread is open beside the inbox, kept in Unread while it is.
  const [selected, setSelected] = createSignal<string>();
  const actions = useWorkspaceActions();
  const view = useInboxView(
    params.workspaceId,
    () => (tab() === "unread" ? "pending" : "all"),
    selected,
    {
      failed: (change) =>
        actions.toast(
          change === "seen"
            ? "Couldn’t mark that notification seen."
            : "Couldn’t mark everything seen. Try again.",
        ),
    },
  );
  // A thread opened by its address, or closed: follow the route.
  createEffect(() => {
    const threadId = params.threadId;
    if (threadId === undefined) return setSelected(undefined);
    const sequence = Number(search.at);
    const current = view.entries().find((entry) => entry.id === selected());
    if (current?.thread?.threadId === threadId) return;
    const match = view
      .entries()
      .find((entry) => entry.thread?.threadId === threadId && entry.thread.sequence === sequence);
    if (match) setSelected(match.id);
  });
  return (
    <InboxPane
      workspaceName={workspace()?.workspace.name ?? ""}
      tab={tab()}
      tabHref={() => href(paths.workspacePage(params.workspaceId, "inbox"))}
      onTabChange={setTab}
      unreadCount={view.unread()}
      items={view.entries().map((entry) => ({
        id: entry.id,
        at: entry.at,
        unread: entry.unread,
        reason: entry.reason,
        author: entry.author,
        place: entry.place,
        text: entry.text,
        mentions: entry.mentions,
        href: entry.thread
          ? href(
              paths.inboxThread(
                params.workspaceId,
                entry.thread.groupId,
                entry.thread.threadId,
                entry.thread.sequence,
              ),
            )
          : undefined,
      }))}
      selectedId={selected()}
      onOpen={(id) => {
        setSelected(id);
        view.open(id);
      }}
      onMarkAllSeen={view.markAllSeen}
      markingAll={view.markingAll()}
      status={
        view.status() === "failed" ? "failed" : view.status() === "loading" ? "loading" : undefined
      }
      onRetry={view.retry}
      earlier={
        view.earlier()
          ? {
              loading: view.loadingEarlier(),
              failed: view.earlierFailed(),
              onLoad: view.loadEarlier,
            }
          : undefined
      }
    />
  );
}
