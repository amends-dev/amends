// Workshop harness: the Inbox with the Lunacy sample notifications, selection, and the thread
// beside it, following the mocks' behavior notes. Not exported.
import { Show, createMemo, createSignal } from "solid-js";
import { Shell } from "../../patterns/shell/index.ts";
import { ThreadPane } from "../group/index.ts";
import { navigation, people, threadEntries } from "../sample.ts";
import { HomeSidebar, WorkspaceNavigation } from "../workspace-navigation/index.ts";
import { InboxPane, type InboxItem, type InboxTab } from "./index.ts";

const now = new Date();
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const yesterday = (hour: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - 1);
  date.setHours(hour, 0, 0, 0);
  return date;
};

export const sampleInbox: readonly InboxItem[] = [
  {
    id: "sara",
    at: minutesAgo(2),
    unread: true,
    reason: "mention",
    author: people.sara,
    place: { name: "general", direct: false },
    text: "[@Jamie](member:jamie) can you check the composer fix before we ship?",
    mentions: [{ id: "jamie", name: "Jamie" }],
    href: "#sara",
  },
  {
    id: "alex",
    at: minutesAgo(12),
    unread: true,
    reason: "reply",
    author: people.alex,
    place: { name: "engineering", direct: false },
    text: "The retry now keeps the original request. Ready for another look.",
    href: "#alex",
  },
  {
    id: "graeme",
    at: minutesAgo(32),
    unread: true,
    reason: "thread",
    author: people.graeme,
    place: { name: "design", direct: false },
    text: "Sharing the revised navigation icons for review.",
    href: "#graeme",
  },
  {
    id: "oliver",
    at: minutesAgo(60),
    unread: false,
    reason: "reply",
    author: people.oliver,
    place: { name: "product", direct: false },
    text: "The empty state copy is updated. I’ve attached the latest version.",
    href: "#oliver",
  },
  {
    id: "caleb",
    at: yesterday(15),
    unread: false,
    reason: "mention",
    author: { name: "Caleb", tone: "sage" },
    place: { name: "Caleb", direct: true },
    text: "[@Jamie](member:jamie) let’s grab coffee after the rollout.",
    mentions: [{ id: "jamie", name: "Jamie" }],
    href: "#caleb",
  },
  { id: "gone", at: yesterday(11), unread: false },
];

export interface InboxWorkspaceProps {
  readonly tab?: InboxTab;
  readonly items?: readonly InboxItem[];
  readonly selected?: string;
  readonly status?: "loading" | "failed";
}

/** The inbox's own rules, over local state: opening marks seen; Unread keeps the open row. */
export function InboxWorkspace(props: InboxWorkspaceProps) {
  // A notification open from the start was seen as it opened.
  const [items, setItems] = createSignal(
    (props.items ?? sampleInbox).map((item) =>
      item.id === props.selected ? { ...item, unread: false } : item,
    ),
  );
  const [tab, setTab] = createSignal<InboxTab>(props.tab ?? "all");
  const [selected, setSelected] = createSignal(props.selected);
  const unread = () => items().filter((item) => item.unread).length;
  const shown = createMemo(() =>
    tab() === "all" ? items() : items().filter((item) => item.unread || item.id === selected()),
  );
  const open = (id: string) => {
    setSelected(id);
    setItems(items().map((item) => (item.id === id ? { ...item, unread: false } : item)));
  };
  const current = () => items().find((item) => item.id === selected());
  const nav = navigation({ groups: [{ id: "general", name: "general" }] });
  return (
    <Shell.Root>
      <WorkspaceNavigation {...nav}>
        <HomeSidebar {...nav} inbox={{ href: "#inbox", current: true, unread: unread() }} />
      </WorkspaceNavigation>
      <Shell.Main>
        <InboxPane
          workspaceName="Mercier & Co"
          tab={tab()}
          tabHref={(next) => `#${next}`}
          onTabChange={setTab}
          unreadCount={unread()}
          items={shown()}
          selectedId={selected()}
          onOpen={(id) => {
            // The link would navigate; the workshop opens in place.
            queueMicrotask(() => open(id));
          }}
          onMarkAllSeen={() => setItems(items().map((item) => ({ ...item, unread: false })))}
          status={props.status}
          onRetry={() => {}}
          earlier={tab() === "all" ? { onLoad: () => {} } : undefined}
        />
      </Shell.Main>
      <Show when={current()}>
        {(item) => (
          <ThreadPane
            title="Thread"
            groupName={item().place?.name ?? ""}
            groupKind={item().place?.direct ? "direct" : "team"}
            reason={item().reason}
            backLabel="Inbox"
            entries={threadEntries}
            onClose={() => setSelected(undefined)}
            placeholder="Reply in thread"
            draft=""
            onDraftChange={() => {}}
            onSend={() => {}}
          />
        )}
      </Show>
    </Shell.Root>
  );
}
