import "@amends/ui/foundations/typography/fonts";
import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, within } from "storybook/test";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Container } from "@amends/ui/primitives/layout";
import { WorkspaceNameForm } from "./index.ts";
function Specimen(props: { theme?: "cotton" | "soot"; pending?: boolean }) {
  const [name, setName] = createSignal("Mercier & Co"),
    [saved, setSaved] = createSignal("");
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <Container maxWidth="30rem">
        <WorkspaceNameForm
          name={name()}
          onNameChange={setName}
          onSubmit={setSaved}
          pending={props.pending}
        />
        <output aria-label="Saved name">{saved()}</output>
      </Container>
    </ThemeProvider>
  );
}
const meta = { title: "Features/Workspace name form", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Comparison = {
  render: () => (
    <>
      <Specimen />
      <Specimen theme="soot" />
    </>
  ),
} satisfies Story;
export const Pending = { render: () => <Specimen pending /> } satisfies Story;
export const Submission = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: "Workspace name" });
    await userEvent.clear(input);
    await userEvent.type(input, "Studio");
    await userEvent.click(canvas.getByRole("button", { name: "Save name" }));
    await expect(canvas.getByLabelText("Saved name")).toHaveTextContent("Studio");
  },
} satisfies Story;
