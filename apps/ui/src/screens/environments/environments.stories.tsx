import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { EnvironmentsWorkspace } from "./environments.fixture.tsx";

const meta = {
  title: "Screens/Environments",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

const body = (element: HTMLElement) => within(element.ownerDocument.body);
const details = async (element: HTMLElement) => within(element).getByRole("main");
const sidebar = (element: HTMLElement) =>
  within(within(element).getByRole("navigation", { name: "Workspace" }));

/** The Lunacy "Environments / 01 / All environments" frame. */
export const AllEnvironments = {
  render: () => <EnvironmentsWorkspace />,
  play: async ({ canvasElement }) => {
    const nav = sidebar(canvasElement);
    await expect(nav.getByRole("link", { name: "Environments" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    await expect(nav.getByRole("button", { name: "Add environment" })).toBeVisible();
    await userEvent.click(nav.getByRole("link", { name: /Remote development/ }));
    await expect(
      within(canvasElement).getByRole("heading", { name: "Remote development" }),
    ).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "02 / Environment overview" frame. */
export const EnvironmentOverview = {
  render: () => <EnvironmentsWorkspace selected="remote" />,
} satisfies Story;

/** The Lunacy "03 / Sandbox settings upper" and "04 / lower" frames. */
export const SandboxSettings = {
  render: () => <EnvironmentsWorkspace selected="remote" environmentTab="sandbox" />,
} satisfies Story;

/** The Lunacy "05 / Add without sandbox" frame. */
export const AddWithoutSandbox = {
  render: () => <EnvironmentsWorkspace dialog="add" add={{ name: "Quick replies" }} />,
} satisfies Story;

/** The Lunacy "06 / Add with Daytona" frame. */
export const AddWithDaytona = {
  render: () => (
    <EnvironmentsWorkspace dialog="add" add={{ name: "Release sandbox", providerId: "daytona" }} />
  ),
} satisfies Story;

/** The Lunacy "07 / Add Daytona settings upper" and "08 / lower" frames. */
export const AddDaytonaSettings = {
  render: () => (
    <EnvironmentsWorkspace
      dialog="add"
      add={{ name: "Release sandbox", providerId: "daytona", step: "sandbox" }}
    />
  ),
} satisfies Story;

/** The Lunacy "09 / Local directory settings" frame. */
export const LocalDirectorySettings = {
  render: () => (
    <EnvironmentsWorkspace
      dialog="add"
      add={{ name: "Release sandbox", providerId: "local", step: "sandbox" }}
    />
  ),
} satisfies Story;

/** The Lunacy "10 / Daytona account options" frame: each account with its state. */
export const DaytonaAccountOptions = {
  render: () => (
    <EnvironmentsWorkspace
      dialog="add"
      add={{ name: "Release sandbox", providerId: "daytona", step: "sandbox" }}
    />
  ),
  play: async ({ canvasElement }) => {
    const dialog = await body(canvasElement).findByRole("dialog", { name: "Add environment" });
    await userEvent.click(within(dialog).getByRole("button", { name: /Daytona account/ }));
    await expect(
      await body(canvasElement).findByRole("option", { name: /Daytona · Backup/ }),
    ).toHaveTextContent("Needs API key · Can finish setup later");
    await expect(
      body(canvasElement).getByRole("button", { name: "Create Daytona connection" }),
    ).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "11 / No Daytona accounts" frame. */
export const NoDaytonaAccounts = {
  render: () => (
    <EnvironmentsWorkspace
      dialog="add"
      noAccounts
      add={{ name: "Release sandbox", providerId: "daytona", step: "sandbox" }}
    />
  ),
  play: async ({ canvasElement }) => {
    const dialog = await body(canvasElement).findByRole("dialog", { name: "Add environment" });
    await expect(within(dialog).getByText("No Daytona connections yet")).toBeVisible();
    await expect(within(dialog).getByRole("button", { name: "Create environment" })).toBeDisabled();
  },
} satisfies Story;

/** The Lunacy "12 / Create Daytona account" frame. */
export const CreateDaytonaAccount = {
  render: () => <EnvironmentsWorkspace dialog="create-account" add={{ name: "Release sandbox" }} />,
} satisfies Story;

/** The Lunacy "13 / Add Daytona key and return" frame. */
export const AddDaytonaKey = {
  render: () => <EnvironmentsWorkspace dialog="account-key" add={{ name: "Release sandbox" }} />,
} satisfies Story;

/** The Lunacy "15 / No sandbox details" frame: only an Overview, created with the workspace. */
export const NoSandboxDetails = {
  render: () => <EnvironmentsWorkspace selected="in-process" />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    await expect(panel.queryByRole("link", { name: "Sandbox" })).toBeNull();
    await expect(panel.getByText("Created with this workspace")).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "16 / Member read-only settings" frame. */
export const MemberReadOnly = {
  render: () => <EnvironmentsWorkspace selected="remote" environmentTab="sandbox" readOnly />,
  play: async ({ canvasElement }) => {
    await expect(sidebar(canvasElement).queryByRole("button", { name: /Add/ })).toBeNull();
    const panel = within(await details(canvasElement));
    await expect(
      panel.getByText("You can view these settings. Ask an administrator to change them."),
    ).toBeVisible();
    await expect(panel.queryByRole("button", { name: "Save sandbox settings" })).toBeNull();
    await expect(panel.queryByRole("textbox")).toBeNull();
  },
} satisfies Story;

/** The Lunacy "17 / Account needs key" frame. */
export const AccountNeedsKey = {
  render: () => <EnvironmentsWorkspace selected="review" />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    await expect(
      panel.getByText("Daytona · Backup needs an API key. Add it to make this environment ready."),
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: "Open connection" })).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "Remove environment?" modal. */
export const RemoveEnvironment = {
  render: () => <EnvironmentsWorkspace selected="remote" dialog="remove" />,
} satisfies Story;

/** Loading keeps the header and shows quiet rows, never an empty list. */
export const Loading = { render: () => <EnvironmentsWorkspace status="loading" /> } satisfies Story;

export const LoadFailed = {
  render: () => <EnvironmentsWorkspace status="failed" />,
} satisfies Story;

/**
 * Adding a Daytona environment without an account: the account detour creates the connection and
 * its key, then returns to the draft with the new account chosen (the Lunacy "14" frame).
 */
export const AddWithAccountDetour = {
  render: () => <EnvironmentsWorkspace noAccounts />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const page = body(canvasElement);
    await userEvent.click(sidebar(canvasElement).getByRole("button", { name: "Add environment" }));
    let dialog = await page.findByRole("dialog", { name: "Add environment" });
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Environment name" }),
      "Release sandbox",
    );
    await userEvent.click(within(dialog).getByRole("radio", { name: /Daytona/ }));
    await userEvent.click(within(dialog).getByRole("button", { name: "Continue" }));
    await userEvent.type(
      within(dialog).getByRole("textbox", { name: "Snapshot · Optional" }),
      "amends-dev-base",
    );
    await userEvent.click(
      within(dialog).getByRole("button", { name: "Create Daytona connection" }),
    );
    const create = await page.findByRole("dialog", { name: "Create Daytona connection" });
    await expect(within(create).getByText("For Release sandbox · 1 of 2")).toBeVisible();
    await userEvent.click(within(create).getByRole("button", { name: "Create & continue" }));
    const key = await page.findByRole("dialog", { name: "Add API key" });
    await userEvent.type(within(key).getByLabelText("API key"), "dtn-key");
    await userEvent.click(within(key).getByRole("button", { name: "Save key & return" }));
    dialog = await page.findByRole("dialog", { name: "Add environment" });
    // The draft kept its snapshot, and the new account is chosen.
    await expect(within(dialog).getByRole("textbox", { name: "Snapshot · Optional" })).toHaveValue(
      "amends-dev-base",
    );
    await expect(within(dialog).getByRole("button", { name: /Daytona account/ })).toHaveTextContent(
      "Daytona · Builds",
    );
    await expect(within(dialog).getByText("Sandbox account · Configured")).toBeVisible();
    await userEvent.click(within(dialog).getByRole("button", { name: "Create environment" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Add environment" })).toBeNull());
    await expect(canvas.getByRole("heading", { name: "Release sandbox" })).toBeVisible();
    await expect(
      sidebar(canvasElement).getByRole("link", { name: /Release sandbox/ }),
    ).toHaveAttribute("aria-current", "page");
  },
} satisfies Story;

/** Variables refuse invalid and repeated names; commands move and are removed from their menu. */
export const EditSandboxSettings = {
  render: () => <EnvironmentsWorkspace selected="local" environmentTab="sandbox" />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    const save = panel.getByRole("button", { name: "Save sandbox settings" });
    await expect(save).toBeDisabled();
    await userEvent.click(panel.getByRole("button", { name: "Add variable" }));
    await userEvent.type(panel.getByRole("textbox", { name: "Variable 3 name" }), "NODE_ENV");
    await expect(panel.getByText("This variable is already set above.")).toBeVisible();
    await expect(save).toBeDisabled();
    await userEvent.clear(panel.getByRole("textbox", { name: "Variable 3 name" }));
    await userEvent.type(panel.getByRole("textbox", { name: "Variable 3 name" }), "9LIVES");
    await expect(
      panel.getByText("Use letters, digits, and underscores, not starting with a digit."),
    ).toBeVisible();
    await userEvent.click(panel.getByRole("button", { name: "Remove variable 9LIVES" }));
    await userEvent.click(panel.getByRole("button", { name: "Command 2 options" }));
    await userEvent.click(await body(canvasElement).findByRole("menuitem", { name: "Move up" }));
    await waitFor(() =>
      expect(panel.getByRole("textbox", { name: "Command 1" })).toHaveValue("bun install"),
    );
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await expect(await within(canvasElement).findByText("Sandbox settings saved")).toBeVisible();
  },
} satisfies Story;

/** The account went away meanwhile: the save is refused beside the account field, draft kept. */
export const AccountNoLongerAvailable = {
  render: () => <EnvironmentsWorkspace selected="remote" environmentTab="sandbox" accountGone />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    await userEvent.click(panel.getByRole("radio", { name: /Destroy sandbox/ }));
    await userEvent.click(panel.getByRole("button", { name: "Save sandbox settings" }));
    await expect(
      await panel.findByText(
        "This account is no longer available to you. Choose another Daytona connection.",
      ),
    ).toBeVisible();
    await expect(panel.getByRole("radio", { name: /Destroy sandbox/ })).toBeChecked();
  },
} satisfies Story;
