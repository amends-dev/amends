import type { Meta, StoryObj } from "storybook-solidjs-vite";
import { expect, userEvent, waitFor, within } from "storybook/test";
import { ConnectionsWorkspace } from "./connections.fixture.tsx";

const meta = {
  title: "Screens/Connections",
  parameters: { layout: "fullscreen" as const },
} satisfies Meta;
export default meta;
type Story = StoryObj;

const body = (element: HTMLElement) => within(element.ownerDocument.body);
const list = (element: HTMLElement) =>
  within(within(element).getByRole("list", { name: "Connections" }));
const details = async (element: HTMLElement) => within(element).getByRole("main");
const sidebar = (element: HTMLElement) =>
  within(within(element).getByRole("navigation", { name: "Workspace" }));

/** The Lunacy "Connections / 01 / All connections" frame. */
export const AllConnections = {
  render: () => <ConnectionsWorkspace />,
  play: async ({ canvasElement }) => {
    const nav = sidebar(canvasElement);
    await expect(nav.getByText("Model providers")).toBeVisible();
    await expect(nav.getByText("Sandbox accounts")).toBeVisible();
    await expect(nav.getByRole("button", { name: "Add model provider" })).toBeVisible();
    await expect(nav.getByRole("button", { name: "Add sandbox account" })).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "02 / Configured connection" frame. */
export const ConfiguredConnection = {
  render: () => <ConnectionsWorkspace selected="anthropic-team" />,
} satisfies Story;

/** The Lunacy "03 / Needs setup" frame. */
export const NeedsSetup = {
  render: () => <ConnectionsWorkspace selected="local" />,
} satisfies Story;

/** The Lunacy "04 / Choose provider" frame. */
export const ChooseProvider = {
  render: () => <ConnectionsWorkspace dialog="choose" />,
} satisfies Story;

/** The Lunacy "05 / Configure Anthropic" frame. */
export const ConfigureAnthropic = {
  render: () => (
    <ConnectionsWorkspace
      dialog="configure"
      provider="anthropic"
      draft={{ name: "Anthropic · Research" }}
    />
  ),
} satisfies Story;

/** The Lunacy "06 / Configure without authentication" frame. */
export const ConfigureWithoutAuthentication = {
  render: () => (
    <ConnectionsWorkspace
      dialog="configure"
      provider="openai-compatible"
      method="none"
      draft={{ name: "Local sandbox", value: "http://127.0.0.1:11434/v1" }}
    />
  ),
} satisfies Story;

/** The Lunacy "07 / Add API key" frame. */
export const AddApiKey = {
  render: () => (
    <ConnectionsWorkspace
      selected="local"
      dialog="key"
      keyMode="setup"
      draft={{ secret: "sk-local-development-key" }}
    />
  ),
} satisfies Story;

/** The Lunacy "08 / Credential storage unavailable" frame: saving the key fails. */
export const CredentialStorageUnavailable = {
  render: () => (
    <ConnectionsWorkspace
      selected="local"
      dialog="key"
      keyMode="setup"
      noKeyStorage
      draft={{ secret: "sk-local-development-key" }}
    />
  ),
  play: async ({ canvasElement }) => {
    const dialog = await body(canvasElement).findByRole("dialog", { name: "Add API key" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Save key" }));
    await expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "API key wasn’t saved",
    );
    await expect(within(dialog).getByRole("button", { name: "Try again" })).toBeEnabled();
  },
} satisfies Story;

/** The Lunacy "09 / Replace API key" frame. */
export const ReplaceApiKey = {
  render: () => (
    <ConnectionsWorkspace
      selected="anthropic-team"
      dialog="key"
      keyMode="replace"
      draft={{ secret: "sk-ant-new-team-key" }}
    />
  ),
} satisfies Story;

/** The Lunacy "10 / Empty connections" frame. */
export const EmptyConnections = { render: () => <ConnectionsWorkspace empty /> } satisfies Story;

/** The Lunacy "11 / Provider unavailable" frame. */
export const ProviderUnavailable = {
  render: () => <ConnectionsWorkspace selected="anthropic-team" anthropicMissing />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    await expect(panel.getByText("Provider unavailable")).toBeVisible();
    await expect(panel.queryByRole("button", { name: "Replace key" })).toBeNull();
    await expect(panel.getByRole("button", { name: "Remove key" })).toBeEnabled();
    await expect(panel.getByRole("button", { name: "Save name" })).toBeVisible();
  },
} satisfies Story;

/** The Lunacy "Remove connection?" modal. */
export const RemoveConnection = {
  render: () => <ConnectionsWorkspace selected="anthropic-team" dialog="remove" />,
} satisfies Story;

/** The Lunacy "Remove API key?" modal. */
export const RemoveApiKey = {
  render: () => <ConnectionsWorkspace selected="anthropic-team" dialog="remove-key" />,
} satisfies Story;

/** Loading keeps the header and shows quiet rows, never an empty list. */
export const Loading = { render: () => <ConnectionsWorkspace status="loading" /> } satisfies Story;

export const LoadFailed = {
  render: () => <ConnectionsWorkspace status="failed" />,
} satisfies Story;

/** A member sees setup and endpoints, without adding, editing, or key actions. */
export const ReadOnly = {
  render: () => <ConnectionsWorkspace selected="anthropic-team" readOnly />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(sidebar(canvasElement).queryByRole("button", { name: /Add/ })).toBeNull();
    const panel = within(await details(canvasElement));
    for (const name of ["Save name", "Save settings", "Replace key", "Remove key"])
      await expect(panel.queryByRole("button", { name })).toBeNull();
    await expect(canvas.queryByRole("button", { name: "Remove connection" })).toBeNull();
    await expect(panel.getByRole("textbox", { name: "Connection name" })).toBeDisabled();
  },
} satisfies Story;

/**
 * The two-step flow: choose Anthropic, name it, create it without its key, then save the key,
 * which leaves it Configured and says so in a toast (the Lunacy "12 / API key saved" frame).
 */
export const AddConnectionFlow = {
  render: () => <ConnectionsWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /Add connection/ }));
    const chooser = await body(canvasElement).findByRole("dialog", { name: "Add connection" });
    await userEvent.click(within(chooser).getByRole("button", { name: /Anthropic/ }));
    const configure = await body(canvasElement).findByRole("dialog", {
      name: "Configure connection",
    });
    const name = within(configure).getByRole("textbox", { name: "Connection name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Anthropic · Research");
    const url = within(configure).getByRole("textbox", { name: "API URL · Optional" });
    await userEvent.type(url, "not-a-url");
    await expect(within(configure).getByText("Enter an http or https URL.")).toBeVisible();
    const create = within(configure).getByRole("button", { name: "Create & continue" });
    await expect(create).toBeDisabled();
    await userEvent.clear(url);
    await userEvent.click(create);
    const key = await body(canvasElement).findByRole("dialog", { name: "Add API key" });
    await expect(within(key).getByText("Anthropic · Research · Step 2 of 2")).toBeVisible();
    await userEvent.type(within(key).getByLabelText("API key"), "sk-ant-research");
    await userEvent.click(within(key).getByRole("button", { name: "Save key" }));
    await waitFor(() =>
      expect(body(canvasElement).queryByRole("dialog", { name: "Add API key" })).toBeNull(),
    );
    await waitFor(() =>
      expect(
        canvas.getAllByRole("status").some((toast) => toast.textContent?.includes("API key saved")),
      ).toBe(true),
    );
    await expect(canvas.getByRole("heading", { name: "Anthropic · Research" })).toBeVisible();
    await expect(within(canvas.getByRole("main")).getByText("Configured")).toBeVisible();
    await expect(
      sidebar(canvasElement).getByRole("link", { name: /Anthropic · Research/ }),
    ).toHaveAttribute("aria-current", "page");
  },
} satisfies Story;

/** Searching keeps the text; a search that finds nothing offers to clear it. */
export const NoMatchingConnections = {
  render: () => <ConnectionsWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox"), "vertex");
    await expect(canvas.getByText("No connections match “vertex”.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(list(canvasElement).getAllByRole("link")).toHaveLength(3);
  },
} satisfies Story;

/** A rename made elsewhere meanwhile: the draft stays, with Refresh to review it. */
export const RenamedMeanwhile = {
  render: () => <ConnectionsWorkspace selected="anthropic-team" conflict="rename" />,
  play: async ({ canvasElement }) => {
    const panel = within(await details(canvasElement));
    const name = panel.getByRole("textbox", { name: "Connection name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Anthropic · Studio");
    await userEvent.click(panel.getByRole("button", { name: "Save name" }));
    await expect(await panel.findByRole("alert")).toHaveTextContent(
      "This connection was renamed meanwhile.",
    );
    await expect(name).toHaveValue("Anthropic · Studio");
    await expect(panel.getByRole("button", { name: "Refresh" })).toBeVisible();
  },
} satisfies Story;
