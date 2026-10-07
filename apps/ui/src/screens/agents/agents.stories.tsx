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
const list = (element: HTMLElement) =>
  within(within(element).getByRole("list", { name: "Agents" }));
const main = (element: HTMLElement) => within(within(element).getByRole("main"));
const sidebar = (element: HTMLElement) =>
  within(within(element).getByRole("navigation", { name: "Workspace" }));
const addDialog = async (element: HTMLElement) =>
  within(await body(element).findByRole("dialog", { name: "Add agent" }));
/** Opens a Select by its label and chooses the option `option` names. */
const choose = async (
  element: HTMLElement,
  scope: ReturnType<typeof within>,
  label: string,
  option: RegExp | string,
) => {
  await userEvent.click(scope.getByRole("button", { name: new RegExp(`^${label}`) }));
  await userEvent.click(await body(element).findByRole("option", { name: option }));
};

/** Every agent, in the sidebar and the list, with the harness each runs on and its model. */
export const AllAgents = {
  render: () => <AgentsWorkspace />,
  play: async ({ canvasElement }) => {
    const nav = sidebar(canvasElement);
    await expect(nav.getByText("Agents")).toBeVisible();
    await expect(nav.getByRole("button", { name: "Add agent" })).toBeVisible();
    await expect(nav.getAllByRole("link", { name: /Reviewer|Planner|Researcher/ })).toHaveLength(3);
    const rows = list(canvasElement);
    await expect(rows.getAllByRole("link")).toHaveLength(5);
    const researcher = rows.getByRole("link", { name: /Researcher/ });
    await expect(researcher).toHaveTextContent("Auto");
    await expect(researcher).toHaveTextContent("Local models");
    await expect(rows.getByRole("link", { name: /Tester.*Needs setup/ })).toBeVisible();
  },
} satisfies Story;

/** The agents that can't run as they are set up. */
export const NeedsSetup = {
  render: () => <AgentsWorkspace tab="needs-setup" />,
  play: async ({ canvasElement }) => {
    const rows = list(canvasElement);
    await expect(rows.getAllByRole("link")).toHaveLength(2);
    await expect(rows.getByRole("link", { name: /Archivist/ })).toBeVisible();
  },
} satisfies Story;

/** An agent in a sandbox, on opencode, with its model's effort. */
export const AgentPage = {
  render: () => <AgentsWorkspace selected="reviewer" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await expect(page.queryByText("This agent can’t run as it is set up")).toBeNull();
    await expect(page.getByRole("combobox", { name: "Model" })).toHaveValue("claude-opus-5-5");
    await expect(page.getByRole("button", { name: /^Harness/ })).toHaveTextContent("opencode");
    await expect(page.getByRole("button", { name: /^Sandbox/ })).toHaveTextContent("Daytona");
    await expect(page.getByRole("button", { name: /^Effort/ })).toHaveTextContent("High");
    await expect(page.getByRole("button", { name: "Save setup" })).toBeDisabled();
  },
} satisfies Story;

/** Agents at work say where, their most pressing turn first; an idle agent's activity is blank. */
export const AgentsAtWork = {
  render: () => <AgentsWorkspace />,
  play: async ({ canvasElement }) => {
    const rows = list(canvasElement);
    const reviewer = rows.getByRole("link", { name: /Reviewer/ });
    await expect(reviewer).toHaveTextContent("Working");
    await expect(reviewer).toHaveTextContent("#general + 1 more");
    await expect(rows.getByRole("link", { name: /Planner/ })).toHaveTextContent("Stopping");
    await expect(rows.getByRole("link", { name: /Researcher/ })).not.toHaveTextContent(
      /Working|Queued|Stopping/,
    );
  },
} satisfies Story;

/** An agent's page lists each of its turns in progress, each opening its log. */
export const AgentAtWork = {
  render: () => <AgentsWorkspace selected="reviewer" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await expect(
      page.getByRole("link", { name: "Working in #general: open its log" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: "Queued in #design: open its log" })).toBeVisible();
  },
} satisfies Story;

/** An agent with no turn in progress is idle. */
export const AgentIdle = {
  render: () => <AgentsWorkspace selected="researcher" />,
  play: async ({ canvasElement }) => {
    await expect(main(canvasElement).getByText("Idle")).toBeVisible();
  },
} satisfies Story;

