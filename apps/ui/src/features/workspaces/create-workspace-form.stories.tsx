import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, within } from "storybook/test";
import { createSignal } from "solid-js";
import { CreateWorkspaceForm } from "@amends/ui/features/workspaces";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Button } from "@amends/ui/primitives/button";
import "@amends/ui/foundations/typography/fonts";
function Specimen(props: { theme?: "cotton" | "soot"; narrow?: boolean }) {
  const [name, setName] = createSignal("");
  const [pending, setPending] = createSignal(false);
  const [error, setError] = createSignal<string>();
  const [submissions, setSubmissions] = createSignal(0);
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <div style={{ padding: "1.5rem", "max-width": props.narrow ? "16rem" : "26.25rem" }}>
        <CreateWorkspaceForm
          name={name()}
          onNameChange={(value) => {
            setName(value);
            setError(undefined);
          }}
          pending={pending()}
          requestError={error()}
          onSubmit={() => {
            setSubmissions((n) => n + 1);
            setPending(true);
            setError(undefined);
          }}
        />
        <Button
          variant="ghost"
          onClick={() => {
            setPending(false);
            setError("Unable to create the workspace. Try again.");
          }}
        >
          Simulate failure
        </Button>
        <output aria-label="Submissions">{submissions()}</output>
      </div>
    </ThemeProvider>
  );
}
const meta = {
  title: "Features/Workspaces/Create form",
  render: () => <Specimen />,
} satisfies Meta;
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
export const Narrow = { render: () => <Specimen narrow /> } satisfies Story;
export const Recovery = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox", { name: /Workspace name/ });
    await userEvent.type(input, "   ");
    await userEvent.click(canvas.getByRole("button", { name: "Create workspace" }));
    await expect(canvas.getByText("Enter a workspace name.")).toBeVisible();
    await userEvent.clear(input);
    await userEvent.type(input, "Studio");
    const submit = canvas.getByRole("button", { name: "Create workspace" });
    await userEvent.click(submit);
    await userEvent.click(submit);
    await expect(canvas.getByLabelText("Submissions")).toHaveTextContent("1");
    await expect(input).toHaveAttribute("readonly");
    await userEvent.click(canvas.getByRole("button", { name: "Simulate failure" }));
    await expect(input).toHaveValue("Studio");
    await expect(canvas.getByRole("alert")).toHaveTextContent("Unable to create");
    await userEvent.click(submit);
    await expect(canvas.getByLabelText("Submissions")).toHaveTextContent("2");
  },
} satisfies Story;
