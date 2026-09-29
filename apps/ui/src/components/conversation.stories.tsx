import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { IconMarkAttach, IconMarkMention, IconMarkResources } from "@amends/icons";
import { Composer } from "./composer/index.ts";
import { Divider } from "./divider/index.ts";
import { IconButton } from "./icon-button/index.ts";
import { Message } from "./message/index.ts";
import { Profiles, type Profile } from "./profile-card/index.ts";
import { RichText } from "./rich-text/index.ts";
import { TaskStatus, taskStateLabel } from "./task-status/index.ts";
import * as s from "./components.stories.css.ts";

const meta = { title: "Components/Conversation" } satisfies Meta;
export default meta;
type Story = StoryObj;

const alex = { name: "Alex", initials: "AM", tone: "sand" } as const;
const yumi = { name: "Yumi", tone: "lilac", agent: true } as const;
const sara = { name: "Sara", tone: "clay" } as const;

export const Messages = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Message</h2>
        <p class={s.note}>
          An avatar beside the byline and text, with optional reactions, an agent's activity, a task
          reference, and a reply summary. The open thread's message is highlighted.
        </p>
        <div class={s.stack}>
          <Divider label="Today" />
          <Message.Root author={sara} time="9:44 AM">
            <Message.Text>deploy went out clean last night! 🎉</Message.Text>
            <Message.Reactions>
              <Message.Reaction emoji="🔥" count={3} />
              <Message.Reaction emoji="👀" count={1} reacted />
            </Message.Reactions>
          </Message.Root>
          <Message.Root author={{ name: "AJ", tone: "ink" }} time="10:02 AM" active>
            <Message.Text>
              found a bug. composer crashes when I paste an image from clipboard lol
            </Message.Text>
            <Message.Replies count={4} people={[alex, yumi, sara]} />
          </Message.Root>
          <Divider label="4 replies" align="start" />
          <Message.Root author={yumi}>
            <Message.Activity icon={IconMarkResources}>Checked codebase</Message.Activity>
            <Message.Text>
              Reproduced on both — images over 5 MB hit the crash. Filed it and tagged the composer
              team.
            </Message.Text>
            <Message.TaskReference href="#AND-214" taskKey="AND-214" state="open">
              Composer paste crash
            </Message.TaskReference>
          </Message.Root>
          <Message.Root author={{ name: "Graeme", tone: "slate" }} time="10:08 AM">
            <Message.Text>
              <RichText
                text="[@Caleb](member:caleb) Let’s grab some coffee"
                mentions={[{ id: "caleb", name: "Caleb" }]}
              />
            </Message.Text>
          </Message.Root>
        </div>
      </section>
    </div>
  ),
} satisfies Story;

const caleb = { id: "caleb", name: "Caleb" };
const formatted = `Reproduced it on **both platforms**. [@Caleb](member:caleb), the crash comes from \`readImage\`:

1. Paste an image over _5 MB_
2. The composer calls \`readImage\` with no size limit
   - Safari stops the tab
   - Chrome keeps going, ~~slowly~~ for a while

\`\`\`ts
const image = await readImage(clipboard);
\`\`\`

> Pasting smaller images works everywhere.

| Platform | Crashes |
| --- | :---: |
| macOS | Yes |
| Windows | Yes |

- [x] Reproduced
- [ ] Fixed

Details in [the report](https://example.com/report). <b>Raw HTML</b> shows as written.`;

export const FormattedText = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Formatted text</h2>
        <p class={s.note}>
          Messages are markdown: emphasis, code, lists, quotes, tables, and links, with mentions
          naming members by id. Raw HTML shows as written, and only web and email links link.
        </p>
        <div class={s.stack}>
          <Message.Root author={yumi} time="10:04 AM">
            <Message.Text>
              <RichText text={formatted} mentions={[caleb]} />
            </Message.Text>
          </Message.Root>
          <Message.Root author={yumi} time="10:05 AM">
            <Message.Text>
              <RichText text={"The fix is in `readImage`, and **the paste han"} streaming caret />
            </Message.Text>
          </Message.Root>
          <p class={s.note}>
            <RichText
              text={"[@Caleb](member:caleb) the crash:\n\n- comes from **paste**\n- `readImage`"}
              mentions={[caleb]}
              inline
            />
          </p>
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("both platforms").tagName).toBe("STRONG");
    await expect(canvas.getAllByText("@Caleb")).toHaveLength(2);
    await expect(canvas.getByRole("table")).toBeInTheDocument();
    await expect(canvas.getByRole("link", { name: "the report" })).toHaveAttribute(
      "href",
      "https://example.com/report",
    );
    await expect(canvas.getByText(/<b>Raw HTML<\/b> shows as written/u)).toBeInTheDocument();
    await expect(canvas.getByText("the paste han").tagName).toBe("STRONG");
    await expect(canvas.getByText("the crash: comes from paste readImage")).toBeInTheDocument();
  },
} satisfies Story;

export const TaskStates = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Task status</h2>
        <div class={s.panel}>
          <For each={["triage", "open", "progress", "done"] as const}>
            {(state) => (
              <span class={s.labelled}>
                <TaskStatus state={state} size="1rem" decorative />
                {taskStateLabel(state)}
              </span>
            )}
          </For>
        </div>
      </section>
    </div>
  ),
} satisfies Story;

