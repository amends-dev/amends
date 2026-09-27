import { For, Match, Show, Switch, createMemo } from "solid-js";
import { IconAlertTriangle, IconCheck, IconMarkMail, IconMessage } from "@amends/icons";
import { Avatar } from "../../components/avatar/index.ts";
import { Button } from "../../components/button/index.ts";
import { Divider } from "../../components/divider/index.ts";
import { EmptyState } from "../../components/empty-state/index.ts";
import type { MessageAuthor } from "../../components/message/index.ts";
import { Message } from "../../components/message/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Keyed } from "../../internal/keyed.tsx";
import { agoLabel, dayLabel, dayOf, fullTime } from "../../internal/when.ts";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import type { MessagePart } from "../timeline/index.ts";
import * as s from "./inbox.css.ts";

/** Why a notification came: the reader was mentioned, someone replied, or a thread started. */
export type NotificationReason = "mention" | "reply" | "thread";

/** One notification in the inbox. */
export interface InboxItem {
  readonly id: string;
  readonly at: Date;
  /** Still unread for the reader. */
  readonly unread: boolean;
  /** Why it came, while its thread is readable; otherwise it shows as unavailable. */
  readonly reason?: NotificationReason;
  readonly author?: MessageAuthor;
  /** The group: a team by name, or a direct conversation by its people. */
  readonly place?: { readonly name: string; readonly direct: boolean };
  readonly text?: readonly MessagePart[];
  /** Opens its thread beside the inbox; absent while it is unavailable. */
  readonly href?: string;
}

export type InboxTab = "all" | "unread";

export interface InboxPaneProps {
  /** Under the title on phones. */
  readonly workspaceName: string;
  readonly tab: InboxTab;
  readonly tabHref: (tab: InboxTab) => string;
  readonly onTabChange?: (tab: InboxTab) => void;
  /** How many are unread, for the Unread tab and Mark all seen. */
  readonly unreadCount?: number;
  /** The current tab's notifications, newest first. */
  readonly items: readonly InboxItem[];
  /** The notification whose thread is open beside the inbox. */
  readonly selectedId?: string;
  /** The reader opens a notification's thread, which marks it seen. */
  readonly onOpen: (id: string) => void;
  /** Shows Mark all seen while anything is unread. */
  readonly onMarkAllSeen?: () => void;
  readonly markingAll?: boolean;
  /** In place of the list, while it loads or when it cannot. */
  readonly status?: "loading" | "failed";
  readonly onRetry?: () => void;
  /** Older notifications remain; the end of the list offers them. */
  readonly earlier?: { readonly loading?: boolean; readonly onLoad: () => void };
}

const titles: Record<NotificationReason, string> = {
  mention: "mentioned you",
  reply: "replied",
  thread: "started a thread",
};

/** Items grouped under the local day they came. */
function byDay(items: readonly InboxItem[]) {
  const days: Array<{ day: number; items: InboxItem[] }> = [];
  for (const item of items) {
    const day = dayOf(item.at);
    const last = days.at(-1);
    if (last?.day === day) last.items.push(item);
    else days.push({ day, items: [item] });
  }
  return days;
}

/**
 * The Inbox: what came to the reader, newest first under day seams, All or Unread. Opening a
 * notification opens its thread beside the list and marks it seen.
 */
