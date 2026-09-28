import { For, createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import {
  IconBell,
  IconMarkClose,
  IconMarkNew,
  IconMarkSearch,
  IconMarkSettings,
} from "@amends/icons";
import { avatarTones } from "../foundations/color/tokens.ts";
import { Avatar, AvatarStack } from "./avatar/index.ts";
import { Count } from "./count/index.ts";
import { IconButton } from "./icon-button/index.ts";
import { Logo, type LogoMotion } from "./logo/index.ts";
import { StateArt, type StateArtKind } from "./state-art/index.ts";
import { Tabs } from "./tabs/index.ts";
import * as s from "./components.stories.css.ts";

const meta = { title: "Components/Basics" } satisfies Meta;
export default meta;
type Story = StoryObj;

export const LogoMark = {
  name: "Logo",
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Logo</h2>
        <p class={s.note}>
          The finalized mark. Hover a link that holds it: the patch lifts at its corner and the
          stitches stretch.
        </p>
        <div class={s.canvasPanel}>
          <For each={["1.25rem", "2.5rem", "4rem"]}>
            {(size) => (
              <a href="#logo" class={s.labelled} aria-label={`Amends at ${size}`}>
                <Logo size={size} />
                {size}
              </a>
            )}
          </For>
        </div>
      </section>
    </div>
  ),
} satisfies Story;

const motions: ReadonlyArray<{ readonly motion: LogoMotion; readonly use: string }> = [
  { motion: "sew-on", use: "Launch" },
  { motion: "thread", use: "Idle" },
  { motion: "tug", use: "Done" },
  { motion: "working", use: "Loading" },
];

/** The Amends Logo "5a in motion" board: the mark's own parts, looping. */
export const LogoMotions = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Logo in motion</h2>
        <p class={s.note}>
          The patch lands, gets tugged, or breathes, and the stitches do the rest. Each motion rests
          still for readers who prefer reduced motion.
        </p>
        <div class={s.canvasPanel}>
          <For each={motions}>
            {(entry) => (
              <span class={s.labelled}>
                <Logo size="4rem" motion={entry.motion} />
                {`${entry.motion} · ${entry.use}`}
              </span>
            )}
          </For>
        </div>
      </section>
    </div>
  ),
} satisfies Story;

const states: ReadonlyArray<{ readonly kind: StateArtKind; readonly use: string }> = [
  { kind: "sew-in", use: "No workspaces or agents yet" },
  { kind: "reach", use: "Nothing connected" },
  { kind: "fill", use: "No environments" },
  { kind: "caret", use: "No messages yet" },
  { kind: "rest", use: "All caught up" },
  { kind: "came-apart", use: "Couldn’t load" },
  { kind: "lost-thread", use: "Can’t reach the host" },
  { kind: "nothing-here", use: "Not found" },
  { kind: "held-back", use: "No access" },
];

/**
 * The Amends Logo "States" board: empty states are outlines waiting to be filled, errors are
 * stitches that came undone. EmptyState shows them above its title.
 */
export const StateArtStates = {
  name: "State art",
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>State art</h2>
        <p class={s.note}>
          Drawn from the same square, patch, and stitches as the mark, in the text color over the
          surface behind.
        </p>
        <div class={s.canvasPanel}>
          <For each={states}>
            {(state) => (
              <span class={s.labelled}>
                <StateArt kind={state.kind} />
                {`${state.kind} · ${state.use}`}
              </span>
            )}
          </For>
        </div>
      </section>
    </div>
  ),
} satisfies Story;

export const IconButtons = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Icon button</h2>
        <p class={s.note}>
          Regular (32px, 18px icon) for pane headers and compact (24px, 14px icon) for section
          actions. Below 64rem every icon button becomes a 44px touch target with a 20px icon.
        </p>
        <div class={s.panel}>
          <IconButton icon={IconBell} label="Notifications" />
          <IconButton icon={IconMarkSettings} label="Group settings" />
          <IconButton icon={IconMarkClose} label="Close" />
          <IconButton icon={IconMarkSearch} label="Browse groups" size="compact" />
          <IconButton icon={IconMarkNew} label="Create group" size="compact" />
          <IconButton icon={IconMarkNew} label="Unavailable" disabled />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "Notifications" })).toHaveAttribute(
      "type",
      "button",
    );
    await expect(canvas.getByRole("button", { name: "Unavailable" })).toBeDisabled();
  },
} satisfies Story;

export const Avatars = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Avatar</h2>
        <p class={s.note}>Square tiles in the sizes the screens use, and every tone.</p>
        <div class={s.panel}>
          <For each={[22, 24, 28, 30, 32, 40] as const}>
            {(size) => (
              <span class={s.labelled}>
                <Avatar name="Alex Morgan" tone="sand" size={size} />
                {size}
              </span>
            )}
          </For>
        </div>
        <div class={s.panel}>
          <For each={avatarTones}>
            {(tone) => (
              <span class={s.labelled}>
                <Avatar name={tone === "ink" ? "AJ" : "Yumi Sato"} tone={tone} />
                {tone}
              </span>
            )}
          </For>
          <span class={s.labelled}>
            <Avatar name="Mercier & Co" initials="M" variant="workspace" size={28} />
            workspace
          </span>
        </div>
        <div class={s.panel}>
          <AvatarStack
            aria-label="Alex, Yumi, and Sara"
            people={[
              { name: "Alex", tone: "sand" },
              { name: "Yumi", tone: "lilac" },
              { name: "Sara", tone: "clay" },
            ]}
          />
        </div>
      </section>
    </div>
  ),
} satisfies Story;

export const Counts = {
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Count</h2>
        <p class={s.note}>A badge for unread items; plain muted text beside a tab label.</p>
        <div class={s.panel}>
          <Count value={5} aria-label="5 unread" />
          <Count value={128} />
          <Count value={12} variant="plain" />
        </div>
      </section>
    </div>
  ),
} satisfies Story;

function TabsExample() {
  const [current, setCurrent] = createSignal("Threads");
  return (
    <Tabs.List aria-label="Group">
      <For each={[{ label: "Threads" }, { label: "Tasks", count: 12 }, { label: "Files" }]}>
        {(tab) => (
          <Tabs.Tab
            current={current() === tab.label}
            count={tab.count}
            onClick={() => setCurrent(tab.label)}
          >
            {tab.label}
          </Tabs.Tab>
        )}
      </For>
    </Tabs.List>
  );
}

export const TabRow = {
  name: "Tabs",
  render: () => (
    <div class={s.page}>
      <section class={s.section}>
        <h2 class={s.heading}>Tabs</h2>
        <p class={s.note}>
          Labels hug their text, 24px apart, on one row that scrolls sideways when it runs out of
          room. The current tab is darker, medium weight, and underlined.
        </p>
        <div class={s.tabsPanel}>
          <TabsExample />
        </div>
      </section>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tasks = canvas.getByRole("button", { name: /Tasks/ });
    await userEvent.click(tasks);
    await expect(tasks).toHaveAttribute("aria-current", "page");
    await expect(canvas.getByRole("button", { name: "Threads" })).not.toHaveAttribute(
      "aria-current",
    );
  },
} satisfies Story;
