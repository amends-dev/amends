import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Popover } from "@amends/ui/compositions/popover";
import { Dialog } from "@amends/ui/compositions/dialog";
import { Drawer } from "@amends/ui/compositions/drawer";
import { Avatar } from "@amends/ui/primitives/avatar";
import { Button } from "@amends/ui/primitives/button";
import { IconButton } from "@amends/ui/primitives/icon-button";
import { Text } from "@amends/ui/primitives/text";
import { IconUser } from "@amends/icons";
import { colorThemes } from "@amends/ui/foundations/color/styles";
import type { ColorTheme } from "@amends/ui/foundations/color";
import { EnlargedText as Enlarge } from "../../primitives/overlay/overlay.stories-support.tsx";
import "@amends/ui/foundations/typography/fonts";

function AgentPopover(props: { defaultOpen?: boolean; long?: boolean }) {
  return (
    <Popover.Root defaultOpen={props.defaultOpen}>
      <Popover.Trigger as={Button} variant="secondary">
        popover
      </Popover.Trigger>
      <Popover.Content>
        <div style={{ display: "flex", "align-items": "flex-start", gap: "0.625rem" }}>
          <Avatar.Root kind="agent" decorative style={{ width: "1.625rem", height: "1.625rem" }}>
            <Avatar.Fallback>a</Avatar.Fallback>
          </Avatar.Root>
          <div
            style={{
              display: "flex",
              "flex-wrap": "wrap",
              "align-items": "baseline",
              gap: "0.375rem",
              "min-width": 0,
            }}
          >
            <Popover.Title>
              {props.long ? "Ada_workspace_abcdefghijklmnopqrstuvwxyz_1234567890" : "Ada"}
            </Popover.Title>
            <Text
              as="span"
              variant="mono"
              tone="secondary"
              style={{ "font-size": "0.6875rem", "white-space": "nowrap" }}
            >
              agent
            </Text>
          </div>
        </div>
        <Popover.Description>
          {props.long
            ? "Busy · 2 of 3 sessions. Runs in the node 22 sandbox. This longer description wraps and stays readable near the edge of the viewport."
            : "Busy · 2 of 3 sessions. Runs in the node 22 sandbox."}
        </Popover.Description>
      </Popover.Content>
    </Popover.Root>
  );
}
function ReferenceSpecimen(props: { theme: ColorTheme; defaultOpen?: boolean; long?: boolean }) {
  return (
    <main
      class={colorThemes[props.theme]}
      style={{ padding: "4rem 1.5rem", "min-height": "18rem", "min-width": 0 }}
    >
      <AgentPopover defaultOpen={props.defaultOpen} long={props.long} />
    </main>
  );
}
const meta = {
  title: "Compositions/Popover",
  tags: ["autodocs"],
  parameters: {
    layout: "fullscreen" as const,
    a11y: {
      config: {
        checks: [{ id: "region", options: { regionMatcher: "dialog, [role=dialog], svg" } }],
      },
    },
  },
  args: { theme: "cotton" as ColorTheme },
  argTypes: { theme: { control: "select", options: ["cotton", "soot"] } },
  render: ReferenceSpecimen,
} satisfies Meta<typeof ReferenceSpecimen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Reference = {} satisfies Story;
export const Open = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "popover" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Ada" }),
      ).toBeVisible(),
    );
  },
} satisfies Story;
export const DefaultOpen = {
  render: (args) => <ReferenceSpecimen {...args} defaultOpen />,
  play: async ({ canvasElement }) => {
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Ada" }),
      ).toBeVisible(),
    );
  },
} satisfies Story;
export const Soot = { ...Open, args: { theme: "soot" } } satisfies Story;
export const LongContent = {
  ...Open,
  render: (args) => <ReferenceSpecimen {...args} long />,
} satisfies Story;
export const EnlargedText = {
  ...Open,
  render: (args) => (
    <Enlarge>
      <ReferenceSpecimen {...args} long />
    </Enlarge>
  ),
  tags: ["!autodocs"],
} satisfies Story;
export const Rtl = {
  ...Open,
  render: (args) => (
    <div dir="rtl">
      <ReferenceSpecimen {...args} />
    </div>
  ),
} satisfies Story;
export const NearEdge = {
  render: () => (
    <main
      class={colorThemes.cotton}
      style={{
        display: "flex",
        "justify-content": "flex-end",
        "align-items": "flex-end",
        padding: "1rem",
        "min-height": "100vh",
        "box-sizing": "border-box",
      }}
    >
      <AgentPopover />
    </main>
  ),
  play: Open.play,
} satisfies Story;
export const IconTrigger = {
  render: () => (
    <main class={colorThemes.cotton} style={{ padding: "4rem", "min-height": "18rem" }}>
      <Popover.Root>
        <Popover.Trigger as={IconButton} aria-label="Agent details">
          <IconUser />
        </Popover.Trigger>
        <Popover.Content>
          <Popover.Title>Ada</Popover.Title>
          <Popover.Description>Busy · 2 of 3 sessions.</Popover.Description>
        </Popover.Content>
      </Popover.Root>
    </main>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Agent details" }));
    await waitFor(() =>
      expect(
        within(canvasElement.ownerDocument.body).getByRole("dialog", { name: "Ada" }),
      ).toBeVisible(),
    );
  },
} satisfies Story;

