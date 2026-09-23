import { createSignal } from "solid-js";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import "../../foundations/typography/fonts.ts";
import { Button } from "../../primitives/button/index.ts";
import { ApplicationFrame, ApplicationPage } from "./application.tsx";

function Specimen(props: { theme?: "cotton" | "soot"; title: string; message: string }) {
  return (
    <ApplicationFrame theme={props.theme}>
      <ApplicationPage brand="Amends" title={props.title} message={props.message}>
        <Button variant="secondary">Continue</Button>
      </ApplicationPage>
    </ApplicationFrame>
  );
}
const meta = {
  title: "Compositions/Application",
  component: Specimen,
  parameters: { layout: "fullscreen" as const },
  args: { title: "Welcome", message: "The caller supplies page content and actions." },
} satisfies Meta<typeof Specimen>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Cotton = {} satisfies Story;
export const Soot = { args: { theme: "soot" } } satisfies Story;
export const LongContent = {
  args: {
    title: "A longer title that wraps within the available page width",
    message:
      "Content stays within the shared container while adapting to narrow windows and enlarged text.",
  },
} satisfies Story;
function RecoverySpecimen() {
  const [failed, setFailed] = createSignal(true);
  return (
    <ApplicationFrame>
      <ApplicationPage
        brand="Amends"
        title={failed() ? "Unable to connect" : "Ready"}
        message={
          failed()
            ? "Try again when the host is available."
            : "The caller handled the retry action."
        }
      >
        <Button onClick={() => setFailed(false)}>Try again</Button>
      </ApplicationPage>
    </ApplicationFrame>
  );
}
export const CallerActions = {
  render: () => <RecoverySpecimen />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Try again" }));
    await expect(canvas.getByRole("heading", { name: "Ready" })).toBeVisible();
  },
} satisfies Story;
