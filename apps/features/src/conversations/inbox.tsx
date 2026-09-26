import {
  useGroups,
  useInbox,
  useInboxPending,
  useMarkAllSeen,
  useMarkSeen,
  useMembers,
  type InboxFilter,
  type NotificationInbox,
} from "@amends/client";
import { EmptyState } from "@amends/ui/compositions/empty-state";
import { Inbox as View } from "@amends/ui/compositions/inbox";
import { SegmentedControl } from "@amends/ui/compositions/segmented-control";
import { Button } from "@amends/ui/primitives/button";
import { Drawing } from "@amends/ui/primitives/drawing";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { createSignal, For, Match, Show, Switch } from "solid-js";
import { keyed } from "../internal/keyed.ts";
import { useGroupLabel } from "./group-name.tsx";
import { authorOf, whenOf } from "./presentation.ts";

export interface InboxProps {
  readonly workspaceId: string;
  /** Where each notification's thread opens, at the timeline position that notified the reader. */
  readonly threadHref: (groupId: string, threadId: string, sequence: number) => string;
  /** The thread open beside the inbox. */
  readonly currentThread?: string;
}
type Item = NotificationInbox.Item;
/** Why a notification came to its recipient: a mention, a thread they follow, or a new one. */
function useReason(workspaceId: string) {
  const members = useMembers(workspaceId);
  const groups = useGroups(workspaceId);
  const label = useGroupLabel(workspaceId);
  const where = (groupId: string | undefined) => {
    const group = groups.value()?.find((entry) => entry.group.id === groupId)?.group;
    return group ? (group.kind === "Team" ? `#${label(group)}` : label(group)) : undefined;
  };
  return (item: Item) => {
    const { notification, source } = item;
    const place = where(notification.thread?.groupId);
    if (source === undefined || !("message" in source))
      return place ? `Activity in ${place}` : "Activity in a thread";
    const who = authorOf(source.message.author, members.member).name;
    const recipient = notification.recipient;
    const mentioned =
      "memberId" in recipient && source.message.mentions.includes(recipient.memberId);
    const what = mentioned
      ? "mentioned you"
      : source.activity.sequence === 1
        ? "started a thread"
        : "replied";
    return place ? `${who} ${what} · ${place}` : `${who} ${what}`;
  };
}
function Entry(props: {
  readonly workspaceId: string;
  readonly item: () => Item;
  readonly reason: (item: Item) => string;
  readonly href: (groupId: string, threadId: string, sequence: number) => string;
  readonly current?: string;
}) {
  const notification = () => props.item().notification;
  const seen = useMarkSeen(props.workspaceId, notification().id);
  const pending = () => notification().state._tag === "Pending" && !seen.seen();
  const when = () => whenOf(notification().recordedAt);
  const thread = () => notification().thread;
  const open = () => thread()?.threadId !== undefined && props.current === thread()?.threadId;
  const text = () => {
    const source = props.item().source;
    return source !== undefined && "message" in source ? source.message.text : undefined;
  };
  return (
    <View.Item seen={!pending()} current={open()}>
      <View.Header>
        <Show when={pending()}>
          <View.Unread label="unread" />
        </Show>
        <View.Reason>{props.reason(props.item())}</View.Reason>
        <View.Meta>
          <time datetime={when().datetime} title={when().title}>
            {when().text}
          </time>
        </View.Meta>
      </View.Header>
      <Show
        when={text() !== undefined && thread()}
        fallback={<View.Note>You can no longer see this thread.</View.Note>}
      >
        {(reference) => (
          <>
            <View.Quote>{text()}</View.Quote>
            <View.Actions>
              <View.Open
                href={props.href(reference().groupId, reference().threadId, reference().sequence)}
                aria-current={open() ? "page" : undefined}
              >
                Open thread
              </View.Open>
              <Show when={pending()}>
                <Button variant="secondary" pending={seen.pending()} onClick={seen.markSeen}>
                  Mark seen
                </Button>
              </Show>
            </View.Actions>
          </>
        )}
      </Show>
      <Show when={seen.error()}>
        <Text role="alert" tone="secondary">
          Couldn’t mark this seen. Try again.
        </Text>
      </Show>
    </View.Item>
  );
}
function Notifications(props: InboxProps & { readonly filter: InboxFilter }) {
  const inbox = useInbox(props.workspaceId, props.filter);
  const reason = useReason(props.workspaceId);
  const rows = keyed(
    () => inbox.value() ?? [],
    (item) => item.notification.id,
  );
  return (
    <Switch>
      <Match when={inbox.value() === undefined && inbox.failure()}>
        <EmptyState.Root>
          <Drawing.Snapped />
          <EmptyState.Text>
            <EmptyState.Title>Can’t load your inbox</EmptyState.Title>
            <EmptyState.Description>Try again once the host is reachable.</EmptyState.Description>
          </EmptyState.Text>
          <EmptyState.Actions>
            <Button onClick={inbox.retry}>Try again</Button>
          </EmptyState.Actions>
        </EmptyState.Root>
      </Match>
      <Match when={inbox.value() === undefined}>
        <Text role="status" tone="secondary">
          Loading your inbox…
        </Text>
      </Match>
      <Match when={rows.ids().length === 0}>
        <EmptyState.Root>
          <Drawing.Bare />
          <EmptyState.Text>
            <EmptyState.Title>
              {props.filter === "pending" ? "Nothing needs you" : "Nothing has come to you yet"}
            </EmptyState.Title>
            <EmptyState.Description>
              {props.filter === "pending"
                ? "You’ve seen everything that came to you."
                : "Mentions, replies in threads you follow, and new threads in groups you follow arrive here."}
            </EmptyState.Description>
          </EmptyState.Text>
        </EmptyState.Root>
      </Match>
      <Match when={true}>
        <View.Root
          aria-label={props.filter === "pending" ? "Unread notifications" : "Notifications"}
        >
          <For each={rows.ids()}>
            {(id) => (
              <Entry
                workspaceId={props.workspaceId}
                item={() => rows.get(id)!}
                reason={reason}
                href={props.threadHref}
                current={props.currentThread}
              />
            )}
          </For>
        </View.Root>
        <Show when={!inbox.complete()}>
          <Row justify="center">
            <Button variant="ghost" pending={inbox.loadingEarlier()} onClick={inbox.loadEarlier}>
              Show older
            </Button>
          </Row>
        </Show>
      </Match>
    </Switch>
  );
}
/**
 * Mark everything still pending seen, through the newest notification the list shows, so one that
 * arrives meanwhile stays unread.
 */
