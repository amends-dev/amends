import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { Drawer } from "@amends/frontend/compositions/drawer";
import { Column } from "@amends/frontend/primitives/layout";
import { Button } from "@amends/frontend/primitives/button";
import { Input } from "@amends/frontend/primitives/input";
import { Select } from "@amends/frontend/primitives/select";
import { Field } from "@amends/frontend/compositions/field";
import { colorThemes } from "@amends/frontend/foundations/color/styles";
import "@amends/frontend/foundations/typography/fonts";
function Done() {
  const drawer = Drawer.useDrawer();
  return (
    <Button variant="secondary" onClick={drawer.close}>
      Done
    </Button>
  );
}
const meta = {
  title: "Compositions/Drawer",
  parameters: { layout: "fullscreen" as const },
  tags: ["autodocs"],
  render: () => (
    <main class={colorThemes.cotton} style={{ padding: "1.5rem", "min-height": "100vh" }}>
      <Drawer.Root>
        <Drawer.Trigger>Open drawer</Drawer.Trigger>
        <Drawer.Content>
          <Drawer.Header>
            <Drawer.Title>Workspace details</Drawer.Title>
            <Drawer.Close />
          </Drawer.Header>
          <Drawer.Body>
            <Column gap={4}>
              <Drawer.Description>
                Fields and nested popups stay inside this modal.
              </Drawer.Description>
              <Field label="Name">{(control) => <Input {...control} />}</Field>
              <Field label="Role">
                {(control) => (
                  <Select
                    {...control}
                    options={[
                      { value: "viewer", label: "Viewer" },
                      { value: "member", label: "Member" },
                    ]}
                    defaultValue="viewer"
                  />
                )}
              </Field>
            </Column>
          </Drawer.Body>
          <Drawer.Footer>
            <Done />
          </Drawer.Footer>
        </Drawer.Content>
      </Drawer.Root>
    </main>
  ),
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Playground = {} satisfies Story;
export const Open = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Open drawer" }));
    await expect(
      within(canvasElement).getByRole("dialog", { name: "Workspace details" }),
    ).toBeVisible();
  },
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      trigger = canvas.getByRole("button", { name: "Open drawer" });
    await userEvent.click(trigger);
    const dialog = canvas.getByRole("dialog", { name: "Workspace details" });
    const name = within(dialog).getByRole("textbox", { name: "Name" });
    await userEvent.type(name, "Keep this draft");
    await userEvent.click(within(dialog).getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await expect(canvas.getByRole("textbox", { name: "Name" })).toBe(name);
    await expect(name).toHaveValue("Keep this draft");
    await userEvent.click(canvas.getByRole("button", { name: "Close drawer" }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
  },
} satisfies Story;