/** An agent whose sandbox connection was removed says so, and runs again in another sandbox. */
export const SandboxRemoved = {
  render: () => <AgentsWorkspace selected="tester" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await expect(page.getByText("This agent can’t run as it is set up")).toBeVisible();
    await expect(page.getByText("Its sandbox connection was removed.")).toBeVisible();
    await choose(canvasElement, page, "Sandbox", /Daytona/);
    await userEvent.click(page.getByRole("button", { name: "Save setup" }));
    await expect(await body(canvasElement).findByText("Setup saved")).toBeVisible();
    await waitFor(() =>
      expect(page.queryByText("This agent can’t run as it is set up")).toBeNull(),
    );
  },
} satisfies Story;

/** A model connection whose integration this host no longer installs. */
export const IntegrationNotInstalled = {
  render: () => <AgentsWorkspace selected="archivist" />,
  play: async ({ canvasElement }) => {
    await expect(
      main(canvasElement).getByText(
        "Its model connection’s integration isn’t installed on this host.",
      ),
    ).toBeVisible();
  },
} satisfies Story;

/** Moving an agent onto a harness that works only in a sandbox asks for one before saving. */
export const HarnessNeedsSandbox = {
  render: () => <AgentsWorkspace selected="planner" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await choose(canvasElement, page, "Harness", /opencode/);
    await expect(page.getByText("opencode works only in a sandbox. Choose one.")).toBeVisible();
    await userEvent.click(page.getByRole("button", { name: "Save setup" }));
    await expect(
      await page.findByText(
        "This setup can’t be saved as it is. Change what’s marked, then try again.",
      ),
    ).toBeVisible();
    await choose(canvasElement, page, "Sandbox", /This machine/);
    await expect(page.queryByText("opencode works only in a sandbox. Choose one.")).toBeNull();
    await userEvent.click(page.getByRole("button", { name: "Save setup" }));
    await expect(await body(canvasElement).findByText("Setup saved")).toBeVisible();
  },
} satisfies Story;

/** A connection that lists its models suggests them, and refuses one it doesn't list. */
export const ListedModels = {
  render: () => <AgentsWorkspace selected="planner" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    const model = page.getByRole("combobox", { name: "Model" });
    await userEvent.clear(model);
    await userEvent.type(model, "claude");
    await expect(
      await body(canvasElement).findByRole("option", { name: /Claude Sonnet 5.5/ }),
    ).toBeVisible();
    await userEvent.type(model, "-haiku{Escape}");
    await expect(page.getByText("This connection offers only the models it lists.")).toBeVisible();
  },
} satisfies Story;

/** A model that doesn't reason takes no effort. */
export const ModelWithoutEffort = {
  render: () => <AgentsWorkspace selected="planner" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    const model = page.getByRole("combobox", { name: "Model" });
    await userEvent.clear(model);
    await userEvent.type(model, "deepseek-v4{Escape}");
    await waitFor(() => expect(page.queryByRole("button", { name: /^Effort/ })).toBeNull());
  },
} satisfies Story;

/** While a connection's models load, and when they can't be read, any model's ID can be entered. */
export const ModelsLoading = {
  render: () => <AgentsWorkspace selected="planner" modelsStatus="loading" />,
  play: async ({ canvasElement }) => {
    await expect(main(canvasElement).getByText("Loading this connection’s models…")).toBeVisible();
  },
} satisfies Story;

export const ModelsFailed = {
  render: () => <AgentsWorkspace selected="planner" modelsStatus="failed" />,
  play: async ({ canvasElement }) => {
    await expect(
      main(canvasElement).getByText(
        "Its models couldn’t be loaded. You can still enter a model’s ID.",
      ),
    ).toBeVisible();
  },
} satisfies Story;

/** Adding an agent: its name and role, then its setup, created together. */
export const AddAgentFlow = {
  render: () => <AgentsWorkspace />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await userEvent.click(page.getByRole("button", { name: /Add agent/ }));
    const dialog = await addDialog(canvasElement);
    const create = dialog.getByRole("button", { name: "Create agent" });
    await expect(create).toBeDisabled();
    await userEvent.type(dialog.getByRole("textbox", { name: "Agent name" }), "Scout");
    await expect(dialog.getByRole("button", { name: /^Role/ })).toHaveTextContent("Member");
    await expect(dialog.getByRole("button", { name: /^Harness/ })).toHaveTextContent("Auto");
    await choose(canvasElement, dialog, "Model connection", /Local models/);
    await userEvent.type(dialog.getByRole("combobox", { name: "Model" }), "qwen3-coder-30b");
    await expect(dialog.getByText("Enter the ID of any model it serves.")).toBeVisible();
    await userEvent.click(create);
    await expect(await body(canvasElement).findByText("Scout created")).toBeVisible();
    await expect(await main(canvasElement).findByRole("heading", { name: /Scout/ })).toBeVisible();
  },
} satisfies Story;

