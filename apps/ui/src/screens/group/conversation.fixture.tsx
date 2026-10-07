// Workshop harness: a group and thread shaped like the connected app's data, with dated
// messages, reply summaries, notes, mentions, and loading states. Not exported.
import { Show, createSignal } from "solid-js";
import type { MentionCandidate } from "../../components/composer/index.ts";
import { Profiles } from "../../components/profile-card/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { people, profile } from "../sample.ts";
import type { ColorPalette } from "../../foundations/color/palettes.ts";
import type { TimelineEntry } from "../timeline/index.ts";
import {
  HomeSidebar,
  WorkspaceNavigation,
  type Appearance,
} from "../workspace-navigation/index.ts";
import { navigation } from "../sample.ts";
import { GroupPane } from "./group-pane.tsx";
import { GroupThreads, type ConversationStatus } from "./group-threads.tsx";
import { ThreadPane } from "./thread-pane.tsx";

/** Recent messages fall today whatever the clock says: just after midnight, they count from 1am. */
const now = new Date(Math.max(Date.now(), new Date().setHours(1, 0, 0, 0)));
const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000);
const daysAgo = (days: number, hour: number) => {
  const date = new Date(now);
  date.setDate(date.getDate() - days);
  date.setHours(hour, 5, 0, 0);
  return date;
};

export const candidates: readonly MentionCandidate[] = [
  { id: "alex", name: "Alex Morgan" },
  { id: "sara", name: "Sara Lind" },
  { id: "yumi", name: "Yumi", agent: true },
];

const openings: readonly TimelineEntry[] = [
  {
    kind: "message",
    id: "t1",
    author: people.alex,
    at: daysAgo(1, 16),
    text: "The preview is ready for another look.",
    thread: { replies: 2, unread: true },
  },
  {
    kind: "message",
    id: "t2",
    author: people.sara,
    at: minutesAgo(40),
    text: "Can [@Yumi](member:yumi) check the release notes?",
    mentions: [{ id: "yumi", name: "Yumi" }],
    thread: { replies: 0, typing: ["Yumi"] },
  },
  {
    kind: "message",
    id: "t3",
    author: people.aj,
    at: minutesAgo(12),
    text: "Lunch at noon?",
    thread: { replies: 0 },
  },
];

const thread: readonly TimelineEntry[] = [
  {
    kind: "message",
    id: "r0",
    author: people.alex,
    at: daysAgo(1, 16),
    text: "The preview is ready for another look.",
  },
  { kind: "note", id: "n1", at: daysAgo(1, 16), change: "followed", who: "Sara" },
  {
    kind: "message",
    id: "r1",
    author: people.sara,
    at: daysAgo(1, 17),
    text: "Looks good to me.",
  },
  { kind: "note", id: "n2", at: minutesAgo(30), change: "unfollowed", who: "You", self: true },
  {
    kind: "message",
    id: "r2",
    author: people.yumi,
    at: minutesAgo(5),
    text: "Checked the build: all green.",
  },
  // Soon after by the same author, so it stacks under the one before.
  {
    kind: "message",
    id: "r3",
    author: people.yumi,
    at: minutesAgo(4),
    text: "The release notes are ready too; they cover the paste fix.",
  },
];

export interface ConversationProps {
  readonly status?: ConversationStatus;
  readonly threadStatus?: ConversationStatus;
  readonly open?: boolean;
  /** Older threads remain, or the last older page failed. */
  readonly earlier?: boolean | "failed";
  readonly menu?: boolean;
}

/** A group and its open thread over dated data, as the app drives them. */
export function Conversation(props: ConversationProps) {
  const [draft, setDraft] = createSignal("");
  const [reply, setReply] = createSignal("");
  const [open, setOpen] = createSignal(props.open ?? false);
  const [following, setFollowing] = createSignal(true);
  const [appearance, setAppearance] = createSignal<Appearance>("system");
  const [palette, setPalette] = createSignal<ColorPalette>("neutral");
  const [entries, setEntries] = createSignal(openings);
  const { onSearch: _search, ...base } = navigation({
    groups: [{ id: "general", name: "general" }],
    currentGroup: "general",
  });
  return (
    <Profiles.Root
      profile={profile}
      onMessage={() => {}}
      onOpenAgent={() => {}}
      onChangeName={() => {}}
    >
      <Shell.Root>
        <WorkspaceNavigation
          {...base}
          destinations={["home", "agents", "connections"]}
          account={{
            ...base.account,
            menu: props.menu
              ? {
                  identity: "jordan@mercier.example",
                  appearance: appearance(),
                  onAppearanceChange: setAppearance,
                  palette: palette(),
                  onPaletteChange: setPalette,
                  onOpenSettings: () => {},
                  onChangeName: () => {},
                  onSignOut: () => {},
                }
              : undefined,
          }}
        >
          <HomeSidebar
            {...base}
            groups={[
              { id: "general", name: "general", href: "#general", current: true },
              { id: "design", name: "design", href: "#design", pending: 2 },
              { id: "product", name: "product", href: "#product", unread: true },
            ]}
          />
        </WorkspaceNavigation>
        <Shell.Main>
          <GroupPane
            name="general"
            workspaceName="Mercier & Co"
            members={[people.alex, people.sara, people.yumi]}
            memberCount={3}
            tabs={["threads"]}
            tab="threads"
            tabHref={() => "#threads"}
            onOpenMembers={() => {}}
            follow={{ following: following(), onToggle: () => setFollowing(!following()) }}
            onOpenSettings={() => {}}
          >
            <GroupThreads
              entries={entries()}
              days
              status={props.status}
              onRetry={() => {}}
              earlier={
                props.earlier ? { failed: props.earlier === "failed", onLoad: () => {} } : undefined
              }
              openThreadId={open() ? "t1" : undefined}
              onOpenThread={() => setOpen(true)}
              placeholder="Message #general"
              draft={draft()}
              onDraftChange={setDraft}
              mentionCandidates={candidates}
              onSend={(text) => {
                setEntries([
                  ...entries(),
                  {
                    kind: "message",
                    id: `sent-${entries().length}`,
                    author: people.jordan,
                    at: new Date(),
                    text,
                    mentions: candidates.filter((person) => text.includes(`(member:${person.id})`)),
                    thread: { replies: 0 },
                  },
                ]);
                setDraft("");
              }}
            />
          </GroupPane>
        </Shell.Main>
        <Show when={open()}>
          <ThreadPane
            title="Thread"
            groupName="general"
            entries={thread}
            days
            status={props.threadStatus}
            typing={["Sara"]}
            follow={{ following: false, onToggle: () => {} }}
            onClose={() => setOpen(false)}
            placeholder="Reply in thread"
            draft={reply()}
            onDraftChange={setReply}
            mentionCandidates={candidates}
            onSend={() => setReply("")}
            sendError={reply() === "fail" ? "failed" : undefined}
          />
        </Show>
      </Shell.Root>
    </Profiles.Root>
  );
}
