import { For, createSignal, onMount, onCleanup } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Shell } from "@amends/ui/compositions/shell";
import { Navigation } from "@amends/ui/compositions/navigation";
import { Divider } from "@amends/ui/primitives/divider";
import { Field } from "@amends/ui/compositions/field";
import { Input } from "@amends/ui/primitives/input";
import { Select } from "@amends/ui/primitives/select";
import { Button } from "@amends/ui/primitives/button";
import { Container, Row, Column, Grid } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import type { ColorTheme } from "@amends/ui/foundations/color";
import { DemoIcon } from "../../primitives/icon-button/icon-button.stories-support.tsx";
import "@amends/ui/foundations/typography/fonts";
import * as s from "./shell.stories.css.ts";

type Args = {
  theme: ColorTheme;
  defaultCollapsed: boolean;
  longNavigation: boolean;
  rtl: boolean;
  enlarged: boolean;
};
export function ShellFixture(props: Args) {
  const [page, setPage] = createSignal("Threads"),
    [result, setResult] = createSignal("");
  let draft!: HTMLInputElement;
  onMount(() => {
    if (!props.enlarged) return;
    const style = document.documentElement.style,
      previous = style.getPropertyValue("font-size"),
      priority = style.getPropertyPriority("font-size");
    style.setProperty("font-size", "200%");
    onCleanup(() => {
      if (previous) style.setProperty("font-size", previous, priority);
      else style.removeProperty("font-size");
    });
  });
  return (
    <Shell.Root
      class={colorThemes[props.theme]}
      defaultCollapsed={props.defaultCollapsed}
      dir={props.rtl ? "rtl" : undefined}
    >
      <Shell.Sidebar>
        <Shell.SidebarHeader>
          <Row gap={2} wrap={false}>
            <span class={s.brand} aria-hidden="true">
              A
            </span>
            <Shell.SidebarLabel>
              <Text as="span">Acme workspace</Text>
            </Shell.SidebarLabel>
          </Row>
        </Shell.SidebarHeader>
        <Shell.SidebarContent>
          <Navigation.Root aria-label="Workspace">
            <Navigation.Link
              target="_self"
              href="#home"
              aria-current={page() === "Home" ? "page" : undefined}
              onClick={() => setPage("Home")}
            >
              <Navigation.Icon>
                <DemoIcon name="home" />
              </Navigation.Icon>
              <Navigation.Label>Home</Navigation.Label>
            </Navigation.Link>
            <Navigation.Link
              target="_self"
              href="#threads"
              aria-current={page() === "Threads" ? "page" : undefined}
              onClick={() => setPage("Threads")}
            >
              <Navigation.Icon>
                <DemoIcon name="threads" />
              </Navigation.Icon>
              <Navigation.Label>Threads</Navigation.Label>
              <Navigation.Count aria-label="3 unread">3</Navigation.Count>
            </Navigation.Link>
            <Navigation.Section>
              <Navigation.SectionHeader>
                <Navigation.SectionLabel>Workspace</Navigation.SectionLabel>
                <Divider.Line />
              </Navigation.SectionHeader>
              <Navigation.Link
                target="_self"
                href="#groups"
                aria-current={page() === "Groups" ? "page" : undefined}
                onClick={() => setPage("Groups")}
              >
                <Navigation.Icon>
                  <DemoIcon name="groups" />
                </Navigation.Icon>
                <Navigation.Label>Groups</Navigation.Label>
              </Navigation.Link>
              <Navigation.Link
                target="_self"
                href="#members"
                aria-current={page() === "Members" ? "page" : undefined}
                onClick={() => setPage("Members")}
              >
                <Navigation.Icon>
                  <DemoIcon name="members" />
                </Navigation.Icon>
                <Navigation.Label>Members</Navigation.Label>
              </Navigation.Link>
            </Navigation.Section>
            <For each={props.longNavigation ? Array.from({ length: 24 }, (_, i) => i + 1) : []}>
              {(number) => (
                <Navigation.Link target="_self" href={`#group-${number}`}>
                  <Navigation.Icon>
                    <DemoIcon name="groups" />
                  </Navigation.Icon>
                  <Navigation.Label>{`Project group ${number}`}</Navigation.Label>
                </Navigation.Link>
              )}
            </For>
            <Navigation.Link
              target="_self"
              href="#settings"
              aria-current={page() === "Settings" ? "page" : undefined}
              onClick={() => setPage("Settings")}
            >
              <Navigation.Icon>
                <DemoIcon name="settings" />
              </Navigation.Icon>
              <Navigation.Label>Settings</Navigation.Label>
            </Navigation.Link>
          </Navigation.Root>
          <Shell.SidebarExpanded>
            <Column gap={4} class={s.note}>
              <Field label="Sidebar draft">
                {(control) => <Input {...control} placeholder="Keep a note…" />}
              </Field>
              <Field label="Thread view">
                {(control) => (
                  <Select
                    {...control}
                    defaultValue="all"
                    options={[
                      { value: "all", label: "All threads" },
                      { value: "following", label: "Following" },
                      { value: "mentions", label: "Mentions" },
                    ]}
                  />
                )}
              </Field>
            </Column>
          </Shell.SidebarExpanded>
        </Shell.SidebarContent>
        <Shell.SidebarFooter>
          <Navigation.Root aria-label="Account">
            <Navigation.Link target="_self" href="#account" onClick={() => setPage("Account")}>
              <Navigation.Icon>
                <DemoIcon name="account" />
              </Navigation.Icon>
              <Navigation.Label>Jo Mercer</Navigation.Label>
            </Navigation.Link>
          </Navigation.Root>
        </Shell.SidebarFooter>
      </Shell.Sidebar>
      <Shell.Body>
        <Shell.Header>
          <Row gap={3} wrap={false}>
            <Shell.NavigationToggle />
            <Text as="h1" variant="heading">
              {page()}
            </Text>
          </Row>
          <Button variant="secondary" onClick={() => draft.focus()}>
            New thread
          </Button>
        </Shell.Header>
        <Shell.Main>
          <Container>
            <Column gap={6}>
              <Column gap={2}>
                <Text as="h2" variant="heading">
                  Shared context, in one place
                </Text>
                <Text tone="secondary">
                  Conversations and decisions from across your workspace.
                </Text>
              </Column>
              <Grid minColumnWidth="14rem" maxColumns={3} gap={4}>
                <For
                  each={[
                    {
                      title: "Proposal review",
                      detail: "Feedback on the next version of the proposal.",
                      meta: "4 participants",
                    },
                    {
                      title: "Design notes",
                      detail: "Decisions and references for the shared interface.",
                      meta: "Following",
                    },
                    {
                      title: "Release planning",
                      detail: "What is ready and what still needs a decision.",
                      meta: "Updated today",
                    },
                  ]}
                >
                  {(thread) => (
                    <Column class={s.card} gap={3}>
                      <Text as="h3">{thread.title}</Text>
                      <Text tone="secondary">{thread.detail}</Text>
                      <Text variant="mono" tone="secondary">
                        {thread.meta}
                      </Text>
                    </Column>
                  )}
                </For>
              </Grid>
              <Column
                as="form"
                gap={3}
                onSubmit={(event) => {
                  event.preventDefault();
                  setResult(`Draft saved: ${draft.value}`);
                }}
              >
                <Field label="Thread title">
                  {(control) => (
                    <Input
                      {...control}
                      ref={(element) => {
                        draft = element;
                      }}
                      placeholder="Start with a clear title"
                      required
                    />
                  )}
                </Field>
                <Row gap={3}>
                  <Button type="submit">Save draft</Button>
                  <Text role="status">{result()}</Text>
                </Row>
              </Column>
              <Column gap={0}>
                <For each={Array.from({ length: 12 }, (_, i) => i + 1)}>
                  {(number) => (
                    <Row class={s.entry} justify="between">
                      <Text>Conversation {number}</Text>
                      <Text tone="secondary">Ready to read</Text>
                    </Row>
                  )}
                </For>
              </Column>
            </Column>
          </Container>
        </Shell.Main>
        <Shell.Footer>
          <Text variant="mono" tone="secondary">
            Acme workspace
          </Text>
          <Text tone="secondary">All changes saved</Text>
        </Shell.Footer>
      </Shell.Body>
    </Shell.Root>
  );
}
const viewports = {
  desktop: {
    name: "Desktop",
    styles: { width: "1280px", height: "850px" },
    type: "desktop" as const,
  },
  phone: { name: "Phone", styles: { width: "390px", height: "844px" }, type: "mobile" as const },
};
const meta = {
  excludeStories: ["ShellFixture"],
  title: "Compositions/Shell",
  render: (props: Args) => <ShellFixture {...props} />,
  args: {
    theme: "cotton",
    defaultCollapsed: false,
    longNavigation: false,
    rtl: false,
    enlarged: false,
  },
  argTypes: {
    theme: { control: "select", options: ["cotton", "soot"] },
    defaultCollapsed: { control: "boolean" },
    longNavigation: { control: "boolean" },
    rtl: { control: "boolean" },
    enlarged: { control: "boolean" },
  },
  parameters: {
    layout: "fullscreen" as const,
    viewport: { options: viewports },
    a11y: {
      config: {
        checks: [
          {
            id: "region",
            options: {
              regionMatcher:
                "dialog, [role=dialog], [role=alertdialog], svg, [role=tooltip], [role=listbox][aria-labelledby]",
            },
          },
        ],
      },
    },
  },
  tags: ["autodocs"],
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Responsive = {} satisfies Story;
export const Desktop = {
  globals: { viewport: { value: "desktop", isRotated: false } },
} satisfies Story;
export const Collapsed = { ...Desktop, args: { defaultCollapsed: true } } satisfies Story;
export const Soot = { ...Desktop, args: { theme: "soot" } } satisfies Story;
export const Mobile = {
  globals: { viewport: { value: "phone", isRotated: false } },
} satisfies Story;
export const MobileOpen = {
  ...Mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      await canvas.findByRole("button", { name: "Open navigation" }, { timeout: 5000 }),
    );
    await expect(canvas.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  },
} satisfies Story;
export const LongNavigation = { ...Desktop, args: { longNavigation: true } } satisfies Story;
export const RightToLeft = { ...Desktop, args: { rtl: true } } satisfies Story;
export const EnlargedText = {
  ...Desktop,
  args: { enlarged: true },
  tags: ["!autodocs"],
} satisfies Story;
export const DesktopInteraction = {
  ...Desktop,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      draft = canvas.getByRole("textbox", { name: "Sidebar draft" }),
      link = canvas.getByRole("link", { name: "Groups" });
    await userEvent.type(draft, "Keep this note");
    await userEvent.click(canvas.getByRole("button", { name: "Collapse navigation" }));
    await expect(canvas.queryByRole("textbox", { name: "Sidebar draft" })).toBeNull();
    await expect(canvas.getByRole("link", { name: "Groups" })).toBe(link);
    await userEvent.click(canvas.getByRole("button", { name: "Expand navigation" }));
    await expect(canvas.getByRole("textbox", { name: "Sidebar draft" })).toBe(draft);
    await expect(draft).toHaveValue("Keep this note");
  },
} satisfies Story;
export const MobileInteraction = {
  ...Mobile,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      trigger = await canvas.findByRole("button", { name: "Open navigation" }, { timeout: 5000 });
    await userEvent.click(trigger);
    await userEvent.click(canvas.getByRole("link", { name: "Groups" }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await expect(canvas.getByRole("heading", { level: 1 })).toHaveTextContent("Groups");
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await expect(canvas.queryByRole("button", { name: "Close navigation" })).toBeNull();
    await expect(canvas.getByRole("dialog", { name: "Navigation" })).toBeVisible();
  },
} satisfies Story;
export const WithoutSidebar = {
  render: () => (
    <Shell.Root class={colorThemes.cotton}>
      <Shell.Body>
        <Shell.Header>
          <Text as="h1" variant="heading">
            Welcome
          </Text>
          <Shell.NavigationToggle />
        </Shell.Header>
        <Shell.Main>
          <Container>
            <Text>A page can use the shell frame without navigation.</Text>
          </Container>
        </Shell.Main>
      </Shell.Body>
    </Shell.Root>
  ),
} satisfies Story;
