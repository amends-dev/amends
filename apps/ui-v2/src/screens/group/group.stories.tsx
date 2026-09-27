import { Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Shell } from "../../patterns/shell/index.ts";
import { groupEntries, navigation, people, threadEntries } from "../sample.ts";
import type { TimelineEntry, TimelineMessage } from "../timeline/index.ts";
import { WorkspaceNavigation } from "../workspace-navigation/index.ts";
import { GroupPane, GroupThreads, ThreadPane } from "./index.ts";

const noop = () => {};

function react(entries: readonly TimelineEntry[], id: string, emoji: string) {
  return entries.map((entry) => {
    if (entry.kind !== "message" || entry.id !== id) return entry;
    const reactions = (entry.reactions ?? []).map((reaction) =>
      reaction.emoji === emoji
        ? {
            ...reaction,
            reacted: !reaction.reacted,
            count: reaction.count + (reaction.reacted ? -1 : 1),
          }
        : reaction,
    );
    return { ...entry, reactions };
  });
}

function send(entries: readonly TimelineEntry[], id: string, text: string): TimelineEntry[] {
  const message: TimelineMessage = {
    kind: "message",
    id,
    author: people.jordan,
    time: "10:12 AM",
    text: [text],
  };
  return [...entries, message];
}

/** The group screen with working thread, reaction, and composer state. */
function GroupScreen(props: { thread: boolean }) {
  const [thread, setThread] = createSignal(props.thread);
  const [entries, setEntries] = createSignal(groupEntries);
  const [replies, setReplies] = createSignal(threadEntries);
  const [draft, setDraft] = createSignal("");
  const [reply, setReply] = createSignal("");
  return (
    <Shell.Root>
      <WorkspaceNavigation {...navigation(thread())} />
      <Shell.Main>
        <GroupPane
          name="general"
          workspaceName="Mercier & Co"
          members={[people.alex, people.yumi, people.sara]}
          memberCount={7}
          tab="threads"
          tabHref={(tab) => `#${tab}`}
          taskCount={12}
          onOpenMembers={noop}
          onOpenNotifications={noop}
          onOpenSettings={noop}
          onSearch={noop}
        >
          <GroupThreads
            entries={entries()}
            openThreadId={thread() ? "m5" : undefined}
            onOpenThread={() => setThread(true)}
            onReact={(id, emoji) => setEntries(react(entries(), id, emoji))}
            taskHref={(key) => `#${key}`}
            placeholder="Message #general"
            draft={draft()}
            onDraftChange={setDraft}
            onSend={(text) => {
              setEntries(send(entries(), `sent-${entries().length}`, text));
              setDraft("");
            }}
          />
        </GroupPane>
      </Shell.Main>
      <Show when={thread()}>
        <ThreadPane
          title="Composer paste crash"
          groupName="general"
          onClose={() => setThread(false)}
          entries={replies()}
          onReact={(id, emoji) => setReplies(react(replies(), id, emoji))}
          taskHref={(key) => `#${key}`}
          placeholder="Reply in thread"
          draft={reply()}
          onDraftChange={setReply}
          onSend={(text) => {
            setReplies(send(replies(), `reply-${replies().length}`, text));
            setReply("");
          }}
        />
      </Show>
    </Shell.Root>
  );
}

const meta = {
  title: "Screens/Group threads",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** A group's threads: the Lunacy "Group / Threads" frame. */
export const Threads = {
  render: () => <GroupScreen thread={false} />,
} satisfies Story;

/** With AJ's thread open beside it: the Lunacy "Group / Threads + open thread" frame. */
export const ThreadOpen = {
  render: () => <GroupScreen thread />,
} satisfies Story;

/** Opening a thread from its replies, replying, and closing it. */
export const Reply = {
  render: () => <GroupScreen thread={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "4 replies" }));
    const input = await canvas.findByRole("textbox", { name: "Reply in thread" });
    await userEvent.type(input, "On it{Enter}");
    await expect(input).toHaveValue("");
    await expect(canvas.getByText("On it")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Close thread" }));
    await waitFor(() =>
      expect(canvas.queryByRole("textbox", { name: "Reply in thread" })).toBeNull(),
    );
  },
} satisfies Story;

/** Sending to the group and reacting. Shift+Enter keeps writing on a new line. */
export const Send = {
  render: () => <GroupScreen thread={false} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const send = canvas.getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();
    const input = canvas.getByRole("textbox", { name: "Message #general" });
    await userEvent.type(input, "Lunch at noon?{Shift>}{Enter}{/Shift}Anyone");
    await expect(input).toHaveValue("Lunch at noon?\nAnyone");
    await userEvent.click(send);
    await expect(input).toHaveValue("");
    await expect(canvas.getByText(/Lunch at noon\?/)).toBeVisible();
    const fire = canvas.getByRole("button", { name: "🔥 3" });
    await userEvent.click(fire);
    await expect(canvas.getByRole("button", { name: "🔥 4" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
} satisfies Story;
