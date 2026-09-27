import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { IconMarkAttach, IconMarkMention, IconMarkResources } from "@amends/icons";
import { Composer } from "./composer/index.ts";
import { Divider } from "./divider/index.ts";
import { IconButton } from "./icon-button/index.ts";
import { Message } from "./message/index.ts";
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
              <Message.Mention>@Caleb</Message.Mention> Let’s grab some coffee
            </Message.Text>
          </Message.Root>
        </div>
      </section>
    </div>
  ),
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
        <Composer.Input placeholder="Message #general" />
        <Composer.Toolbar>
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
          Enter sends and Shift+Enter starts a new line. The field grows with its text, and Send
          waits for something to send.
        </p>
        <ComposerExample />
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Message #general" });
    const send = canvas.getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();
    await userEvent.type(input, "   ");
    await expect(send).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "first{Shift>}{Enter}{/Shift}second{Enter}");
    await expect(canvas.getByRole("status", { name: "Sent" })).toHaveTextContent("first second");
    await expect(input).toHaveValue("");
  },
} satisfies Story;
