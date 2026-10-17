import type { Meta, StoryObj } from "storybook-solidjs-vite"
import { expect, userEvent, waitFor, within } from "storybook/test"
import { ConnectionsWorkspace } from "./connections.fixture.tsx"

const meta = {
  title: "Screens/Connections",
  parameters: { layout: "fullscreen" as const }
} satisfies Meta
export default meta
type Story = StoryObj

const body = (element: HTMLElement) => within(element.ownerDocument.body)
const list = (element: HTMLElement) => within(within(element).getByRole("list", { name: "Connections" }))
const main = (element: HTMLElement) => within(within(element).getByRole("main"))
const sidebar = (element: HTMLElement) => within(within(element).getByRole("navigation", { name: "Workspace" }))

/**
 * Every connection, with Models, Tools, Sandboxes, and Harnesses in the sidebar; one whose
 * integration is gone shows only in the list.
 */
export const AllConnections = {
  render: () => <ConnectionsWorkspace />,
  play: async ({ canvasElement }) => {
    const nav = sidebar(canvasElement)
    for (const title of ["Models", "Tools", "Sandboxes", "Harnesses"]) await expect(nav.getByText(title)).toBeVisible()
    await expect(nav.getByRole("button", { name: "Add tool connection" })).toBeVisible()
    await expect(nav.queryByRole("link", { name: /Vertex/ })).toBeNull()
    const vertex = list(canvasElement).getByRole("link", { name: /Vertex · Research/ })
    await expect(vertex).toHaveTextContent("Unavailable")
    await expect(vertex).toHaveTextContent("Integration not installed")
  }
} satisfies Story

/** One capability's connections, as its sidebar section's Browse opens them. */
export const ToolConnections = {
  render: () => <ConnectionsWorkspace tab="tools" />,
  play: async ({ canvasElement }) => {
    await expect(list(canvasElement).getAllByRole("link")).toHaveLength(2)
  }
} satisfies Story

/** A model provider's connection: no settings, a saved key, and a check. */
export const ConnectionPage = {
  render: () => <ConnectionsWorkspace selected="openrouter" />
} satisfies Story

/** Checking a connection whose system refuses its key says so in place. */
export const KeyRefused = {
  render: () => <ConnectionsWorkspace selected="search-tools" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement)
    await userEvent.click(page.getByRole("button", { name: "Check connection" }))
    await expect(await page.findByText("Key refused")).toBeVisible()
    await expect(page.getByText("The server refused the key (401).")).toBeVisible()
    await expect(page.getByRole("button", { name: "Check again" })).toBeEnabled()
  }
} satisfies Story

/** An integration that refuses the connection's setup says why, and offers no check. */
export const SetupRefused = {
  render: () => <ConnectionsWorkspace selected="docs-api" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement)
    await expect(page.getByText("HTTP API refuses this setup")).toBeVisible()
    await expect(page.queryByRole("button", { name: "Check connection" })).toBeNull()
  }
} satisfies Story

/** A connection whose integration this host no longer installs can only be removed. */
export const IntegrationNotInstalled = {
  render: () => <ConnectionsWorkspace selected="vertex" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement)
    await expect(page.getByText("Its integration isn’t installed on this host")).toBeVisible()
    await expect(page.getByText("mercier-research")).toBeVisible()
    await expect(page.queryByRole("textbox", { name: /project/ })).toBeNull()
    for (const name of ["Check connection", "Save settings", "Replace key"])
      await expect(page.queryByRole("button", { name })).toBeNull()
    await expect(page.getByRole("button", { name: "Remove connection" })).toBeEnabled()
  }
} satisfies Story

/** Choosing an integration, narrowed by a search, since a host installs many model providers. */
export const ChooseIntegration = {
  render: () => <ConnectionsWorkspace dialog="choose" />,
  play: async ({ canvasElement }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Add connection" }))
    await userEvent.type(dialog.getByRole("searchbox", { name: "Search integrations" }), "gr")
    const integrations = within(dialog.getByRole("list", { name: "Integrations" }))
    await expect(integrations.getAllByRole("button")).toHaveLength(1)
    await expect(integrations.getByRole("button", { name: /Groq/ })).toBeVisible()
    await userEvent.type(dialog.getByRole("searchbox"), "zz")
    await expect(dialog.getByText("No integrations match “grzz”.")).toBeVisible()
  }
} satisfies Story

/** Add from the Tools section offers only the integrations that give tools. */
export const ChooseToolIntegration = {
  render: () => <ConnectionsWorkspace dialog="choose" capability="tools" />
} satisfies Story

/** An MCP server's settings from its form, with how it authenticates and its key. */
export const ConfigureMcpServer = {
  render: () => (
    <ConnectionsWorkspace
      dialog="configure"
      integration="mcp"
      draft={{ name: "Search tools", settings: { url: "https://search.example.com/mcp" } }}
    />
  )
} satisfies Story

/** Without authentication there is no key to enter. */
export const ConfigureWithoutAuthentication = {
  render: () => (
    <ConnectionsWorkspace
      dialog="configure"
      integration="openai-compatible"
      auth="none"
      draft={{ name: "Local models", settings: { url: "http://127.0.0.1:11434/v1" } }}
    />
  )
} satisfies Story

