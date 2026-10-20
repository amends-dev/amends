import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Option, Schema } from "effect"
import {
  Command,
  Subscription,
  all,
  change,
  click,
  expect,
  expectAll,
  expectOutMessage,
  filter,
  first,
  given,
  inside,
  label,
  role,
  scene,
  selector,
  text,
  type,
  withViewInputs,
  within
} from "foldkit/scene"
import { modifyFields } from "foldkit/struct"
import {
  aliceOwns,
  bob,
  connectionReadAs,
  connectionTo,
  grantsOf,
  integrationGiving,
  membership,
  roleOf,
  searchApi
} from "../../../test/fixtures.ts"
import { calendarDate } from "../../seen.ts"
import { ConnectionsBlock } from "./block.ts"
import { CheckConnection, ConfigureConnection, RenameConnection } from "./command.ts"
import { Integrations, Message, type Model, OutMessage } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { connectionView, sidebarView, view } from "./view.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }
const workspaceId = workspace.id

const ownerGrants = grantsOf([aliceOwns])
const memberGrants = grantsOf([roleOf("assignment-3", member.id, BuiltinRoles.MemberId)])

const modelsApi = integrationGiving("anthropic", "Anthropic", ["models"], ["apiKey"])
const sandboxApi = integrationGiving("local", "This machine", ["sandboxes"])
const harnessApi = integrationGiving("amends", "amends", ["harnesses"])
const chatApi = integrationGiving("chat", "Chat", ["channels"])

const team = connectionTo("connection-1", "anthropic", "Anthropic · Team", "apiKey")
const search = connectionTo("connection-2", "search-api", "Search tools", "apiKey", {
  url: "https://search.example.com/mcp",
  verbose: false,
  region: "eu"
})
const machine = connectionTo("connection-3", "local", "This machine")
const runner = connectionTo("connection-4", "amends", "amends")
const support = connectionTo("connection-5", "chat", "Support chat")

const listView = withViewInputs(view, { workspaceName: workspace.name })()

/** The connections as an owner of the workspace reads them, with the integrations the host installs listed. */
const opened: Model = modifyFields(init(workspace.id, member.id).model, {
  isLoaded: () => true,
  members: () => [member, bob],
  integrations: () => Integrations.Loaded({ integrations: [modelsApi, searchApi, sandboxApi, harnessApi, chatApi] }),
  grants: () => ownerGrants
})

/** One connection of each thing a connection gives, and a second tool, in the order they are listed: by name. */
const withSeveral: Model = modifyFields(opened, {
  connections: () => [runner, team, support, search, machine].map((connection) => ({ connection, pending: false }))
})

