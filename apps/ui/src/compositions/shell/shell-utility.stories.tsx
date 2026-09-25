import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { Shell } from "@amends/ui/compositions/shell";
import { Navigation } from "@amends/ui/compositions/navigation";
import { AccountMenu } from "@amends/ui/features/account";
import { ThemeChoice, type ThemePreference } from "@amends/ui/features/appearance";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { IconMarkHome, IconMarkSettings } from "@amends/icons";
function Specimen(props: { collapsed?: boolean; rtl?: boolean }) {
  const [choice, setChoice] = createSignal<ThemePreference>("system");
  return (
    <ThemeProvider theme={choice() === "dark" ? "soot" : "cotton"}>
      <Shell.Root defaultCollapsed={props.collapsed} dir={props.rtl ? "rtl" : undefined}>
        <Shell.Sidebar>
          <Shell.SidebarHeader>
            <Row gap={2} wrap={false}>
              <WorkspaceMark variant="brand" decorative>
                A
              </WorkspaceMark>
              <Shell.SidebarLabel>Acme Finance</Shell.SidebarLabel>
            </Row>
          </Shell.SidebarHeader>
          <Shell.SidebarUtility>
            <AccountMenu.Root>
              <AccountMenu.Trigger label="Your account" initials="JM" />
              <AccountMenu.Content>
                <AccountMenu.Identity identifier="jo@acme.test" initials="JM" />
                <ThemeChoice value={choice()} onValueChange={setChoice} />
              </AccountMenu.Content>
            </AccountMenu.Root>
          </Shell.SidebarUtility>
          <Shell.SidebarContent>
            <Navigation.Root aria-label="Workspace">
              <Navigation.Link href="#home" aria-current="page">
                <Navigation.Icon>
                  <IconMarkHome />
                </Navigation.Icon>
                <Navigation.Label>Home</Navigation.Label>
              </Navigation.Link>
              <Navigation.Link href="#settings">
                <Navigation.Icon>
                  <IconMarkSettings />
                </Navigation.Icon>
                <Navigation.Label>Settings</Navigation.Label>
              </Navigation.Link>
            </Navigation.Root>
          </Shell.SidebarContent>
        </Shell.Sidebar>
        <Shell.Body>
          <Shell.Header>
            <Shell.NavigationToggle />
            <Text as="h1" variant="heading">
              Home
            </Text>
          </Shell.Header>
          <Shell.Main>
            <Shell.Content>
              <Text>One account control survives layout and theme changes.</Text>
            </Shell.Content>
          </Shell.Main>
        </Shell.Body>
      </Shell.Root>
    </ThemeProvider>
  );
}
const meta = {
  title: "Compositions/Shell/Utility",
  render: () => <Specimen />,
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Expanded = {} satisfies Story;
export const Collapsed = { render: () => <Specimen collapsed /> } satisfies Story;
export const Mobile = {
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies Story;
export const RTL = { render: () => <Specimen rtl /> } satisfies Story;
export const PreservesControl = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Your account" });
    await userEvent.click(trigger);
    await userEvent.click(await page.findByText("Soot", { exact: true }));
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Collapse navigation" }));
    await expect(canvas.getByRole("button", { name: "Your account" })).toBe(trigger);
    await userEvent.click(trigger);
    await expect(await page.findByRole("radio", { name: "Soot" })).toBeChecked();
    await userEvent.keyboard("{Escape}");
    await userEvent.click(canvas.getByRole("button", { name: "Expand navigation" }));
    await expect(canvas.getByRole("button", { name: "Your account" })).toBe(trigger);
  },
} satisfies Story;
