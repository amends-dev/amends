import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { AgentsWorkspace } from "./agents.fixture.tsx";

const meta = {
  title: "Screens/Agents",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

const body = (element: HTMLElement) => within(element.ownerDocument.body);
const details = (element: HTMLElement) =>
  within(element).findByLabelText("Agent details", { selector: "aside" });

/** The Lunacy "Agents / 01 / All agents" frame. */
export const AllAgents = { render: () => <AgentsWorkspace /> } satisfies Story;

/** The Lunacy "02 / Needs setup" frame: the agent whose connection needs its key. */
export const NeedsSetup = {
  render: () => <AgentsWorkspace tab="needs-setup" selected="review-helper" />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    await expect(
      panel.getByText("Anthropic · Backup needs an API key before this agent is ready."),
    ).toBeVisible();
    await expect(panel.getByRole("button", { name: "Open connection" })).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "03 / Overview" frame. */
export const Overview = { render: () => <AgentsWorkspace selected="atlas" /> } satisfies Story;

/** The Lunacy "04 / Configuration" frame. */
export const Configuration = {
  render: () => <AgentsWorkspace selected="atlas" detailsTab="configuration" />,
} satisfies Story;

/** The Lunacy "05 / Member overview" and "06 / Member configuration" frames. */
export const MemberReadOnly = {
  render: () => <AgentsWorkspace selected="atlas" readOnly />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: /Add/ })).toBeNull();
    const panel = within(await details(canvasElement));
    await expect(
      panel.getByText("You can view this agent. Ask an administrator to make changes."),
    ).toBeVisible();
    await expect(panel.queryByRole("button", { name: "Remove agent" })).toBeNull();
    await userEvent.click(panel.getByRole("button", { name: "Configuration" }));
    await expect(await panel.findByText("You can view this configuration.")).toBeVisible();
    await expect(panel.queryByRole("textbox")).toBeNull();
  },
} satisfies Story;

/** The Lunacy "07 / No agents yet" frame. */
export const NoAgentsYet = { render: () => <AgentsWorkspace noAgents /> } satisfies Story;