describe("the connections list", () => {
  it("has a tab for All and each thing a connection gives, each with how many connections it holds, All shown first", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expect(role("heading", { name: "Connections", level: 1 })).toExist(),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "5"),
      expect(role("tab", { name: "Models" })).toHaveAttr("aria-description", "1"),
      expect(role("tab", { name: "Tools" })).toHaveAttr("aria-description", "1"),
      expect(role("tab", { name: "Sandboxes" })).toHaveAttr("aria-description", "1"),
      expect(role("tab", { name: "Harnesses" })).toHaveAttr("aria-description", "1"),
      expect(role("tab", { name: "Channels" })).toHaveAttr("aria-description", "1"),
      expectAll(all.role("tab")).toHaveCount(6)
    )
  })

  it("narrows its rows to the tab the person chooses, and back to all of them", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expectAll(all.role("tab")).toHaveCount(6),
      click(role("tab", { name: "Tools" })),
      expect(role("tab", { name: "Tools" })).toHaveAttr("aria-selected", "true"),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-selected", "false"),
      expect(role("button", { name: "Search tools" })).toExist(),
      expect(role("button", { name: "Anthropic · Team" })).toBeAbsent(),
      expect(role("button", { name: "This machine" })).toBeAbsent(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Anthropic · Team" })).toExist(),
      expect(role("button", { name: "This machine" })).toExist()
    )
  })

  it("counts no connections before they are read, and none on a tab before the integrations that say what they give", () => {
    scene(
      { update, view: listView },
      given(modifyFields(withSeveral, { isLoaded: () => false })),
      expect(role("tab", { name: "All" })).not.toHaveAttr("aria-description"),
      expect(role("tab", { name: "Models" })).not.toHaveAttr("aria-description")
    )
    scene(
      { update, view: listView },
      given(modifyFields(withSeveral, { integrations: () => Integrations.Loading() })),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "5"),
      expect(role("tab", { name: "Models" })).not.toHaveAttr("aria-description")
    )
  })

  it("puts a connection on the tab of each thing its integration gives, and a connection whose integration is gone on All alone", () => {
    const gone = connectionReadAs(connectionTo("connection-6", "vertex", "Vertex · Research", "apiKey"), {
      _tag: "Uninstalled"
    })
    scene(
      { update, view: listView },
      given(
        modifyFields(withSeveral, {
          integrations: () =>
            Integrations.Loaded({
              integrations: [integrationGiving("anthropic", "Anthropic", ["models", "tools"], ["apiKey"]), searchApi]
            }),
          connections: () => [team, gone].map((connection) => ({ connection, pending: false }))
        })
      ),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "2"),
      expect(role("tab", { name: "Models" })).toHaveAttr("aria-description", "1"),
      expect(role("tab", { name: "Tools" })).toHaveAttr("aria-description", "1"),
      click(role("tab", { name: "Tools" })),
      expect(role("button", { name: "Anthropic · Team" })).toExist(),
      expect(role("button", { name: "Vertex · Research, Unavailable" })).toBeAbsent()
    )
  })

  it("labels the columns Connection and Authentication, hidden from assistive technology, over the rows", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expect(text("Authentication")).toExist(),
      expect(role("list", { name: "Connections" })).toExist(),
      expectAll(all.role("listitem")).toHaveCount(5)
    )
  })

  it("lists a row for each connection by name, with its integration and what it gives, and how it authenticates", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expect(role("button", { name: "Anthropic · Team" })).toHaveAttr(
        "aria-description",
        "Anthropic · Models · API key"
      ),
      expect(role("button", { name: "Search tools" })).toHaveAttr("aria-description", "MCP server · Tools · API key"),
      expect(role("button", { name: "This machine" })).toHaveAttr(
        "aria-description",
        "This machine · Sandboxes · No authentication"
      ),
      expect(within(role("button", { name: "This machine" }), text("No authentication"))).toExist(),
      expect(within(role("button", { name: "Anthropic · Team" }), text("API key"))).toExist(),
      expect(within(role("button", { name: "Anthropic · Team" }), selector("svg"))).toHaveAttr("aria-hidden", "true")
    )
  })

  it("puts a status on the tile of a connection that can't be used, named after it, and none on one that is ready", () => {
    const needsSetup = connectionReadAs(search, { _tag: "Invalid", description: "MCP server takes no key" })
    const gone = connectionReadAs(connectionTo("connection-6", "vertex", "Vertex · Research", "apiKey"), {
      _tag: "Uninstalled"
    })
    scene(
      { update, view: listView },
      given(
        modifyFields(withSeveral, {
          connections: () => [team, needsSetup, gone].map((connection) => ({ connection, pending: false }))
        })
      ),
      expect(role("button", { name: "Search tools, Needs setup" })).toExist(),
      expect(within(role("button", { name: "Search tools, Needs setup" }), selector("[title]"))).toHaveAttr(
        "title",
        "Needs setup: MCP server takes no key"
      ),
      expect(role("button", { name: "Vertex · Research, Unavailable" })).toHaveAttr(
        "aria-description",
        "Integration not installed · API key"
      ),
      expect(within(role("button", { name: "Vertex · Research, Unavailable" }), selector("[title]"))).toHaveAttr(
        "title",
        "Unavailable: Its integration isn't installed on this host."
      ),
      expect(within(role("button", { name: "Anthropic · Team" }), selector("[title]"))).toBeAbsent()
    )
  })

  it("says a connection is on its way, with no status, while a change to it is", () => {
    const needsSetup = connectionReadAs(search, { _tag: "Invalid", description: "MCP server takes no key" })
    scene(
      { update, view: listView },
      given(modifyFields(opened, { connections: () => [{ connection: needsSetup, pending: true }] })),
      expect(role("button", { name: "Search tools" })).toHaveAttr("aria-description", "Sending… · API key")
    )
  })

  it("names no integration before the host lists them", () => {
    scene(
      { update, view: listView },
      given(
        modifyFields(withSeveral, {
          integrations: () => Integrations.Loading(),
          grants: () => memberGrants
        })
      ),
      expect(role("button", { name: "Anthropic · Team" })).toHaveAttr("aria-description", "API key")
    )
  })

  it("lists the connections by name, whatever order the store gives them", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { isLoaded: () => false })),
      expect(role("list", { name: "Connections" })).toBeAbsent()
    )
    scene(
      { update, view: listView, subscriptions: ConnectionsBlock.subscriptions },
      given(modifyFields(opened, { isLoaded: () => false })),
      Subscription.emit(
        subscriptions.connections,
        Message.ReceivedConnections({
          connections: [runner, team, support].map((connection) => ({ connection, pending: false }))
        })
      ),
      expect(first(all.role("button"))).toHaveAccessibleName("amends")
    )
  })

  it("narrows its rows by the name of a connection or of its integration as the person searches, in any case and whatever the accents", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      type(label("Search connections"), "SEARCH"),
      expect(role("button", { name: "Search tools" })).toExist(),
      expect(role("button", { name: "Anthropic · Team" })).toBeAbsent(),
      type(label("Search connections"), "mcp"),
      expect(role("button", { name: "Search tools" })).toExist(),
      type(label("Search connections"), "ánthropic"),
      expect(role("button", { name: "Anthropic · Team" })).toExist(),
      expect(role("button", { name: "Search tools" })).toBeAbsent(),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "5")
    )
  })

  it("clears the search when the person chooses another tab", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      type(label("Search connections"), "search"),
      click(role("tab", { name: "Tools" })),
      expect(label("Search connections")).toHaveValue("")
    )
  })

  it("says nothing matches the search, with the search quoted, and clears it from a quiet button", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      type(label("Search connections"), "zzz"),
      expect(role("heading", { name: "No connections match “zzz”.", level: 2 })).toExist(),
      expect(role("list", { name: "Connections" })).toBeAbsent(),
      click(role("button", { name: "Clear search" })),
      expect(role("heading", { name: "No connections match “zzz”." })).toBeAbsent(),
      expect(role("button", { name: "Anthropic · Team" })).toExist()
    )
  })

  it("says a tab has none yet, by what its connections would give", () => {
    scene(
      { update, view: listView },
      given(modifyFields(withSeveral, { connections: () => [{ connection: team, pending: false }] })),
      click(role("tab", { name: "Sandboxes" })),
      expect(role("heading", { name: "No sandboxes connections yet.", level: 2 })).toExist(),
      expect(label("Search connections")).toExist(),
      click(role("tab", { name: "All" })),
      expect(role("button", { name: "Anthropic · Team" })).toExist()
    )
  })

  it("says there are none yet when the workspace has no connection, and who can add them", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { connections: () => [] })),
      expect(role("heading", { name: "No connections yet", level: 2 })).toExist(),
      expect(
        text("Connect the models, tools, sandboxes, harnesses, and channels your workspace works with.")
      ).toExist(),
      expect(label("Search connections")).toBeAbsent(),
      expect(role("tab", { name: "All" })).toHaveAttr("aria-description", "0")
    )
    scene(
      { update, view: listView },
      given(modifyFields(opened, { connections: () => [], grants: () => memberGrants })),
      expect(role("heading", { name: "No connections yet", level: 2 })).toExist(),
      expect(
        text("An administrator can connect models, tools, sandboxes, harnesses, and channels for your workspace.")
      ).toExist()
    )
  })

  it("shows nothing, not even that there are none, until the connections are read", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { isLoaded: () => false })),
      expect(role("heading", { name: "No connections yet" })).toBeAbsent(),
      expect(label("Search connections")).toBeAbsent(),
      expect(role("main", { name: "Connections" })).toExist()
    )
  })

  it("names the workspace under the title on a phone", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      expect(within(role("main", { name: "Connections" }), text("Studio"))).toHaveClass("max-tablet:block")
    )
  })

  it("reports the connection picked", () => {
    scene(
      { update, view: listView },
      given(withSeveral),
      click(role("button", { name: "This machine" })),
      expectOutMessage(OutMessage.OpenedConnection({ connectionId: machine.id })),
      Command.expectNone()
    )
  })

  it("says why the integrations could not be listed to a person who may add connections, and asks the page to list them again", () => {
    scene(
      { update, view: listView },
      given(
        modifyFields(withSeveral, {
          integrations: () => Integrations.Failed({ error: "The host could not be reached. Try again." })
        })
      ),
      expect(text("The host could not be reached. Try again.")).toExist(),
      click(role("button", { name: "Try again" })),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      expect(text("Loading the integrations…")).toExist(),
      expect(role("button", { name: "Try again" })).toBeAbsent()
    )
    scene(
      { update, view: listView },
      given(
        modifyFields(withSeveral, {
          grants: () => memberGrants,
          integrations: () => Integrations.Failed({ error: "The host could not be reached. Try again." })
        })
      ),
      expect(text("The host could not be reached. Try again.")).toBeAbsent()
    )
  })

  it("says why the connections could not be read", () => {
    scene(
      { update, view: listView, subscriptions: ConnectionsBlock.subscriptions },
      given(opened),
      Subscription.emit(
        subscriptions.connections,
        Message.FailedRead({ error: "This browser could not read the workspace's copy." })
      ),
      expect(text("This browser could not read the workspace's copy.")).toExist(),
      expect(role("alert")).toExist()
    )
  })
})

