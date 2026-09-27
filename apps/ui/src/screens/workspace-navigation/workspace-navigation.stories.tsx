import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, within } from "storybook/test";
import { Pane } from "../../patterns/pane/index.ts";
import { Shell } from "../../patterns/shell/index.ts";
import { navigation } from "../sample.ts";
import { WorkspaceNavigation, type WorkspaceNavigationProps } from "./index.ts";

const meta = {
  title: "Screens/Workspace navigation",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

function Frame(props: { readonly navigation: WorkspaceNavigationProps }) {
  return (
    <Shell.Root>
      <WorkspaceNavigation {...props.navigation} />
      <Shell.Main>
        <Pane.Root>
          <Pane.Header>
            <Shell.NavigationToggle />
            <Pane.Title>Home</Pane.Title>
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
