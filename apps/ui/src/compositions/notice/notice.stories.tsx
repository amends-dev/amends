import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, type ParentProps } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { colorVars } from "@amends/ui/foundations/color/styles";
import { Column, Row } from "@amends/ui/primitives/layout";
import { Text } from "@amends/ui/primitives/text";
import { Button } from "@amends/ui/primitives/button";
import { Notice, type NoticeTone } from "@amends/ui/compositions/notice";

function Frame(
  props: ParentProps<{
    theme?: "cotton" | "soot";
    narrow?: boolean;
    rtl?: boolean;
    panel?: boolean;
  }>,
) {
  return (
    <ThemeProvider theme={props.theme ?? "cotton"} dir={props.rtl ? "rtl" : undefined}>
      <Column
        gap={5}
        style={{
          padding: "1.5rem",
          "max-width": props.narrow ? "20rem" : "26.25rem",
          background: props.panel ? colorVars.surface.panel : undefined,
        }}
      >
        {props.children}
      </Column>
    </ThemeProvider>
  );
}
/** The Sign in reference's ended-membership state. */
function Reference(props: { theme?: "cotton" | "soot"; narrow?: boolean; rtl?: boolean }) {
  return (
    <Frame {...props}>
      <Text as="h1" variant="heading">
        That workspace is closed to you
      </Text>
      <Notice.Root tone="danger">
        <Notice.Label>No longer a member</Notice.Label>
        <Notice.Body>
          Your membership of Mercier &amp; Co ended on 12 September. The work you did stays on that
          workspace’s record; you cannot open it.
        </Notice.Body>
      </Notice.Root>
      <Text tone="secondary">Rejoining needs a fresh invitation.</Text>
    </Frame>
  );
}
const copy: Record<NoticeTone, { label: string; body: string }> = {
  danger: {
    label: "No longer a member",
    body: "Your membership of Mercier & Co has ended.",
  },
  pending: {
    label: "Invitation waiting",
    body: "You’ve been invited to Fold Studio. Accept it from your workspaces to open it.",
  },
  success: { label: "Joined", body: "You’re now a member of Fold Studio." },
};
function Tones(props: { theme?: "cotton" | "soot"; panel?: boolean }) {
  return (
    <Frame {...props}>
      {(["danger", "pending", "success"] as const).map((tone) => (
        <Notice.Root tone={tone}>
          <Notice.Label>{copy[tone].label}</Notice.Label>
          <Notice.Body>{copy[tone].body}</Notice.Body>
        </Notice.Root>
      ))}
    </Frame>
  );
}
function Announced() {
  const [joined, setJoined] = createSignal(false);
  return (
    <Frame>
      <Notice.Root tone={joined() ? "success" : "pending"} role="status" aria-atomic="true">
        <Notice.Label>{joined() ? "Joined" : "Invitation waiting"}</Notice.Label>
        <Notice.Body>
          {joined() ? "You’re now a member of Fold Studio." : "You’ve been invited to Fold Studio."}
        </Notice.Body>
      </Notice.Root>
      <Row>
        <Button onClick={() => setJoined(true)}>Accept invitation</Button>
      </Row>
    </Frame>
  );
}

const meta = { title: "Compositions/Notice", render: () => <Reference /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Default = {} satisfies Story;
export const AllTones = {
  render: () => (
    <>
      <Tones />
      <Tones panel />
    </>
  ),
} satisfies Story;
export const Comparison = {
  render: () => (
    <>
      <Reference />
      <Reference theme="soot" />
      <Tones theme="soot" />
      <Tones theme="soot" panel />
    </>
  ),
} satisfies Story;
export const Narrow = { render: () => <Reference narrow /> } satisfies Story;
export const RTL = { render: () => <Reference rtl /> } satisfies Story;
export const EnlargedText = {
  render: () => (
    <div style={{ zoom: 2 }}>
      <Reference narrow />
    </div>
  ),
} satisfies Story;
export const ExplicitAnnouncement = {
  render: () => <Announced />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const notice = canvas.getByRole("status");
    await expect(notice).toHaveTextContent("Invitation waiting");
    await userEvent.click(canvas.getByRole("button", { name: "Accept invitation" }));
    await expect(canvas.getByRole("status")).toBe(notice);
    await expect(notice).toHaveAttribute("data-notice-tone", "success");
    await expect(notice).toHaveTextContent("Joined");
  },
} satisfies Story;