describe("the connections' sections of the sidebar", () => {
  const sidebar = withViewInputs(sidebarView, {
    isListOpen: false,
    openConnectionId: Option.none(),
    isChannelsOpen: false
  })

  const hostedBy = integrationGiving("test-models", "Test models", ["models", "tools"])
  const hosted = connectionTo("connection-10", "test-models", "Hosted")

  /** The connections and the integrations read: one connection that gives models and tools, and one a sandbox. */
  const withHosted: Model = modifyFields(opened, {
    integrations: () => Integrations.Loaded({ integrations: [hostedBy, sandboxApi] }),
    connections: () => [hosted, machine].map((connection) => ({ connection, pending: false }))
  })

  it("are one for each thing a connection gives, Models, Tools, Sandboxes, and Harnesses, then Channels", () => {
    scene(
      { update, view: sidebar() },
      given(withHosted),
      expect(role("heading", { name: "Models", level: 2 })).toExist(),
      expect(role("heading", { name: "Tools", level: 2 })).toExist(),
      expect(role("heading", { name: "Sandboxes", level: 2 })).toExist(),
      expect(role("heading", { name: "Harnesses", level: 2 })).toExist(),
      expect(role("heading", { name: "Channels", level: 2 })).toExist(),
      expect(role("heading", { name: "Connections", level: 2 })).toBeAbsent()
    )
  })

  it("list each connection under every thing its integration gives, and nothing for what it does not", () => {
    scene(
      { update, view: sidebar() },
      given(withHosted),
      expectAll(all.role("button", { name: "Hosted" })).toHaveCount(2),
      expectAll(all.role("button", { name: "This machine" })).toHaveCount(1),
      expect(within(role("button", { name: "This machine" }), selector("svg"))).toHaveAttr("aria-hidden", "true"),
      expect(role("button", { name: "This machine" })).not.toHaveAttr("aria-current")
    )
    scene(
      { update, view: sidebar() },
      given(modifyFields(withHosted, { integrations: () => Integrations.Loaded({ integrations: [sandboxApi] }) })),
      expect(role("button", { name: "Hosted" })).toBeAbsent(),
      expect(role("button", { name: "This machine" })).toExist()
    )
  })

  it("say a section has none only once the connections and the integrations are read", () => {
    const emptied = filter(all.role("listitem"), { hasText: "None yet" })
    scene(
      { update, view: sidebar() },
      given(modifyFields(withHosted, { isLoaded: () => false })),
      expectAll(emptied).toHaveCount(0)
    )
    scene(
      { update, view: sidebar() },
      given(modifyFields(withHosted, { integrations: () => Integrations.Loading() })),
      expectAll(emptied).toHaveCount(0)
    )
    scene(
      { update, view: sidebar() },
      given(withHosted),
      expectAll(emptied).toHaveCount(1),
      expect(role("button", { name: "Browse harnesses" })).toExist()
    )
    scene(
      { update, view: sidebar() },
      given(modifyFields(init(workspace.id, member.id).model, { isLoaded: () => true })),
      expectAll(emptied).toHaveCount(0)
    )
  })

  it("open the list on the tab of the section from its title and from Browse", () => {
    scene(
      { update, view: sidebar() },
      given(withHosted),
      click(role("button", { name: "Models" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      click(role("button", { name: "Browse tools" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      click(role("button", { name: "Browse sandboxes" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      Command.expectNone()
    )
  })

  it("mark the title of the tab the list is on current while the list shows, and no other", () => {
    scene(
      { update, view: sidebar({ isListOpen: true }) },
      given(modifyFields(withHosted, { browse: () => ({ tab: "tools", query: "" }) })),
      expect(role("button", { name: "Tools" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Models" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Channels" })).not.toHaveAttr("aria-current")
    )
    scene(
      { update, view: sidebar({ isListOpen: true }) },
      given(withHosted),
      expect(role("button", { name: "Models" })).not.toHaveAttr("aria-current"),
      expect(role("button", { name: "Tools" })).not.toHaveAttr("aria-current")
    )
    scene(
      { update, view: sidebar({ isListOpen: false }) },
      given(modifyFields(withHosted, { browse: () => ({ tab: "tools", query: "" }) })),
      expect(role("button", { name: "Tools" })).not.toHaveAttr("aria-current")
    )
  })

  it("choose the tab of the title that was picked, and show the list", () => {
    scene(
      { update, view: sidebar() },
      given(withHosted),
      click(role("button", { name: "Browse sandboxes" })),
      expectOutMessage(OutMessage.RequestedBrowse())
    )
    scene(
      { update, view: listView },
      given(withHosted),
      click(role("tab", { name: "Sandboxes" })),
      expect(role("button", { name: "This machine" })).toExist(),
      expect(role("button", { name: "Hosted" })).toBeAbsent()
    )
  })

  it("report the connection picked, and mark the row of the one whose page is open current, in every section it is in", () => {
    scene(
      { update, view: sidebar() },
      given(withHosted),
      click(role("button", { name: "This machine" })),
      expectOutMessage(OutMessage.OpenedConnection({ connectionId: machine.id }))
    )
    scene(
      { update, view: sidebar({ openConnectionId: Option.some(hosted.id) }) },
      given(withHosted),
      expectAll(all.role("button", { name: "Hosted" })).toHaveCount(2),
      expect(first(all.role("button", { name: "Hosted" }))).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "This machine" })).not.toHaveAttr("aria-current")
    )
  })

  it("end a row with the connection's status, a shape named after it, and none for one that is ready", () => {
    scene(
      { update, view: sidebar() },
      given(withHosted),
      expect(within(role("button", { name: "This machine" }), selector("[title]"))).toBeAbsent()
    )
    scene(
      { update, view: sidebar() },
      given(
        modifyFields(withHosted, {
          connections: () => [
            {
              connection: connectionReadAs(hosted, { _tag: "Invalid", description: "The key was refused" }),
              pending: false
            }
          ]
        })
      ),
      expectAll(all.role("button", { name: "Hosted, Needs setup" })).toHaveCount(2),
      expect(within(first(all.role("button", { name: "Hosted, Needs setup" })), selector("[title]"))).toHaveAttr(
        "title",
        "Needs setup: The key was refused"
      )
    )
    scene(
      { update, view: sidebar() },
      given(
        modifyFields(withHosted, {
          connections: () => [{ connection: connectionReadAs(hosted, { _tag: "Uninstalled" }), pending: false }]
        })
      ),
      expectAll(all.role("button", { name: "Hosted, Unavailable" })).toHaveCount(2),
      expect(within(first(all.role("button", { name: "Hosted, Unavailable" })), selector("[title]"))).toHaveAttr(
        "title",
        "Unavailable: Its integration isn't installed on this host."
      )
    )
  })

  it("mark a connection that is on its way with Sending…, and no status", () => {
    scene(
      { update, view: sidebar() },
      given(modifyFields(withHosted, { connections: () => [{ connection: machine, pending: true }] })),
      expect(role("button", { name: "This machine" })).toHaveAttr("aria-description", "Sending…")
    )
  })

  it("end with Channels, whose title and Browse open the channels, and which has no Add", () => {
    scene(
      { update, view: sidebar() },
      given(withHosted),
      click(role("button", { name: "Channels" })),
      expectOutMessage(OutMessage.RequestedChannels()),
      click(role("button", { name: "Browse channels" })),
      expectOutMessage(OutMessage.RequestedChannels()),
      expect(role("button", { name: "Add channel connection" })).toBeAbsent(),
      expect(role("button", { name: "Channels" })).not.toHaveAttr("aria-current")
    )
    scene(
      { update, view: sidebar({ isChannelsOpen: true }) },
      given(withHosted),
      expect(role("button", { name: "Channels" })).toHaveAttr("aria-current", "page"),
      expect(role("button", { name: "Models" })).not.toHaveAttr("aria-current")
    )
  })
})

describe("a connection's page", () => {
  const page = (connection: typeof team) =>
    withViewInputs(connectionView, { connectionId: connection.id, workspaceName: workspace.name })()

  /** The workspace's connections to a search server that takes a key, as its owner reads them. */
  const withSearch: Model = modifyFields(opened, { connections: () => [{ connection: search, pending: false }] })

  const aroundSearch = { update, view: page(search) }

  it("is titled by the connection's name, with the workspace under it on a phone", () => {
    scene(
      aroundSearch,
      given(withSearch),
      expect(role("main", { name: "Search tools" })).toExist(),
      expect(role("heading", { name: "Search tools", level: 1 })).toExist(),
      expect(within(role("main", { name: "Search tools" }), text("Studio"))).toHaveClass("max-tablet:block")
    )
  })

  it("shows an owner, in one column, whether it works, its name, its settings, how it authenticates, and its details", () => {
    scene(
      aroundSearch,
      given(withSearch),
      expect(role("region", { name: "Check" })).toExist(),
      expect(role("button", { name: "Check connection" })).toExist(),
      expect(role("form", { name: "Name" })).toExist(),
      expect(label("Connection name")).toHaveValue("Search tools"),
      expect(role("form", { name: "Settings" })).toExist(),
      expect(role("region", { name: "Authentication" })).toExist(),
      expect(role("region", { name: "Details" })).toExist(),
      expect(role("note")).toBeAbsent()
    )
  })

  it("shows the settings its integration asks for, as it saved them, with what the integration says of each and which are optional", () => {
    scene(
      aroundSearch,
      given(withSearch),
      inside(
        role("form", { name: "Settings" }),
        expect(label("Server URL")).toHaveValue("https://search.example.com/mcp"),
        expect(text("Where the MCP server answers over Streamable HTTP.")).toExist(),
        expect(label("Key header · Optional")).toHaveValue(""),
        expect(role("switch", { name: "Verbose · Optional" })).toHaveAttr("aria-checked", "false"),
        expect(label("Region · Optional")).toHaveValue("eu"),
        expect(role("button", { name: "Save settings" })).toBeDisabled()
      )
    )
  })

  it("asks the connection's system whether it works, shows that it is checking, and then what it found in place", () => {
    scene(
      aroundSearch,
      given(withSearch),
      expect(text("Ask MCP server whether this connection works as it is set up.")).toExist(),
      click(role("button", { name: "Check connection" })),
      Command.expectExact(CheckConnection({ workspaceId, connectionId: search.id })),
      expect(text("Checking with MCP server…")).toExist(),
      expect(role("button", { name: "Check connection" })).toBeDisabled(),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: search.id, health: { status: "healthy" } })
      ),
      inside(
        role("note", { name: "Working" }),
        expect(text("Working")).toExist(),
        expect(text("The check found nothing wrong.")).toExist()
      ),
      expect(role("button", { name: "Check connection" })).toBeAbsent(),
      click(role("button", { name: "Check again" })),
      Command.expectExact(CheckConnection({ workspaceId, connectionId: search.id })),
      expect(role("note", { name: "Working" })).toBeAbsent(),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: search.id, health: { status: "healthy" } })
      )
    )
  })

  for (const [status, title, line, mark, description] of [
    ["unauthorized", "Key refused", "The system refused this connection's key.", "bg-danger-mark", undefined],
    [
      "misconfigured",
      "Settings don't work",
      "The settings lead nowhere this integration works.",
      "bg-danger-mark",
      undefined
    ],
    [
      "unavailable",
      "Couldn't reach it",
      "The system didn't answer. It may answer later.",
      "bg-caution-mark",
      undefined
    ],
    [
      "unauthorized",
      "Key refused",
      "The server refused the key (401).",
      "bg-danger-mark",
      "The server refused the key (401)."
    ]
  ] as const) {
    it(`says what a check found when ${status}${description === undefined ? "" : ", in the words of the system"}`, () => {
      scene(
        aroundSearch,
        given(withSearch),
        click(role("button", { name: "Check connection" })),
        Command.resolve(
          CheckConnection,
          Message.CheckedConnection({
            connectionId: search.id,
            health: description === undefined ? { status } : { status, description }
          })
        ),
        inside(
          role("note", { name: title }),
          expect(text(title)).toExist(),
          expect(text(line)).toExist(),
          expect(selector(`span.${mark}`)).toExist()
        )
      )
    })
  }

  it("says why a check could not be made, with a way to refresh when what the person sees is out of date", () => {
    scene(
      aroundSearch,
      given(withSearch),
      click(role("button", { name: "Check connection" })),
      Command.resolve(
        CheckConnection,
        Message.FailedCheckConnection({
          connectionId: search.id,
          failure: { action: "Check", reason: "Failed", description: Option.none() }
        })
      ),
      expect(text("The connection couldn't be checked. Try again when the host is available.")).toExist(),
      expect(role("button", { name: "Refresh" })).toBeAbsent(),
      expect(role("button", { name: "Check connection" })).toBeEnabled(),
      click(role("button", { name: "Check connection" })),
      Command.resolve(
        CheckConnection,
        Message.FailedCheckConnection({
          connectionId: search.id,
          failure: { action: "Check", reason: "Uninstalled", description: Option.none() }
        })
      ),
      expect(text("This integration isn't installed on this host anymore.")).toExist(),
      click(role("button", { name: "Refresh" })),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      expect(text("This integration isn't installed on this host anymore.")).toBeAbsent(),
      expect(role("button", { name: "Refresh" })).toBeAbsent()
    )
  })

  it("renames the connection from the name it has, saving on its own, and says why one can't be saved under the name", () => {
    scene(
      aroundSearch,
      given(withSearch),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      type(label("Connection name"), "  "),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      type(label("Connection name"), "Search"),
      expect(role("button", { name: "Save name" })).toBeEnabled(),
      click(role("button", { name: "Save name" })),
      Command.expectExact(
        RenameConnection({ ...asMember, connectionId: search.id, name: "Search", expectedName: "Search tools" })
      ),
      expect(label("Connection name")).toBeDisabled(),
      expect(role("button", { name: "Save name" })).toBeDisabled(),
      Command.resolve(
        RenameConnection,
        Message.FailedWriteAction({ written: { _tag: "Rename", connectionId: search.id }, reason: "Invalid" })
      ),
      expect(text("Use 1 to 80 characters, with no invisible ones.")).toExist(),
      expect(label("Connection name")).toHaveValue("Search"),
      type(label("Connection name"), "Search servers"),
      expect(text("Use 1 to 80 characters, with no invisible ones.")).toBeAbsent(),
      click(role("button", { name: "Save name" })),
      Command.resolve(
        RenameConnection,
        Message.FailedWriteAction({ written: { _tag: "Rename", connectionId: search.id }, reason: "Failed" })
      ),
      expect(text("The name couldn't be saved. Try again when the host is available.")).toExist(),
      click(role("button", { name: "Save name" })),
      Command.resolve(RenameConnection, Message.WroteAction({ written: { _tag: "Rename", connectionId: search.id } })),
      expect(text("The name couldn't be saved. Try again when the host is available.")).toBeAbsent(),
      expect(label("Connection name")).toBeEnabled()
    )
  })

  it("saves the settings as a whole once they are changed, from what the person edited", () => {
    scene(
      aroundSearch,
      given(withSearch),
      inside(
        role("form", { name: "Settings" }),
        type(label("Server URL"), "https://search.example.com/v2/mcp"),
        type(label("Key header · Optional"), "X-Api-Key"),
        click(role("switch", { name: "Verbose · Optional" })),
        change(label("Region · Optional"), "us"),
        expect(role("button", { name: "Save settings" })).toBeEnabled(),
        click(role("button", { name: "Save settings" }))
      ),
      Command.expectExact(
        ConfigureConnection({
          ...asMember,
          connectionId: search.id,
          settings: { url: "https://search.example.com/v2/mcp", keyHeader: "X-Api-Key", verbose: true, region: "us" }
        })
      ),
      expect(label("Server URL")).toBeDisabled(),
      Command.resolve(
        ConfigureConnection,
        Message.FailedWriteAction({ written: { _tag: "Configure", connectionId: search.id }, reason: "Failed" })
      ),
      expect(text("The settings couldn't be saved. Try again when the host is available.")).toExist(),
      expect(label("Server URL")).toHaveValue("https://search.example.com/v2/mcp"),
      click(role("button", { name: "Save settings" })),
      Command.resolve(
        ConfigureConnection,
        Message.WroteAction({ written: { _tag: "Configure", connectionId: search.id } })
      ),
      expect(text("The settings couldn't be saved. Try again when the host is available.")).toBeAbsent()
    )
  })

  it("sends no settings that leave a required one empty, and waits for one", () => {
    scene(
      aroundSearch,
      given(withSearch),
      type(label("Server URL"), ""),
      expect(role("button", { name: "Save settings" })).toBeEnabled(),
      click(role("button", { name: "Save settings" })),
      Command.expectNone()
    )
  })

  it("shows how it authenticates: a saved key that can't be viewed, or no authentication", () => {
    scene(
      aroundSearch,
      given(withSearch),
      inside(
        role("region", { name: "Authentication" }),
        expect(text("API key saved")).toExist(),
        expect(text("The stored key cannot be viewed or copied.")).toExist()
      )
    )
    scene(
      { update, view: page(machine) },
      given(modifyFields(opened, { connections: () => [{ connection: machine, pending: false }] })),
      inside(
        role("region", { name: "Authentication" }),
        expect(text("No authentication")).toExist(),
        expect(text("Requests through this connection carry no credentials.")).toExist()
      )
    )
  })

  it("lists its details: its integration with a link to its documentation, what it gives, and who made it and when", () => {
    scene(
      aroundSearch,
      given(withSearch),
      inside(
        role("region", { name: "Details" }),
        expect(text("Integration")).toExist(),
        expect(role("link", { name: "Documentation" })).toHaveAttr("href", "https://modelcontextprotocol.io"),
        expect(role("link", { name: "Documentation" })).toHaveAttr("target", "_blank"),
        expect(text("Gives")).toExist(),
        expect(text("Tools")).toExist(),
        expect(text(`Alice · ${calendarDate(search.createdAt)}`)).toExist()
      )
    )
    scene(
      { update, view: page(machine) },
      given(modifyFields(opened, { connections: () => [{ connection: machine, pending: false }] })),
      inside(
        role("region", { name: "Details" }),
        expect(text("This machine · Sandboxes")).toBeAbsent(),
        expect(role("link")).toBeAbsent(),
        expect(text("Sandboxes")).toExist()
      )
    )
  })

  it("names its maker by their id until the members are read", () => {
    scene(
      aroundSearch,
      given(modifyFields(withSearch, { members: () => [] })),
      inside(
        role("region", { name: "Details" }),
        expect(text(`member-1 · ${calendarDate(search.createdAt)}`)).toExist()
      )
    )
  })

  it("says in a note why its integration refuses its setup, and still lets its owner change it", () => {
    const refused = connectionReadAs(search, {
      _tag: "Invalid",
      description: "MCP server takes no setting named region."
    })
    scene(
      { update, view: page(refused) },
      given(modifyFields(opened, { connections: () => [{ connection: refused, pending: false }] })),
      inside(
        role("note", { name: "MCP server refuses this setup" }),
        expect(text("MCP server refuses this setup")).toExist(),
        expect(text("MCP server takes no setting named region.")).toExist()
      ),
      expect(role("form", { name: "Settings" })).toExist(),
      expect(role("region", { name: "Check" })).toBeAbsent(),
      expect(label("Connection name")).toBeEnabled()
    )
  })

  it("says in a note that its integration is not installed, shows the settings it saved to read, and offers no check", () => {
    const gone = connectionReadAs(
      connectionTo("connection-6", "vertex", "Vertex · Research", "apiKey", {
        project: "mercier-research",
        location: "us-central1"
      }),
      { _tag: "Uninstalled" }
    )
    scene(
      { update, view: page(gone) },
      given(modifyFields(opened, { connections: () => [{ connection: gone, pending: false }] })),
      inside(
        role("note", { name: "Its integration isn't installed on this host" }),
        expect(text("Nothing can use this connection. Its settings stay until it is removed.")).toExist()
      ),
      expect(role("region", { name: "Check" })).toBeAbsent(),
      expect(role("form", { name: "Settings" })).toBeAbsent(),
      inside(
        role("region", { name: "Saved settings" }),
        expect(text("project")).toExist(),
        expect(text("mercier-research")).toExist(),
        expect(text("location")).toExist(),
        expect(text("us-central1")).toExist()
      ),
      inside(role("region", { name: "Details" }), expect(text("vertex · Not installed")).toExist()),
      expect(label("Connection name")).toBeEnabled()
    )
  })

  it("shows a person who may not manage it its values to read, with nothing to save or check", () => {
    scene(
      aroundSearch,
      given(modifyFields(withSearch, { grants: () => memberGrants })),
      expect(label("Connection name")).toBeDisabled(),
      expect(label("Connection name")).toHaveValue("Search tools"),
      expect(label("Server URL")).toBeDisabled(),
      expect(label("Server URL")).toHaveValue("https://search.example.com/mcp"),
      expect(label("Region · Optional")).toBeDisabled(),
      expect(role("switch", { name: "Verbose · Optional" })).toBeDisabled(),
      expect(role("button", { name: "Save name" })).toBeAbsent(),
      expect(role("button", { name: "Save settings" })).toBeAbsent(),
      expect(role("region", { name: "Check" })).toBeAbsent(),
      expect(role("region", { name: "Authentication" })).toExist(),
      expect(role("region", { name: "Details" })).toExist()
    )
  })

  it("says a connection is on its way, and lets nothing about it be saved yet", () => {
    scene(
      aroundSearch,
      given(modifyFields(opened, { connections: () => [{ connection: search, pending: true }] })),
      expect(within(role("main", { name: "Search tools" }), text("Sending…"))).toExist(),
      expect(label("Connection name")).toBeDisabled(),
      expect(role("button", { name: "Save name" })).toBeAbsent(),
      expect(role("button", { name: "Save settings" })).toBeAbsent(),
      expect(role("region", { name: "Check" })).toBeAbsent()
    )
  })

  it("says a connection the workspace does not list isn't there, and offers the list", () => {
    scene(
      { update, view: page(search) },
      given(opened),
      expect(role("main", { name: "Connection" })).toExist(),
      expect(role("heading", { name: "This connection isn't here", level: 2 })).toExist(),
      expect(text("It may have been removed, or you can no longer see it.")).toExist(),
      click(role("button", { name: "Show all connections" })),
      expectOutMessage(OutMessage.RequestedBrowse())
    )
  })

  it("shows nothing before the connections are read", () => {
    scene(
      { update, view: page(search) },
      given(modifyFields(opened, { isLoaded: () => false })),
      expect(role("main", { name: "Connection" })).toExist(),
      expect(role("heading", { name: "This connection isn't here" })).toBeAbsent()
    )
  })

  it("keeps what the person changed on one connection's page apart from another's", () => {
    scene(
      { update, view: page(search) },
      given(
        modifyFields(withSearch, {
          connections: () => [search, machine].map((connection) => ({ connection, pending: false }))
        })
      ),
      type(label("Connection name"), "Search"),
      click(role("button", { name: "Save name" })),
      Command.expectExact(
        RenameConnection({ ...asMember, connectionId: search.id, name: "Search", expectedName: "Search tools" })
      ),
      Command.resolve(RenameConnection, Message.WroteAction({ written: { _tag: "Rename", connectionId: search.id } }))
    )
    scene(
      { update, view: page(machine) },
      given(
        modifyFields(withSearch, {
          connections: () => [search, machine].map((connection) => ({ connection, pending: false }))
        })
      ),
      expect(label("Connection name")).toHaveValue("This machine")
    )
  })
})

