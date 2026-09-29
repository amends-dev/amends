import type { JSX } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { navigation, type NavigationSample } from "../sample.ts";
import {
  DestinationSidebar,
  HomeSidebar,
  WorkspaceNavigation,
  type Destination,
  type NavigationSection,
} from "./index.ts";

const meta = {
  title: "Screens/Workspace navigation",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Frame(props: {
  readonly navigation: NavigationSample;
  readonly destination?: Destination;
  readonly title?: string;
  readonly children?: JSX.Element;
}) {
  return (
    <Shell.Root>
      <WorkspaceNavigation {...props.navigation} destination={props.destination ?? "home"}>
        {props.children ?? <HomeSidebar {...props.navigation} />}
      </WorkspaceNavigation>
      <Shell.Main>
        <Pane.Root>
          <Pane.Header>
            <Shell.NavigationToggle />
            <Pane.Title>{props.title ?? "Home"}</Pane.Title>
          </Pane.Header>
        </Pane.Root>
      </Shell.Main>
    </Shell.Root>
  );
}

/** The general group first, then the rest by name; conversations, then teammates to message. */
export const Home = {
  render: () => (
    <Frame
      navigation={{
        ...navigation({
          groups: [
            { id: "general", name: "general" },
            { id: "design", name: "design" },
          ],
        }),
        directMessages: [
          { id: "alex", name: "Alex Morgan", tone: "sand", href: "#alex" },
          { id: "sara", name: "Sara", tone: "clay", href: "#sara" },
          { id: "yumi", name: "Yumi", tone: "lilac", href: "#yumi" },
        ],
      }}
    />
  ),
} satisfies Story;

/** A reader in no group yet, such as in a workspace made before general groups existed. */
export const NoGroups = {
  render: () => <Frame navigation={navigation({ groups: [] })} />,
  play: async ({ canvasElement }) => {
    const sidebar = within(canvasElement).getByRole("navigation", { name: "Workspace" });
    await expect(within(sidebar).getByText("No groups yet")).toBeVisible();
  },
} satisfies Story;

/** While groups load, an empty list says nothing yet. */
export const GroupsLoading = {
  render: () => <Frame navigation={{ ...navigation({ groups: [] }), groupsLoading: true }} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByText("No groups yet")).toBeNull();
  },
} satisfies Story;

const agent = (id: string, name: string, extra: Partial<NavigationSection["entries"][number]>) => ({
  id,
  name,
  href: `#${id}`,
  person: { name, initials: name.charAt(0), tone: "lilac" as const },
  ...extra,
});

const agents = (current?: string): NavigationSection => ({
  id: "agents",
  title: "Agents",
  href: "#agents",
  current: current === undefined,
  browse: { label: "Browse agents", onBrowse: () => {} },
  create: { label: "Add agent", onCreate: () => {} },
  entries: [
    agent("atlas", "Atlas", { activity: "queued", current: current === "atlas" }),
    agent("nora", "Nora", { current: current === "nora" }),
    agent("review-helper", "Review helper", {
      attention: "Needs setup",
      current: current === "review-helper",
    }),
    agent("yumi", "Yumi", { activity: "working", current: current === "yumi" }),
  ],
  empty: "No agents yet",
});

/**
 * The Lunacy "Agents v02 / 01" frame: Agents in the rail lists the agents in the sidebar, marking
 * those at work and those that need setup, with Browse and Add agent beside the title.
 */
export const AgentsSidebar = {
  render: () => (
    <Frame navigation={navigation({ groups: [] })} destination="agents" title="Agents">
      <DestinationSidebar sections={[agents()]} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const sidebar = within(within(canvasElement).getByRole("navigation", { name: "Workspace" }));
    await expect(sidebar.getByRole("link", { name: "Agents" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(sidebar.getByRole("button", { name: "Browse agents" })).toBeVisible();
    await expect(sidebar.getByRole("button", { name: "Add agent" })).toBeVisible();
    await expect(sidebar.getByRole("img", { name: "Needs setup" })).toBeVisible();
    await expect(sidebar.queryByText("Inbox")).toBeNull();
  },
} satisfies Story;

/** The Lunacy "Agents v02 / 02" frame: an open agent is the sidebar's current row. */
export const AgentOpen = {
  render: () => (
    <Frame navigation={navigation({ groups: [] })} destination="agents" title="Atlas">
      <DestinationSidebar sections={[agents("atlas")]} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    const sidebar = within(within(canvasElement).getByRole("navigation", { name: "Workspace" }));
    await expect(sidebar.getByRole("link", { name: /Atlas/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
} satisfies Story;

/** The Lunacy "Agents v02 / 06" frame: no agents yet. */
export const NoAgents = {
  render: () => (
    <Frame navigation={navigation({ groups: [] })} destination="agents" title="Agents">
      <DestinationSidebar sections={[{ ...agents(), entries: [] }]} />
    </Frame>
  ),
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("No agents yet")).toBeVisible();
  },
} satisfies Story;
