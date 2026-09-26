import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal, Show } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountMenu } from "@amends/ui/features/account";
import { ThemeChoice, type ThemePreference } from "@amends/ui/features/appearance";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Divider } from "@amends/ui/primitives/divider";
import "@amends/ui/foundations/typography/fonts";
function Specimen(props: {
  theme?: "cotton" | "soot";
  open?: boolean;
  long?: boolean;
  /** Inside a workspace, where the reader chose what people call them. */
  named?: boolean;
}) {
  const [preference, setPreference] = createSignal<ThemePreference>("system");
  const [signedOut, setSignedOut] = createSignal(false);
  const [renaming, setRenaming] = createSignal(false);
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <div style={{ padding: "2rem", "min-height": "32rem" }}>
        <AccountMenu.Root defaultOpen={props.open}>
          <AccountMenu.Trigger
            label={props.named ? "Your account: Jo Mercer" : "Your account"}
            initials="JM"
          />
          <AccountMenu.Content>
            <AccountMenu.Identity
              identifier={
                props.long
                  ? "a.very.long.account.identifier@an-example-organisation.com"
                  : "jo@acme.test"
              }
              initials="JM"
              name={props.named ? "Jo Mercer" : undefined}
            />
            <Divider.Line />
            <ThemeChoice value={preference()} onValueChange={setPreference} />
            <Divider.Line />
            <AccountMenu.Actions>
              <AccountMenu.Link href="#workspaces">Switch workspace</AccountMenu.Link>
              <AccountMenu.Link href="#settings">Settings</AccountMenu.Link>
              <Show when={props.named}>
                <AccountMenu.Action onClick={() => setRenaming(true)}>
                  Change your name
                </AccountMenu.Action>
              </Show>
              <AccountMenu.SignOut onClick={() => setSignedOut(true)} />
            </AccountMenu.Actions>
          </AccountMenu.Content>
        </AccountMenu.Root>
        <output aria-label="Signed out">{signedOut() ? "yes" : "no"}</output>
        <Show when={props.named}>
          <output aria-label="Renaming">{renaming() ? "yes" : "no"}</output>
        </Show>
      </div>
    </ThemeProvider>
  );
}
const meta = { title: "Features/Account menu", render: () => <Specimen /> } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
export const Open = { render: () => <Specimen open /> } satisfies Story;
export const Soot = { render: () => <Specimen theme="soot" open /> } satisfies Story;
export const LongIdentity = { render: () => <Specimen open long /> } satisfies Story;
export const Named = { render: () => <Specimen open named /> } satisfies Story;
export const NamedAction = {
  render: () => <Specimen named />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Your account: Jo Mercer" });
    await userEvent.click(trigger);
    // The name leads, with the identity the reader signs in as beneath it.
    const panel = await page.findByRole("dialog", { name: "Jo Mercer" });
    await expect(panel).toHaveTextContent("jo@acme.test");
    await userEvent.click(within(panel).getByRole("button", { name: "Change your name" }));
    // The menu closes as the action starts, leaving room for what it opens, and focus returns to
    // the trigger, where a dialog the action opens hands it back.
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
    await expect(canvas.getByLabelText("Renaming")).toHaveTextContent("yes");
  },
} satisfies Story;
export const Interaction = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement),
      page = within(canvasElement.ownerDocument.body);
    const trigger = canvas.getByRole("button", { name: "Your account" });
    await userEvent.click(trigger);
    const panel = await page.findByRole("dialog", { name: "jo@acme.test" });
    await userEvent.click(within(panel).getByText("Soot"));
    await expect(within(panel).getByRole("radio", { name: "Soot" })).toBeChecked();
    await expect(panel).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(page.queryByRole("dialog")).not.toBeInTheDocument());
    await expect(trigger).toHaveFocus();
    await userEvent.click(trigger);
    await userEvent.click(await page.findByRole("button", { name: "Sign out" }));
    await expect(canvas.getByLabelText("Signed out")).toHaveTextContent("yes");
  },
} satisfies Story;