function InteractionFixture() {
  const [count, setCount] = createSignal(0);
  return (
    <main class={colorThemes.cotton} style={{ padding: "4rem", "min-height": "18rem" }}>
      <Popover.Root>
        <Popover.Trigger as={Button} variant="secondary">
          Details
        </Popover.Trigger>
        <Popover.Content>
          <Popover.Title>Agent details</Popover.Title>
          <Popover.Description>
            Controls can be used without dismissing this panel.
          </Popover.Description>
          <Button variant="secondary" onClick={() => setCount((value) => value + 1)}>
            Count: {count()}
          </Button>
          <Popover.Close variant="ghost" onClick={(event) => event.preventDefault()}>
            Stay open
          </Popover.Close>
          <Popover.Close variant="secondary">Done</Popover.Close>
        </Popover.Content>
      </Popover.Root>
      <Button variant="ghost">Outside action</Button>
    </main>
  );
}
export const Interaction = {
  render: InteractionFixture,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body),
      trigger = canvas.getByRole("button", { name: "Details" });
    await userEvent.click(trigger);
    const panel = page.getByRole("dialog", { name: "Agent details" });
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await expect(panel).toHaveAccessibleDescription(
      "Controls can be used without dismissing this panel.",
    );
    await userEvent.click(page.getByRole("button", { name: "Count: 0" }));
    await expect(page.getByRole("button", { name: "Count: 1" })).toBeVisible();
    await expect(panel).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Stay open" }));
    await expect(panel).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Agent details" })).toBeNull());
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(trigger).toHaveFocus());
  },
} satisfies Story;

function ControlledFixture() {
  const [open, setOpen] = createSignal(false);
  return (
    <main class={colorThemes.cotton} style={{ padding: "4rem", "min-height": "18rem" }}>
      <Popover.Root open={open()} onOpenChange={setOpen}>
        <Popover.Trigger as={Button} variant="secondary">
          Controlled details
        </Popover.Trigger>
        <Popover.Content>
          <Popover.Title>Controlled panel</Popover.Title>
          <Popover.Description>The caller owns this open state.</Popover.Description>
          <Popover.Close>Done</Popover.Close>
        </Popover.Content>
      </Popover.Root>
      <Text role="status">{open() ? "Open" : "Closed"}</Text>
    </main>
  );
}
export const Controlled = {
  render: ControlledFixture,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body),
      trigger = canvas.getByRole("button", { name: "Controlled details" });
    await userEvent.click(trigger);
    await expect(canvas.getByRole("status")).toHaveTextContent("Open");
    await expect(page.getByRole("dialog", { name: "Controlled panel" })).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(canvas.getByRole("status")).toHaveTextContent("Closed"));
  },
} satisfies Story;

function NestedDialogFixture() {
  return (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem", "min-height": "100vh" }}>
      <Dialog.Root>
        <Dialog.Trigger>Open dialog</Dialog.Trigger>
        <Dialog.Content>
          <Dialog.Title>Review agent</Dialog.Title>
          <AgentPopover />
          <Dialog.Close variant="secondary">Done reviewing</Dialog.Close>
        </Dialog.Content>
      </Dialog.Root>
    </main>
  );
}
export const NestedDialog = {
  render: NestedDialogFixture,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open dialog" }));
    const dialog = canvas.getByRole("dialog", { name: "Review agent" });
    await userEvent.click(within(dialog).getByRole("button", { name: "popover" }));
    await waitFor(() => expect(within(dialog).getByRole("dialog", { name: "Ada" })).toBeVisible());
  },
} satisfies Story;

export const NestedDrawer = {
  render: () => (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem", "min-height": "100vh" }}>
      <Drawer.Root>
        <Drawer.Trigger>Open drawer</Drawer.Trigger>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Agents</Drawer.Title>
            <Drawer.Close />
          </Drawer.Header>
          <Drawer.Body>
            <AgentPopover />
          </Drawer.Body>
        </Drawer.Content>
      </Drawer.Root>
    </main>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Open drawer" }));
    const dialog = canvas.getByRole("dialog", { name: "Agents" });
    await userEvent.click(within(dialog).getByRole("button", { name: "popover" }));
    await waitFor(() => expect(within(dialog).getByRole("dialog", { name: "Ada" })).toBeVisible());
  },
} satisfies Story;
