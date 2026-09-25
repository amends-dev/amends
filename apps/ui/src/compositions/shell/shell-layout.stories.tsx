import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Shell } from "@amends/ui/compositions/shell";
import { PageHeader } from "@amends/ui/compositions/page-header";
import { Navigation } from "@amends/ui/compositions/navigation";
import { AccountMenu } from "@amends/ui/features/account";
import { SegmentedControl } from "@amends/ui/compositions/segmented-control";
import { ListDetail } from "@amends/ui/compositions/list-detail";
import { Button } from "@amends/ui/primitives/button";
import { Divider } from "@amends/ui/primitives/divider";
import { WorkspaceMark } from "@amends/ui/primitives/workspace-mark";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import {
  IconMarkHome,
  IconMarkTriage,
  IconMarkTasks,
  IconMarkEnvironments,
  IconMarkConnections,
  IconMarkSettings,
} from "@amends/icons";
import { createSignal, Show } from "solid-js";

function Fixture(props: { settings?: boolean; selected?: boolean; inspector?: boolean }) {
  const [section, setSection] = createSignal("members"),
    [selected, setSelected] = createSignal(props.selected ?? false),
    [inspector, setInspector] = createSignal(props.inspector ?? false);
  return (
    <ThemeProvider theme="cotton">
      <Shell.Root>
        <Shell.Sidebar aria-label="Workspace sidebar">
          <Shell.SidebarHeader>
            <Row gap={2} wrap={false}>
              <WorkspaceMark variant="brand" decorative>
                A
              </WorkspaceMark>
              <Column gap={0}>
                <Shell.SidebarLabel>Acme Finance</Shell.SidebarLabel>
                <Shell.SidebarSubtitle>workspace</Shell.SidebarSubtitle>
              </Column>
            </Row>
          </Shell.SidebarHeader>
          <Shell.SidebarUtility>
            <AccountMenu.Root>
              <AccountMenu.Trigger label="Your account" initials="JM" />
              <AccountMenu.Content>
                <AccountMenu.Identity identifier="jo@acme.test" initials="JM" />
              </AccountMenu.Content>
            </AccountMenu.Root>
          </Shell.SidebarUtility>
          <Shell.SidebarContent>
            <Navigation.Root aria-label="Workspace">
              <Navigation.Section>
                <Navigation.Link href="#home" aria-current={props.settings ? undefined : "page"}>
                  <Navigation.Icon>
                    <IconMarkHome />
                  </Navigation.Icon>
                  <Navigation.Label>Home</Navigation.Label>
                </Navigation.Link>
                <Navigation.Link href="#triage">
                  <Navigation.Icon>
                    <IconMarkTriage />
                  </Navigation.Icon>
                  <Navigation.Label>Triage</Navigation.Label>
                </Navigation.Link>
                <Navigation.Link href="#tasks">
                  <Navigation.Icon>
                    <IconMarkTasks />
                  </Navigation.Icon>
                  <Navigation.Label>Tasks</Navigation.Label>
                </Navigation.Link>
              </Navigation.Section>
              <Navigation.Section>
                <Navigation.SectionHeader>
                  <Navigation.SectionLabel>Configure</Navigation.SectionLabel>
                  <Divider.Line />
                </Navigation.SectionHeader>
                <Navigation.Link href="#environments">
                  <Navigation.Icon>
                    <IconMarkEnvironments />
                  </Navigation.Icon>
                  <Navigation.Label>Environments</Navigation.Label>
                </Navigation.Link>
                <Navigation.Link href="#connections">
                  <Navigation.Icon>
                    <IconMarkConnections />
                  </Navigation.Icon>
                  <Navigation.Label>Connections</Navigation.Label>
                </Navigation.Link>
                <Navigation.Link
                  href="#settings"
                  aria-current={props.settings ? "page" : undefined}
                >
                  <Navigation.Icon>
                    <IconMarkSettings />
                  </Navigation.Icon>
                  <Navigation.Label>Settings</Navigation.Label>
                </Navigation.Link>
              </Navigation.Section>
            </Navigation.Root>
          </Shell.SidebarContent>
        </Shell.Sidebar>
        <Shell.Rail aria-label="Workspace rail">
          <WorkspaceMark variant="brand" decorative>
            A
          </WorkspaceMark>
          <Shell.NavigationToggle mode="tablet" />
          <Shell.RailContent>
            <Navigation.Root compact aria-label="Workspace shortcuts">
              <Navigation.Link href="#home" aria-current={props.settings ? undefined : "page"}>
                <Navigation.Icon>
                  <IconMarkHome />
                </Navigation.Icon>
                <Navigation.Label>Home</Navigation.Label>
              </Navigation.Link>
              <Navigation.Link href="#triage">
                <Navigation.Icon>
                  <IconMarkTriage />
                </Navigation.Icon>
                <Navigation.Label>Triage</Navigation.Label>
              </Navigation.Link>
              <Navigation.Link href="#tasks">
                <Navigation.Icon>
                  <IconMarkTasks />
                </Navigation.Icon>
                <Navigation.Label>Tasks</Navigation.Label>
              </Navigation.Link>
              <Navigation.Link href="#settings" aria-current={props.settings ? "page" : undefined}>
                <Navigation.Icon>
                  <IconMarkSettings />
                </Navigation.Icon>
                <Navigation.Label>Settings</Navigation.Label>
              </Navigation.Link>
            </Navigation.Root>
          </Shell.RailContent>
        </Shell.Rail>
        <Shell.Body>
          <Shell.Header workspace>
            <PageHeader.Root>
              <Show when={props.settings}>
                <PageHeader.Crumbs>
                  <PageHeader.Navigation>
                    <Shell.NavigationToggle mode="phone" />
                  </PageHeader.Navigation>
                  Configure / Settings
                </PageHeader.Crumbs>
              </Show>
              <PageHeader.Heading>
                <Show when={!props.settings}>
                  <PageHeader.Navigation>
                    <Shell.NavigationToggle mode="phone" />
                  </PageHeader.Navigation>
                </Show>
                <PageHeader.Title>{props.settings ? "People" : "Home"}</PageHeader.Title>
                <Show when={!props.settings && !inspector()}>
                  <PageHeader.Actions>
                    <Button
                      variant="secondary"
                      data-inspector-trigger=""
                      onClick={() => setInspector(!inspector())}
                    >
                      session log
                    </Button>
                  </PageHeader.Actions>
                </Show>
              </PageHeader.Heading>
              <PageHeader.Meta>
                {props.settings
                  ? "5 active · 1 removed · acting as Jo Mercer (owner)"
                  : "2 need you · 3 working"}
              </PageHeader.Meta>
            </PageHeader.Root>
          </Shell.Header>
          <Shell.Main workspace>
            <Shell.Content>
              <Show
                when={props.settings}
                fallback={
                  <Column gap={6}>
                    <Column gap={3}>
                      <Text variant="mono" tone="secondary">
                        NEEDS YOU · 2
                      </Text>
                      <Row gap={4}>
                        <Text>Ada finished attempt 2.</Text>
                        <Text>Is this refund inside the 30-day window?</Text>
                      </Row>
                    </Column>
                    <Column gap={3}>
                      <Text variant="mono" tone="secondary">
                        WORKING · 3
                      </Text>
                      <Text>Backfill the archived delivery receipts</Text>
                      <Text>Reconcile the September invoice totals</Text>
                      <Text>Seat count off by one after invite</Text>
                    </Column>
                  </Column>
                }
              >
                <Column gap={6}>
                  <SegmentedControl.Root
                    aria-label="Settings sections"
                    value={section()}
                    onValueChange={setSection}
                  >
                    <SegmentedControl.Item value="members">People</SegmentedControl.Item>
                    <SegmentedControl.Item value="invites">Invites</SegmentedControl.Item>
                    <SegmentedControl.Item value="workspace">Workspace</SegmentedControl.Item>
                  </SegmentedControl.Root>
                  <ListDetail.Root selected={selected()}>
                    <ListDetail.List>
                      <Column gap={3}>
                        <Text variant="mono" tone="secondary">
                          PEOPLE · 5 people
                        </Text>
                        <Row>
                          <Button variant="ghost" onClick={() => setSelected(true)}>
                            Sam Oyelaran · member
                          </Button>
                        </Row>
                      </Column>
                    </ListDetail.List>
                    <Show when={selected()}>
                      <ListDetail.Detail aria-label="Person details">
                        <Column gap={3}>
                          <ListDetail.Back
                            href="#people"
                            onClick={(event) => {
                              event.preventDefault();
                              setSelected(false);
                            }}
                          >
                            Back to people
                          </ListDetail.Back>
                          <Text as="h2" variant="heading">
                            Sam Oyelaran
                          </Text>
                          <Text variant="mono" tone="secondary">
                            member · work
                          </Text>
                        </Column>
                      </ListDetail.Detail>
                    </Show>
                  </ListDetail.Root>
                </Column>
              </Show>
            </Shell.Content>
          </Shell.Main>
        </Shell.Body>
        <Shell.Inspector
          title="Session log"
          open={inspector()}
          onOpenChange={setInspector}
          returnFocus={() =>
            document.querySelector<HTMLElement>("[data-inspector-trigger]") ?? undefined
          }
        >
          <Column gap={4} style={{ padding: "1.25rem" }}>
            <Row justify="between">
              <Text as="h2" variant="heading" style={{ "font-size": "1.1875rem" }}>
                Session log
              </Text>
              <Button variant="ghost" onClick={() => setInspector(false)}>
                Close
              </Button>
            </Row>
            <Text variant="mono" tone="secondary">
              Attempt 2 · ses_8846
            </Text>
            <Text variant="mono">+0.0s · session.started</Text>
            <Text variant="mono">+1.4s · read_file ledger.ts</Text>
            <Text variant="mono">+2.8s · run_command vitest</Text>
          </Column>
        </Shell.Inspector>
      </Shell.Root>
    </ThemeProvider>
  );
}
const viewport = {
  desktop: {
    name: "Desktop",
    styles: { width: "1440px", height: "900px" },
    type: "desktop" as const,
  },
  laptop: {
    name: "Laptop",
    styles: { width: "1180px", height: "820px" },
    type: "desktop" as const,
  },
  tablet: { name: "Tablet", styles: { width: "834px", height: "1000px" }, type: "tablet" as const },
  phone: { name: "Phone", styles: { width: "390px", height: "844px" }, type: "mobile" as const },
};
const meta = {
  title: "Compositions/Shell/Workspace layout",
  render: () => <Fixture />,
  parameters: { layout: "fullscreen" as const, viewport: { options: viewport } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Desktop = {
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Story;
export const Laptop = {
  globals: { viewport: { value: "laptop", isRotated: false } },
} satisfies Story;
export const Tablet = {
  globals: { viewport: { value: "tablet", isRotated: false } },
} satisfies Story;
export const Phone = {
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies Story;
export const Settings = {
  render: () => <Fixture settings />,
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Story;
export const SettingsPhone = {
  render: () => <Fixture settings />,
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies Story;
export const SettingsSelected = {
  render: () => <Fixture settings selected />,
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Story;
export const SettingsSelectedPhone = {
  render: () => <Fixture settings selected />,
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies Story;
export const InspectorDesktop = {
  render: () => <Fixture inspector />,
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Story;
export const InspectorLaptop = {
  render: () => <Fixture />,
  globals: { viewport: { value: "laptop", isRotated: false } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "session log" }));
    await expect(canvas.getByRole("dialog", { name: "Session log" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Close" }));
    await expect(canvas.queryByRole("dialog", { name: "Session log" })).toBeNull();
    await waitFor(() => expect(canvas.getByRole("button", { name: "session log" })).toHaveFocus());
  },
} satisfies Story;
export const InspectorPhone = {
  render: () => <Fixture inspector />,
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies Story;
