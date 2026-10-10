import { For, Show, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import {
  IconBell,
  IconCircleFrame,
  IconMarkAgents,
  IconMarkChannel,
  IconMarkConnections,
  IconMarkEnvironments,
  IconMarkHome,
  IconMarkMail,
  IconMarkNew,
  IconMarkSearch,
  IconMarkSettings,
  IconMarkTasks,
  IconMarkTriage,
  IconMessage,
} from "@amends-dev/icons";
import { AvatarStack } from "../../components/avatar/index.ts";
import { IconButton } from "../../components/icon-button/index.ts";
import { Tabs } from "../../components/tabs/index.ts";
import { Pane } from "../pane/index.ts";
import { Rail } from "../rail/index.ts";
import { Sidebar } from "../sidebar/index.ts";
import { Shell } from "./index.ts";
import * as s from "./shell.stories.css.ts";

const groups = ["general", "design", "engineering", "product"];
const messages = [
  ["Alex", "The preview is ready for another look. I’ve linked the latest notes in the task."],
  ["Sara", "Looks good. I’ll keep an eye on the release this morning."],
  ["Oliver", "morning all! ☕"],
  ["Sara", "deploy went out clean last night! 🎉"],
  ["AJ", "found a bug. composer crashes when I paste an image from clipboard lol"],
  ["Graeme", "@Caleb Let’s grab some coffee"],
] as const;
const replies = [
  ["AJ", "found a bug. composer crashes when I paste an image from clipboard lol"],
  ["Alex", "uh oh — repro on mac or everywhere?"],
  ["Yumi", "Reproduced on both — images over 5 MB hit the crash."],
  ["AJ", "Thanks! I’ll attach the image to the task."],
  ["Sara", "I can pick this up after the release check."],
] as const;

function Entries(props: { items: ReadonlyArray<readonly [string, string]> }) {
  return (
    <div class={s.placeholder}>
      <For each={props.items}>
        {([author, text]) => (
          <div class={s.entry}>
            <span class={s.author}>{author}</span>
            <p class={s.text}>{text}</p>
          </div>
        )}
      </For>
    </div>
  );
}

function Workspace(props: { thread: boolean }) {
  const [threadOpen, setThreadOpen] = createSignal(props.thread);
  return (
    <Shell.Root>
      <Shell.Navigation>
        <Rail.Root>
          <Rail.Brand href="#home" />
          <Rail.List>
            <Rail.Item href="#home" icon={IconMarkHome} label="Home" current />
            <Rail.Item href="#agents" icon={IconMarkAgents} label="Agents" />
            <Rail.Item href="#environments" icon={IconMarkEnvironments} label="Environments" />
            <Rail.Item href="#connections" icon={IconMarkConnections} label="Connections" />
            <Rail.Item icon={IconMarkSearch} label="Search" />
          </Rail.List>
          <Rail.Footer>
            <Rail.Item href="#settings" icon={IconMarkSettings} label="Settings" />
            <Rail.Account name="Jordan Mercier" tone="sage" />
          </Rail.Footer>
        </Rail.Root>
        <Sidebar.Root aria-label="Workspace">
          <Sidebar.Header>
            <Sidebar.Workspace name="Mercier & Co" />
            <Sidebar.Search shortcut="⌘ K">Find anything…</Sidebar.Search>
          </Sidebar.Header>
          <Sidebar.Body>
            <Sidebar.List>
              <Sidebar.Item href="#inbox" icon={IconMarkMail}>
                Inbox
              </Sidebar.Item>
              <Sidebar.Item href="#triage" icon={IconMarkTriage} count={5} countLabel="5 to triage">
                Triage
              </Sidebar.Item>
              <Sidebar.Item href="#tasks" icon={IconMarkTasks}>
                Tasks
              </Sidebar.Item>
            </Sidebar.List>
            <Sidebar.Section>
              <Sidebar.SectionHeader title="Groups" href="#groups">
                <IconButton icon={IconMarkSearch} label="Browse groups" size="compact" />
                <IconButton icon={IconMarkNew} label="Create group" size="compact" />
              </Sidebar.SectionHeader>
              <Sidebar.List>
                <For each={groups}>
                  {(group) => (
                    <>
                      <Sidebar.Item
                        href={`#${group}`}
                        icon={IconMarkChannel}
                        current={group === "general"}
                      >
                        {group}
                      </Sidebar.Item>
                      <Show when={group === "general"}>
                        <Sidebar.SubItem
                          href="#thread"
                          icon={IconCircleFrame}
                          current={threadOpen()}
                          onClick={(event) => {
                            event.preventDefault();
                            setThreadOpen(true);
                          }}
                        >
                          Composer paste crash
                        </Sidebar.SubItem>
                      </Show>
                    </>
                  )}
                </For>
              </Sidebar.List>
            </Sidebar.Section>
            <Sidebar.Section>
              <Sidebar.SectionHeader title="Direct messages">
                <IconButton icon={IconMarkNew} label="New message" size="compact" />
              </Sidebar.SectionHeader>
              <Sidebar.List>
                <Sidebar.Item href="#alex" person={{ name: "Alex Morgan", tone: "sand" }}>
                  Alex Morgan
                </Sidebar.Item>
                <Sidebar.Item href="#yumi" person={{ name: "Yumi", tone: "lilac" }}>
                  Yumi
                </Sidebar.Item>
              </Sidebar.List>
            </Sidebar.Section>
          </Sidebar.Body>
        </Sidebar.Root>
      </Shell.Navigation>
      <Shell.Main>
        <Pane.Root>
          <Pane.Header>
            <Shell.NavigationToggle />
            <Pane.Title icon={IconMarkChannel} context="Mercier & Co">
              general
            </Pane.Title>
            <Pane.Actions>
              <AvatarStack
                aria-label="Members: Alex, Yumi, Sara"
                people={[
                  { name: "Alex", tone: "sand" },
                  { name: "Yumi", tone: "lilac" },
                  { name: "Sara", tone: "clay" },
                ]}
              />
              <IconButton icon={IconBell} label="Notifications" />
              <IconButton icon={IconMarkSettings} label="Group settings" />
            </Pane.Actions>
            <Pane.Tabs>
              <Tabs.List aria-label="Group">
                <Tabs.Tab href="#threads" current>
                  Threads
                </Tabs.Tab>
                <Tabs.Tab href="#tasks" count={12}>
                  Tasks
                </Tabs.Tab>
                <Tabs.Tab href="#files">Files</Tabs.Tab>
              </Tabs.List>
            </Pane.Tabs>
          </Pane.Header>
          <Pane.Body>
            <Entries items={[...messages, ...messages]} />
          </Pane.Body>
          <Pane.Footer>
            <div class={s.composer}>Message #general</div>
          </Pane.Footer>
        </Pane.Root>
      </Shell.Main>
      <Show when={threadOpen()}>
        <Shell.Aside aria-label="Composer paste crash" onClose={() => setThreadOpen(false)}>
          <Pane.Root variant="side">
            <Pane.Header>
              <Pane.Back onClick={() => setThreadOpen(false)}>general</Pane.Back>
              <Pane.Title icon={IconMessage}>Composer paste crash</Pane.Title>
              <Pane.Actions>
                <Pane.Close label="Close thread" onClick={() => setThreadOpen(false)} />
              </Pane.Actions>
              <Pane.Subtitle>Thread in #general</Pane.Subtitle>
            </Pane.Header>
            <Pane.Body>
              <Entries items={replies} />
            </Pane.Body>
            <Pane.Footer>
              <div class={s.composer}>Reply in thread</div>
            </Pane.Footer>
          </Pane.Root>
        </Shell.Aside>
      </Show>
    </Shell.Root>
  );
}

const meta = {
  title: "Patterns/Shell",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

/** Rail, sidebar, and a group's threads. Resize to see each layout. */
export const Group = {
  render: () => <Workspace thread={false} />,
} satisfies Story;

/** The same group with a thread open in the side panel. */
export const GroupWithThread = {
  render: () => <Workspace thread />,
} satisfies Story;

/** Closing the thread returns to the group alone. */
export const CloseThread = {
  render: () => <Workspace thread />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 1, name: "general" })).toBeVisible();
    await expect(
      canvas.getByRole("heading", { level: 2, name: "Composer paste crash" }),
    ).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Close thread" }));
    await waitFor(() =>
      expect(canvas.queryByRole("heading", { name: "Composer paste crash" })).toBeNull(),
    );
  },
} satisfies Story;