export function InboxPane(props: InboxPaneProps) {
  const days = createMemo(() => byDay(props.items));
  const tab = (id: InboxTab, label: string, count?: number) => (
    <Tabs.Tab
      href={props.tabHref(id)}
      current={props.tab === id}
      count={count}
      onClick={(event: MouseEvent) => {
        if (!props.onTabChange) return;
        event.preventDefault();
        props.onTabChange(id);
      }}
    >
      {label}
    </Tabs.Tab>
  );
  return (
    <Pane.Root>
      <Pane.Header>
        <Shell.NavigationToggle />
        <Pane.Title icon={IconMarkMail} context={props.workspaceName}>
          Inbox
        </Pane.Title>
        <Pane.Actions>
          <Show when={props.onMarkAllSeen && (props.unreadCount ?? 0) > 0}>
            <Button disabled={props.markingAll} onClick={() => props.onMarkAllSeen?.()}>
              Mark all seen
            </Button>
          </Show>
        </Pane.Actions>
        <Pane.Tabs>
          <Tabs.List aria-label="Inbox">
            {tab("all", "All")}
            {tab("unread", "Unread", props.unreadCount ?? 0)}
          </Tabs.List>
        </Pane.Tabs>
      </Pane.Header>
      <Pane.Body>
        <Switch>
          <Match when={props.status === "loading"}>
            <p class={s.loading} role="status">
              Loading your inbox…
            </p>
          </Match>
          <Match when={props.status === "failed"}>
            <EmptyState
              icon={IconAlertTriangle}
              title="Can’t load your inbox"
              lines={["Try again once the host is reachable."]}
            >
              <Show when={props.onRetry}>
                {(retry) => <Button onClick={() => retry()()}>Try again</Button>}
              </Show>
            </EmptyState>
          </Match>
          <Match when={props.items.length === 0 && props.tab === "unread"}>
            <EmptyState
              icon={IconCheck}
              title="You’re all caught up"
              lines={["You’ve seen everything that came to you."]}
            >
              <Button onClick={() => props.onTabChange?.("all")}>View all activity</Button>
            </EmptyState>
          </Match>
          <Match when={props.items.length === 0}>
            <EmptyState
              icon={IconMarkMail}
              title="No activity yet"
              lines={["Mentions, replies, and new threads in groups you follow appear here."]}
            />
          </Match>
          <Match when={true}>
            <ul
              class={s.list}
              aria-label={props.tab === "unread" ? "Unread notifications" : "Notifications"}
            >
              <For each={days()}>
                {(day) => (
                  <>
                    <li class={s.day} aria-hidden="true">
                      <Divider label={dayLabel(day.day)} align="start" />
                    </li>
                    <Keyed each={day.items} by={(item) => item.id}>
                      {(item) => (
                        <Row
                          item={item()}
                          selected={props.selectedId === item().id}
                          onOpen={() => props.onOpen(item().id)}
                        />
                      )}
                    </Keyed>
                  </>
                )}
              </For>
            </ul>
            <Show when={props.earlier}>
              {(earlier) => (
                <div class={s.earlier}>
                  <Button
                    variant="quiet"
                    disabled={earlier().loading}
                    onClick={() => earlier().onLoad()}
                  >
                    {earlier().loading ? "Loading…" : "Show older"}
                  </Button>
                </div>
              )}
            </Show>
          </Match>
        </Switch>
      </Pane.Body>
    </Pane.Root>
  );
}

function Row(props: {
  readonly item: InboxItem;
  readonly selected: boolean;
  readonly onOpen: () => void;
}) {
  const title = () => {
    const { reason, author } = props.item;
    return reason && author ? `${author.name} ${titles[reason]}` : "Activity in a thread";
  };
  const place = () => {
    const where = props.item.place;
    if (!props.item.href || !props.item.reason) return "Unavailable thread";
    if (!where) return "";
    return where.direct ? `${where.name} · Direct message` : `#${where.name}`;
  };
  return (
    <li
      class={s.row}
      data-unread={props.item.unread ? "" : undefined}
      data-selected={props.selected ? "" : undefined}
      data-link={props.item.href ? "" : undefined}
    >
      <Show
        when={props.item.reason && props.item.author}
        fallback={
          <span class={s.unavailable} aria-hidden="true">
            <IconMessage class={s.unavailableIcon} />
          </span>
        }
      >
        {(author) => (
          <Avatar
            name={author().name}
            initials={author().initials}
            tone={author().tone}
            size={32}
            decorative
          />
        )}
      </Show>
      <div class={s.text}>
        <div class={s.head}>
          <Show when={props.item.href} fallback={<span class={s.title}>{title()}</span>}>
            {(href) => (
              <a
                href={href()}
                class={s.title}
                aria-current={props.selected ? "true" : undefined}
                onClick={() => props.onOpen()}
              >
                {title()}
              </a>
            )}
          </Show>
          <span class={s.meta}>
            <Show when={props.item.unread}>
              <span class={s.dot} role="img" aria-label="unread" />
            </Show>
            <time dateTime={props.item.at.toISOString()} title={fullTime(props.item.at)}>
              {agoLabel(props.item.at)}
            </time>
          </span>
        </div>
        <Show when={place()}>
          <span class={s.place}>{place()}</span>
        </Show>
        <p class={s.preview}>
          <Show
            when={props.item.href ? props.item.text : undefined}
            fallback="You can no longer see this thread."
          >
            {(text) => (
              <For each={text()}>
                {(part) =>
                  typeof part === "string" ? (
                    part
                  ) : (
                    <Message.Mention>{part.mention}</Message.Mention>
                  )
                }
              </For>
            )}
          </Show>
        </p>
      </div>
    </li>
  );
}