export const ReplaceKey = {
  render: () => <ConnectionsWorkspace selected="openrouter" dialog="replace-key" draft={{ apiKey: "sk-or-new-key" }} />
} satisfies Story

export const RemoveConnection = {
  render: () => <ConnectionsWorkspace selected="search-tools" dialog="remove" />
} satisfies Story

export const EmptyConnections = { render: () => <ConnectionsWorkspace empty /> } satisfies Story

/** Loading keeps the header and shows quiet rows, never an empty list. */
export const Loading = {
  render: () => <ConnectionsWorkspace status="loading" />
} satisfies Story

export const LoadFailed = {
  render: () => <ConnectionsWorkspace status="failed" />
} satisfies Story

/** A member sees connections and their settings, without adding, editing, or checking. */
export const ReadOnly = {
  render: () => <ConnectionsWorkspace selected="search-tools" readOnly />,
  play: async ({ canvasElement }) => {
    await expect(sidebar(canvasElement).queryByRole("button", { name: /Add/ })).toBeNull()
    const page = main(canvasElement)
    for (const name of ["Check connection", "Save name", "Save settings", "Replace key", "Remove connection"])
      await expect(page.queryByRole("button", { name })).toBeNull()
    await expect(page.getByRole("textbox", { name: "Server URL" })).toBeDisabled()
  }
} satisfies Story

/**
 * Adding from the Tools section: choose MCP server, give its URL and key, and create it, which
 * opens its page and checks it.
 */
export const AddConnectionFlow = {
  render: () => <ConnectionsWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.click(sidebar(canvasElement).getByRole("button", { name: "Add tool connection" }))
    const chooser = await body(canvasElement).findByRole("dialog", {
      name: "Add tool connection"
    })
    await userEvent.click(within(chooser).getByRole("button", { name: /MCP server/ }))
    const configure = within(await body(canvasElement).findByRole("dialog", { name: "Configure connection" }))
    const name = configure.getByRole("textbox", { name: "Connection name" })
    await userEvent.clear(name)
    await userEvent.type(name, "Docs search")
    await userEvent.type(configure.getByRole("textbox", { name: "Server URL" }), "https://docs.example.com/mcp")
    const create = configure.getByRole("button", { name: "Create connection" })
    await expect(create).toBeDisabled()
    await userEvent.type(configure.getByLabelText("API key", { selector: "input" }), "sk-docs")
    await userEvent.click(create)
    await waitFor(() => expect(body(canvasElement).queryByRole("dialog", { name: "Configure connection" })).toBeNull())
    await expect(canvas.getByRole("heading", { name: "Docs search" })).toBeVisible()
    await expect(await main(canvasElement).findByText("Working")).toBeVisible()
    await waitFor(() =>
      expect(canvas.getAllByRole("status").some((toast) => toast.textContent?.includes("Docs search created"))).toBe(
        true
      )
    )
    await expect(sidebar(canvasElement).getByRole("link", { name: /Docs search/ })).toHaveAttribute(
      "aria-current",
      "page"
    )
  }
} satisfies Story

/** A host that keeps no keys refuses a keyed connection; the draft stays. */
export const KeyStorageUnavailable = {
  render: () => (
    <ConnectionsWorkspace
      dialog="configure"
      integration="mcp"
      noKeyStorage
      draft={{
        name: "Search tools",
        settings: { url: "https://search.example.com/mcp" },
        apiKey: "sk-search"
      }}
    />
  ),
  play: async ({ canvasElement }) => {
    const dialog = within(await body(canvasElement).findByRole("dialog", { name: "Configure connection" }))
    await userEvent.click(dialog.getByRole("button", { name: "Create connection" }))
    await expect(await dialog.findByRole("alert")).toHaveTextContent("This host keeps no keys.")
    await expect(dialog.getByRole("textbox", { name: "Connection name" })).toHaveValue("Search tools")
  }
} satisfies Story

/** Searching keeps the text; a search that finds nothing offers to clear it. */
export const NoMatchingConnections = {
  render: () => <ConnectionsWorkspace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    await userEvent.type(canvas.getByRole("searchbox"), "vertexx")
    await expect(canvas.getByText("No connections match “vertexx”.")).toBeVisible()
    await userEvent.click(canvas.getByRole("button", { name: "Clear search" }))
    await expect(list(canvasElement).getAllByRole("link")).toHaveLength(6)
  }
} satisfies Story

/** A rename made elsewhere meanwhile: the draft stays, with Refresh to review it. */
export const RenamedMeanwhile = {
  render: () => <ConnectionsWorkspace selected="openrouter" conflict="rename" />,
  play: async ({ canvasElement }) => {
    const page = main(canvasElement)
    const name = page.getByRole("textbox", { name: "Connection name" })
    await userEvent.clear(name)
    await userEvent.type(name, "OpenRouter · Studio")
    await userEvent.click(page.getByRole("button", { name: "Save name" }))
    await expect(await page.findByRole("alert")).toHaveTextContent("This connection was renamed meanwhile.")
    await expect(name).toHaveValue("OpenRouter · Studio")
    await expect(page.getByRole("button", { name: "Refresh" })).toBeVisible()
  }
} satisfies Story