/** The Lunacy "08 / No model connection" frame. */
export const NoModelConnection = {
  render: () => <AgentsWorkspace noAgents noConnections />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("Connect a model first")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Create model connection" }));
    await expect(
      await body(canvasElement).findByRole("dialog", { name: "Create model connection" }),
    ).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "09 / Add agent" frame. */
export const AddAgentDialog = {
  name: "Add agent",
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout" }} />,
} satisfies Story;

/** The Lunacy "10 / Owner role options": Member by default, Administrator for the owner. */
export const OwnerRoleOptions = {
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout" }} />,
  play: async ({ canvasElement }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Add agent" }));
    await userEvent.click(dialog.getByRole("button", { name: /Workspace role/ }));
    await expect(
      await body(canvasElement).findByRole("option", { name: "Administrator" }),
    ).toBeVisible();
  },
} satisfies Story;

/** An administrator who is not the owner gives new agents Member only. */
export const AdministratorRole = {
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout" }} administrator />,
  play: async ({ canvasElement }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Add agent" }));
    await expect(dialog.getByRole("textbox", { name: "Workspace role" })).toHaveValue("Member");
  },
} satisfies Story;

/** The Lunacy "11 / Model connection options" frame. */
export const ModelConnectionOptions = {
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout" }} />,
  play: async ({ canvasElement }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Add agent" }));
    await userEvent.click(dialog.getByRole("button", { name: /Model connection/ }));
    await expect(
      await body(canvasElement).findByRole("option", { name: /Anthropic · Backup/ }),
    ).toHaveTextContent("Needs API key");
    await expect(
      body(canvasElement).getByRole("button", { name: "Create model connection" }),
    ).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "12 / Model suggestions" and "13 / Custom model identifier" frames. */
export const ModelSuggestions = {
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout" }} />,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    const dialog = within(await page.findByRole("dialog", { name: "Add agent" }));
    await userEvent.click(dialog.getByRole("button", { name: "Show suggestions" }));
    await expect(await page.findByRole("option", { name: /Claude Opus 5.5/ })).toBeVisible();
    const model = dialog.getByRole("combobox", { name: "Model" });
    await userEvent.clear(model);
    await userEvent.type(model, "my-model-alias");
    await expect(await page.findByRole("option", { name: /Use “my-model-alias”/ })).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "14 / Compatible environments" frame. */
export const CompatibleEnvironments = {
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout" }} />,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    const dialog = within(await page.findByRole("dialog", { name: "Add agent" }));
    await userEvent.click(dialog.getByRole("button", { name: /Environment/ }));
    await expect(await page.findByRole("option", { name: /Review sandbox/ })).toHaveTextContent(
      "Daytona account needs its API key.",
    );
  },
} satisfies Story;

/** The Lunacy "15 / Create while setup is pending" frame. */
export const CreateWhileSetupIsPending = {
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout", connectionId: "backup" }} />,
  play: async ({ canvasElement }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Add agent" }));
    await expect(
      dialog.getByText("You can create this agent now and add the key later."),
    ).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Create agent" })).toBeEnabled();
  },
} satisfies Story;

/**
 * The Lunacy "16" to "19" frames: creating a model connection from the draft, adding its key, and
 * returning with it chosen.
 */
export const ConnectionDetour = {
  render: () => <AgentsWorkspace dialog="add" add={{ name: "Scout" }} />,
  play: async ({ canvasElement }) => {
    const page = body(canvasElement);
    let dialog = within(await page.findByRole("dialog", { name: "Add agent" }));
    await userEvent.click(dialog.getByRole("button", { name: /Model connection/ }));
    await userEvent.click(await page.findByRole("button", { name: "Create model connection" }));
    const choose = within(await page.findByRole("dialog", { name: "Create model connection" }));
    await expect(choose.getByText("For Scout")).toBeVisible();
    await userEvent.click(choose.getByRole("button", { name: /Anthropic/ }));
    const configure = within(
      await page.findByRole("dialog", { name: "Configure model connection" }),
    );
    await expect(configure.getByText("Anthropic · For Scout · 1 of 2")).toBeVisible();
    await userEvent.click(configure.getByRole("button", { name: "Create & continue" }));
    const key = within(await page.findByRole("dialog", { name: "Add API key" }));
    await expect(key.getByText("Return to Scout with this connection selected.")).toBeVisible();
    await userEvent.type(key.getByLabelText("API key"), "sk-ant-key");
    await userEvent.click(key.getByRole("button", { name: "Save key & return" }));
    dialog = within(await page.findByRole("dialog", { name: "Add agent" }));
    await expect(dialog.getByRole("textbox", { name: "Name" })).toHaveValue("Scout");
    await expect(dialog.getByRole("button", { name: /Model connection/ })).toHaveTextContent(
      "Anthropic · Agents",
    );
    await userEvent.click(dialog.getByRole("button", { name: "Create agent" }));
    await waitFor(() => expect(page.queryByRole("dialog", { name: "Add agent" })).toBeNull());
    await expect(
      within(within(canvasElement).getByRole("list", { name: "Agents" })).getByRole("link", {
        name: /Scout/,
      }),
    ).toHaveAttribute("aria-current", "true");
  },
} satisfies Story;

/** The Lunacy "Remove Atlas?" modal. */
export const RemoveAgent = {
  render: () => <AgentsWorkspace selected="atlas" dialog="remove" />,
} satisfies Story;

/** The Lunacy "20" to "25" phone frames show these at 390px. */
export const ConfigureAndSave = {
  render: () => <AgentsWorkspace selected="nora" detailsTab="configuration" />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    const save = panel.getByRole("button", { name: "Save configuration" });
    await expect(save).toBeDisabled();
    await userEvent.type(panel.getByRole("textbox", { name: "Instructions" }), " Be brief.");
    await waitFor(() => expect(save).toBeEnabled());
    await userEvent.click(save);
    await expect(await within(canvasElement).findByText("Configuration saved")).toBeVisible();
  },
} satisfies Story;

/** The connection went away meanwhile: the save is refused at the field, the draft kept. */
export const ConnectionNoLongerAvailable = {
  render: () => <AgentsWorkspace selected="atlas" detailsTab="configuration" connectionGone />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    await userEvent.type(panel.getByRole("textbox", { name: "Instructions" }), " Be brief.");
    await userEvent.click(panel.getByRole("button", { name: "Save configuration" }));
    await expect(
      await panel.findByText(
        "This model connection is no longer available to you. Choose another connection.",
      ),
    ).toBeVisible();
    await expect(
      (panel.getByRole("textbox", { name: "Instructions" }) as HTMLTextAreaElement).value,
    ).toContain("Be brief.");
  },
} satisfies Story;

/** A saved reasoning level the harness no longer takes, with the way back to its default. */
export const UnsupportedReasoning = {
  render: () => <AgentsWorkspace selected="atlas" detailsTab="configuration" staleReasoning />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    await expect(panel.getByText("Saved reasoning: high")).toBeVisible();
    await userEvent.click(panel.getByRole("button", { name: "Use default reasoning" }));
    await waitFor(() =>
      expect(panel.getByRole("button", { name: "Save configuration" })).toBeEnabled(),
    );
  },
} satisfies Story;

/** Loading keeps the header and shows quiet rows, never an empty list. */
export const Loading = { render: () => <AgentsWorkspace status="loading" /> } satisfies Story;

export const LoadFailed = { render: () => <AgentsWorkspace status="failed" /> } satisfies Story;
