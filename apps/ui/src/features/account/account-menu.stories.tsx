import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { createSignal } from "solid-js";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AccountMenu } from "@amends/ui/features/account";
import { ThemeChoice, type ThemePreference } from "@amends/ui/features/appearance";
import { ThemeProvider } from "@amends/ui/foundations/theme";
import { Divider } from "@amends/ui/primitives/divider";
import "@amends/ui/foundations/typography/fonts";
function Specimen(props: { theme?: "cotton" | "soot"; open?: boolean; long?: boolean }) {
  const [preference, setPreference] = createSignal<ThemePreference>("system");
  const [signedOut, setSignedOut] = createSignal(false);
  return (
    <ThemeProvider theme={props.theme ?? "cotton"}>
      <div style={{ padding: "2rem", "min-height": "32rem" }}>
        <AccountMenu.Root defaultOpen={props.open}>
          <AccountMenu.Trigger label="Your account" initials="JM" />
          <AccountMenu.Content>
            <AccountMenu.Identity
              identifier={
                props.long
                  ? "a.very.long.account.identifier@an-example-organisation.com"
                  : "jo@acme.test"
              }
              initials="JM"
            />
            <Divider.Line />
            <ThemeChoice value={preference()} onValueChange={setPreference} />
            <Divider.Line />
            <AccountMenu.Actions>
              <AccountMenu.Link href="#workspaces">Switch workspace</AccountMenu.Link>
              <AccountMenu.Link href="#settings">Settings</AccountMenu.Link>
              <AccountMenu.SignOut onClick={() => setSignedOut(true)} />
            </AccountMenu.Actions>
          </AccountMenu.Content>
        </AccountMenu.Root>
        <output aria-label="Signed out">{signedOut() ? "yes" : "no"}</output>
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