describe("the connections", () => {
  it("know a member of the workspace by their name once the store reads them", () => {
    const carol = Schema.decodeSync(Member.Member)({
      id: "member-1",
      workspaceId: "workspace-1",
      identity: { _tag: "Human", id: "alice" },
      name: "Alice Cooper",
      status: "active"
    })
    scene(
      {
        update,
        view: withViewInputs(connectionView, { connectionId: search.id, workspaceName: workspace.name })(),
        subscriptions: ConnectionsBlock.subscriptions
      },
      given(modifyFields(opened, { members: () => [], connections: () => [{ connection: search, pending: false }] })),
      Subscription.emit(subscriptions.connections, Message.ReceivedMembers({ members: [carol] })),
      inside(
        role("region", { name: "Details" }),
        expect(text(`Alice Cooper · ${calendarDate(search.createdAt)}`)).toExist()
      )
    )
  })

  it("drop what was shown of a connection that is no longer there", () => {
    scene(
      {
        update,
        view: withViewInputs(connectionView, { connectionId: search.id, workspaceName: workspace.name })(),
        subscriptions: ConnectionsBlock.subscriptions
      },
      given(modifyFields(opened, { connections: () => [{ connection: search, pending: false }] })),
      click(role("button", { name: "Check connection" })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: search.id, health: { status: "healthy" } })
      ),
      expect(role("note", { name: "Working" })).toExist(),
      Subscription.emit(subscriptions.connections, Message.ReceivedConnections({ connections: [] })),
      expect(role("heading", { name: "This connection isn't here", level: 2 })).toExist(),
      Subscription.emit(
        subscriptions.connections,
        Message.ReceivedConnections({ connections: [{ connection: search, pending: false }] })
      ),
      expect(role("note", { name: "Working" })).toBeAbsent(),
      expect(text("Ask MCP server whether this connection works as it is set up.")).toExist()
    )
  })
})