function ComposerExample() {
  const [draft, setDraft] = createSignal("");
  const [sent, setSent] = createSignal<string[]>([]);
  return (
    <div class={s.stack}>
      <Composer.Root
        value={draft()}
        onValueChange={setDraft}
        onSend={(text) => {
          setSent([...sent(), text]);
          setDraft("");
        }}
      >
        <Composer.Formatting />
        <Composer.Input placeholder="Message #general" />
        <Composer.Toolbar>
          <Composer.FormattingToggle />
          <IconButton icon={IconMarkAttach} label="Attach" />
          <IconButton icon={IconMarkMention} label="Mention" />
          <Composer.Send />
        </Composer.Toolbar>
      </Composer.Root>
      <output aria-label="Sent">{sent().join(" | ")}</output>
    </div>
  );
}

export const Composing = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Composer</h2>
        <p class={s.note}>
          The draft is formatted as it is written, from the toolbar, shortcuts, or markdown typed
          such as **bold** or "- " at the start of a line, and sent as markdown. Enter sends and
          Shift+Enter starts a new line. The field grows with its text, and Send waits for something
          to send.
        </p>
        <ComposerExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = await canvas.findByRole("textbox", { name: "Message #general" });
    const send = canvas.getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();
    await userEvent.type(input, "   ");
    await expect(send).toBeDisabled();
    await userEvent.type(input, "first **bold**{Shift>}{Enter}{/Shift}second{Enter}");
    await expect(canvas.getByRole("status", { name: "Sent" })).toHaveTextContent(
      "first **bold** second",
    );
    await waitFor(() => expect(input).toHaveTextContent(""));
  },
} satisfies Story;

const members: Readonly<Record<string, Profile>> = {
  alex: { id: "alex", name: "Alex Morgan", kind: "person", initials: "AM", tone: "sand" },
  yumi: { id: "yumi", name: "Yumi", kind: "agent", tone: "lilac" },
  jordan: {
    id: "jordan",
    name: "Jordan Mercier",
    kind: "person",
    you: true,
    initials: "JM",
    tone: "sage",
  },
  bartholomew: {
    id: "bartholomew",
    name: "Bartholomew Fitzgerald-Ashworth",
    kind: "person",
    tone: "olive",
  },
  caleb: { id: "caleb", name: "Caleb", kind: "person", former: true },
};

function ProfilesExample() {
  const [done, setDone] = createSignal("");
  const name = (id: string) => members[id]?.name ?? id;
  return (
    <Profiles.Root
      profile={(id) => members[id]}
      onMessage={(id) => setDone(`Message ${name(id)}`)}
      onOpenAgent={(id) => setDone(`Open ${name(id)}`)}
      onChangeName={() => setDone("Change your name")}
    >
      <div class={s.stack}>
        <Message.Root author={{ ...members.alex!, agent: false }} time="9:44 AM">
          <Message.Text>
            <RichText
              text="[@Yumi](member:yumi) can you check the release notes? [@Jordan Mercier](member:jordan) and [@Bartholomew Fitzgerald-Ashworth](member:bartholomew) reviewed them; [@Caleb](member:caleb) started them, and [@Robin](member:robin) asked."
              mentions={Object.values(members)}
            />
          </Message.Text>
        </Message.Root>
        <Message.Root author={{ ...members.yumi!, agent: true }} time="9:46 AM">
          <Message.Text>On it.</Message.Text>
        </Message.Root>
      </div>
      <p class={s.note} role="status" aria-label="Chosen">
        {done()}
      </p>
    </Profiles.Root>
  );
}

export const ProfileCards = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Profile cards</h2>
        <p class={s.note}>
          A member's name, avatar, or mention opens their card after a moment's hover, or at once
          from the keyboard; a click, tap, Enter, or Space keeps it open until Escape or a click
          outside. The card says whether they are a person or an agent and offers Message, Open
          agent, or, on the reader's own card, Change name. A former member keeps their name with
          nothing to do, and a member who cannot be shown says so.
        </p>
        <ProfilesExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const chosen = canvas.getByRole("status", { name: "Chosen" });
    const mention = canvas.getByRole("button", { name: "@Yumi" });
    mention.focus();
    await userEvent.keyboard("{Enter}");
    const yumi = within(await canvas.findByRole("dialog", { name: "Yumi" }));
    await expect(yumi.getByText("Agent")).toBeInTheDocument();
    await userEvent.tab();
    await expect(yumi.getByRole("button", { name: "Message" })).toHaveFocus();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect(chosen).toHaveTextContent("Open Yumi");
    await expect(canvas.queryByRole("dialog")).toBeNull();

    canvas.getByRole("button", { name: "Alex Morgan" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("dialog", { name: "Alex Morgan" })).toHaveTextContent(
      "Person",
    );
    await userEvent.keyboard("{Escape}");
    await expect(canvas.queryByRole("dialog")).toBeNull();
    await expect(canvas.getByRole("button", { name: "Alex Morgan" })).toHaveFocus();

    canvas.getByRole("button", { name: "@Jordan Mercier" }).focus();
    await userEvent.keyboard("{Enter}");
    const you = within(await canvas.findByRole("dialog", { name: "Jordan Mercier" }));
    await expect(you.getByText("Person · You")).toBeInTheDocument();
    await expect(you.queryByRole("button", { name: "Message" })).toBeNull();
    await userEvent.tab();
    await userEvent.keyboard("{Enter}");
    await expect(chosen).toHaveTextContent("Change your name");

    canvas.getByRole("button", { name: "@Caleb" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("dialog", { name: "Caleb" })).toHaveTextContent(
      "No longer in this workspace.",
    );
    canvas.getByRole("button", { name: "@Robin" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(
      await canvas.findByRole("dialog", { name: "Profile unavailable" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
  },
} satisfies Story;