/** Only the owner gives an agent the Administrator role. */
export const RoleOptions = {
  render: () => <AgentsWorkspace dialog="add" draft={{ name: "Scout" }} />,
  play: async ({ canvasElement }) => {
    const dialog = await addDialog(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: /^Role/ }));
    await expect(
      await body(canvasElement).findByRole("option", { name: /Administrator/ }),
    ).toHaveTextContent("Only the owner can give this role");
  },
} satisfies Story;

/** A connection no longer the reader's to use is refused beside its field; the draft stays. */
export const ConnectionUnavailable = {
  render: () => (
    <AgentsWorkspace
      dialog="add"
      draft={{ name: "Scout", modelConnectionId: "openrouter", model: "gpt-5-1" }}
      refuseCreate={{ action: "create", error: "unavailable", part: "model" }}
    />
  ),
  play: async ({ canvasElement }) => {
    const dialog = await addDialog(canvasElement);
    await userEvent.click(dialog.getByRole("button", { name: "Create agent" }));
    await expect(
      await dialog.findByText("This connection is no longer available to you. Choose another."),
    ).toBeVisible();
    await expect(dialog.getByRole("textbox", { name: "Agent name" })).toHaveValue("Scout");
  },
} satisfies Story;

/** On Auto with no harness it can run on, an agent can still be added, and waits for one. */
export const AutoWithoutHarness = {
  render: () => (
    <AgentsWorkspace
      dialog="add"
      withoutHarnesses
      draft={{ name: "Scout", modelConnectionId: "local-models", model: "qwen3-coder-30b" }}
    />
  ),
  play: async ({ canvasElement }) => {
    const dialog = await addDialog(canvasElement);
    await expect(
      dialog.getByText("No connection gives a harness yet. On Auto, the agent waits for one."),
    ).toBeVisible();
    await userEvent.click(dialog.getByRole("button", { name: "Create agent" }));
    await expect(await body(canvasElement).findByText("Scout created")).toBeVisible();
    const page = main(canvasElement);
    await expect(
      await page.findByText("No connection gives a harness it can run on."),
    ).toBeVisible();
  },
} satisfies Story;

export const RemoveAgent = {
  render: () => <AgentsWorkspace selected="planner" dialog="remove" />,
  play: async ({ canvasElement }) => {
    const dialog = within(
      await body(canvasElement).findByRole("dialog", { name: "Remove agent?" }),
    );
    await userEvent.click(dialog.getByRole("button", { name: "Remove agent" }));
    await expect(await body(canvasElement).findByText("Planner removed")).toBeVisible();
  },
} satisfies Story;

/** A rename made elsewhere meanwhile conflicts until the reader refreshes. */
export const RenamedMeanwhile = {
  render: () => <AgentsWorkspace selected="planner" conflict="rename" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    const name = page.getByRole("textbox", { name: "Agent name" });
    await userEvent.clear(name);
    await userEvent.type(name, "Planner · Studio");
    await userEvent.click(page.getByRole("button", { name: "Save name" }));
    await expect(
      await page.findByText(
        "This agent was renamed meanwhile. Refresh to review it, then save again.",
      ),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible();
  },
} satisfies Story;

/** A member reads agents and their setup, without adding, saving, or removing. */
export const ReadOnly = {
  render: () => <AgentsWorkspace selected="reviewer" readOnly />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement);
    await expect(page.getByRole("textbox", { name: "Agent name" })).toBeDisabled();
    for (const name of ["Save name", "Save setup", "Remove agent"])
      await expect(page.queryByRole("button", { name })).toBeNull();
    await expect(sidebar(canvasElement).queryByRole("button", { name: "Add agent" })).toBeNull();
  },
} satisfies Story;

export const NoMatchingAgents = {
  render: () => <AgentsWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = main(canvasElement);
    await userEvent.type(canvas.getByRole("searchbox"), "nobody");
    await expect(canvas.getByText("No agents match “nobody”.")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }));
    await expect(list(canvasElement).getAllByRole("link")).toHaveLength(5);
  },
} satisfies Story;

export const EmptyAgents = { render: () => <AgentsWorkspace empty /> } satisfies Story;

export const Loading = { render: () => <AgentsWorkspace status="loading" /> } satisfies Story;

export const LoadFailed = { render: () => <AgentsWorkspace status="failed" /> } satisfies Story;

export const Unavailable = {
  render: () => <AgentsWorkspace status="unavailable" />,
} satisfies Story;