function MarkAllSeen(props: { readonly workspaceId: string; readonly filter: InboxFilter }) {
  const inbox = useInbox(props.workspaceId, props.filter);
  const pending = useInboxPending(props.workspaceId);
  const seen = useMarkAllSeen(props.workspaceId);
  const newest = () => inbox.value()?.[0]?.notification;
  return (
    <Show when={(pending() ?? 0) > 0 ? newest() : undefined}>
      {(through) => (
        <Row gap={2} align="center">
          <Show when={seen.error()}>
            <Text role="alert" tone="danger">
              Couldn’t mark these seen.
            </Text>
          </Show>
          <Button
            variant="secondary"
            pending={seen.pending()}
            onClick={() => seen.markAllSeen(through())}
          >
            Mark all seen
          </Button>
        </Row>
      )}
    </Show>
  );
}
/**
 * The reader's inbox, newest first and live while mounted: what came to them, each with why and
 * what was said, a link to its thread, and a way to mark it seen. Everything shows by default;
 * the reader can narrow it to what is still unread. Older notifications load on request.
 */
export function Inbox(props: InboxProps) {
  const [filter, setFilter] = createSignal<InboxFilter>("all");
  return (
    <Column gap={4}>
      <Row justify="between" align="center" gap={3}>
        <SegmentedControl.Root
          aria-label="Show"
          value={filter()}
          onValueChange={(value) => setFilter(value === "pending" ? "pending" : "all")}
        >
          <SegmentedControl.Item value="all">All</SegmentedControl.Item>
          <SegmentedControl.Item value="pending">Unread</SegmentedControl.Item>
        </SegmentedControl.Root>
        <Show when={filter()} keyed>
          {(shown) => <MarkAllSeen workspaceId={props.workspaceId} filter={shown} />}
        </Show>
      </Row>
      <Show when={filter()} keyed>
        {(shown) => <Notifications {...props} filter={shown} />}
      </Show>
    </Column>
  );
}
