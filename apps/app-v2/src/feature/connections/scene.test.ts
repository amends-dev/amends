import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Request } from "@amends-dev/core/request"
import { Member } from "@amends-dev/core/workspace"
import { describe, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
import { Option, Schema } from "effect"
import {
  Command,
  Mount,
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
  nth,
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
  art,
  bob,
  connectionReadAs,
  connectionTo,
  grantsOf,
  integrationGiving,
  membership,
  roleOf,
  searchApi
} from "../../../test/fixtures.ts"
import { panelIs } from "../../../test/panelSize.ts"
import { Integrations } from "../../data/connections.ts"
import { calendarDate } from "../../view/time.ts"
import { ConnectionsBlock } from "./block.ts"
import {
  AddConnection,
  CheckConnection,
  ConfigureConnection,
  FocusField,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "./command.ts"
import { Message, type Model, OutMessage, Written } from "./definition.ts"
import { init } from "./init.ts"
import { subscriptions } from "./subscription.ts"
import { update } from "./update.ts"
import { connectionView } from "./view/detail.ts"
import { dialogView } from "./view/dialog.ts"
import { view } from "./view/list.ts"
import { sidebarView } from "./view/sidebar.ts"

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

const listView = withViewInputs(view, { workspaceName: workspace.name, viewport: "Desktop" })()
const phoneListView = withViewInputs(view, { workspaceName: workspace.name, viewport: "Phone" })()

/** The connections as an owner of the workspace reads them, with the integrations the host installs listed. */
const opened: Model = modifyFields(init(workspace.id, member.id).model, {
  isLoaded: () => true,
  members: () => [member, bob],
  integrations: () =>
    Integrations.cases.Loaded.make({ integrations: [modelsApi, searchApi, sandboxApi, harnessApi, chatApi] }),
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
      given(modifyFields(withSeveral, { integrations: () => Integrations.cases.Loading.make({}) })),
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
            Integrations.cases.Loaded.make({
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
      expect(within(role("button", { name: "Search tools, Needs setup" }), text("Needs setup"))).toHaveClass(
        "text-caution-text"
      ),
      expect(within(role("button", { name: "Search tools, Needs setup" }), text("MCP server takes no key"))).toExist(),
      expect(role("button", { name: "Vertex · Research, Unavailable" })).toHaveAttr(
        "aria-description",
        "Integration not installed · API key"
      ),
      expect(within(role("button", { name: "Vertex · Research, Unavailable" }), text("Unavailable"))).toHaveClass(
        "text-danger-text"
      ),
      expect(
        within(
          role("button", { name: "Vertex · Research, Unavailable" }),
          text("Its integration isn’t installed on this host.")
        )
      ).toExist(),
      expect(within(role("button", { name: "Anthropic · Team" }), selector(".tooltip-anchor"))).toBeAbsent()
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
          integrations: () => Integrations.cases.Loading.make({}),
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
      expect(first(all.role("button", { name: /^(amends|Anthropic|Support)/ }))).toHaveAccessibleName("amends")
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
      expect(art("nothing-here")).toExist(),
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
      expect(art("reach")).toExist(),
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
      expect(art("reach")).toExist(),
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

  it("shows rows that stand in for the list, and says so, not even that there are none, until the connections are read", () => {
    scene(
      { update, view: listView },
      given(modifyFields(opened, { isLoaded: () => false })),
      expect(role("status")).toHaveText("Loading connections…"),
      expectAll(all.selector('ul[aria-hidden="true"] li')).toHaveCount(3),
      expect(selector('ul[aria-hidden="true"] li')).toHaveClass("loading-pulse"),
      expect(role("heading", { name: "No connections yet" })).toBeAbsent(),
      expect(label("Search connections")).toBeAbsent(),
      expect(role("main", { name: "Connections" })).toExist()
    )
    scene(
      { update, view: listView },
      given(opened),
      expect(role("status")).toBeAbsent(),
      expect(selector('ul[aria-hidden="true"]')).toBeAbsent()
    )
  })

  it("says why the connections could not be read in place of the list, with the header kept, when none was read", () => {
    scene(
      { update, view: listView, subscriptions: ConnectionsBlock.subscriptions },
      given(modifyFields(opened, { isLoaded: () => false })),
      Subscription.emit(
        subscriptions.connections,
        Message.FailedRead({ error: "This browser could not read the workspace’s copy." })
      ),
      expect(role("main", { name: "Connections" })).toExist(),
      expect(role("heading", { name: "Couldn’t load connections", level: 2 })).toExist(),
      expect(text("This browser could not read the workspace’s copy.")).toExist(),
      expect(art("came-apart")).toExist(),
      expect(role("alert")).toBeAbsent(),
      expect(role("status")).toBeAbsent(),
      expect(role("button", { name: "Try again" })).toBeAbsent(),
      click(role("button", { name: "Retry" })),
      expect(art("came-apart")).toBeAbsent(),
      expect(role("status")).toHaveText("Loading connections…")
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
          integrations: () => Integrations.cases.Failed.make({ error: "The host could not be reached. Try again." })
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
          integrations: () => Integrations.cases.Failed.make({ error: "The host could not be reached. Try again." })
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
        Message.FailedRead({ error: "This browser could not read the workspace’s copy." })
      ),
      expect(text("This browser could not read the workspace’s copy.")).toExist(),
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
    integrations: () => Integrations.cases.Loaded.make({ integrations: [hostedBy, sandboxApi] }),
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
      given(
        modifyFields(withHosted, { integrations: () => Integrations.cases.Loaded.make({ integrations: [sandboxApi] }) })
      ),
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
      given(modifyFields(withHosted, { integrations: () => Integrations.cases.Loading.make({}) })),
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
      expect(within(first(all.role("button", { name: "Hosted, Needs setup" })), text("Needs setup"))).toHaveClass(
        "text-caution-text"
      ),
      expect(within(first(all.role("button", { name: "Hosted, Needs setup" })), text("The key was refused"))).toExist()
    )
    scene(
      { update, view: sidebar() },
      given(
        modifyFields(withHosted, {
          connections: () => [{ connection: connectionReadAs(hosted, { _tag: "Uninstalled" }), pending: false }]
        })
      ),
      expectAll(all.role("button", { name: "Hosted, Unavailable" })).toHaveCount(2),
      expect(within(first(all.role("button", { name: "Hosted, Unavailable" })), text("Unavailable"))).toHaveClass(
        "text-danger-text"
      ),
      expect(
        within(
          first(all.role("button", { name: "Hosted, Unavailable" })),
          text("Its integration isn’t installed on this host.")
        )
      ).toExist()
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
    ["unauthorized", "Key refused", "The system refused this connection’s key.", "bg-danger-mark", undefined],
    [
      "misconfigured",
      "Settings don’t work",
      "The settings lead nowhere this integration works.",
      "bg-danger-mark",
      undefined
    ],
    [
      "unavailable",
      "Couldn’t reach it",
      "The system didn’t answer. It may answer later.",
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
      expect(text("The connection couldn’t be checked. Try again when the host is available.")).toExist(),
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
      expect(text("This integration isn’t installed on this host anymore.")).toExist(),
      click(role("button", { name: "Refresh" })),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      expect(text("This integration isn’t installed on this host anymore.")).toBeAbsent(),
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
      expect(text("The name couldn’t be saved. Try again when the host is available.")).toExist(),
      click(role("button", { name: "Save name" })),
      Command.resolve(RenameConnection, Message.WroteAction({ written: { _tag: "Rename", connectionId: search.id } })),
      expect(text("The name couldn’t be saved. Try again when the host is available.")).toBeAbsent(),
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
      expect(text("The settings couldn’t be saved. Try again when the host is available.")).toExist(),
      expect(label("Server URL")).toHaveValue("https://search.example.com/v2/mcp"),
      click(role("button", { name: "Save settings" })),
      Command.resolve(
        ConfigureConnection,
        Message.WroteAction({ written: { _tag: "Configure", connectionId: search.id } })
      ),
      expect(text("The settings couldn’t be saved. Try again when the host is available.")).toBeAbsent()
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
        role("note", { name: "Its integration isn’t installed on this host" }),
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
      expect(role("heading", { name: "This connection isn’t here", level: 2 })).toExist(),
      expect(art("lost-thread")).toExist(),
      expect(text("It may have been removed, or you can no longer see it.")).toExist(),
      click(role("button", { name: "Show all connections" })),
      expectOutMessage(OutMessage.RequestedBrowse())
    )
  })

  it("says the connection is loading until the connections are read, and not that it isn't there", () => {
    scene(
      { update, view: page(search) },
      given(modifyFields(opened, { isLoaded: () => false })),
      expect(role("main", { name: "Connection" })).toExist(),
      expect(role("status")).toHaveText("Loading connection…"),
      expect(role("heading", { name: "This connection isn’t here" })).toBeAbsent()
    )
  })

  it("says why the connections could not be read in place of the connection, when none was read", () => {
    scene(
      { update, view: page(search) },
      given(
        modifyFields(opened, {
          isLoaded: () => false,
          notice: () => Option.some("This browser could not read the workspace’s copy.")
        })
      ),
      expect(role("heading", { name: "Couldn’t load connections", level: 2 })).toExist(),
      expect(art("came-apart")).toExist(),
      expect(role("status")).toBeAbsent(),
      expect(role("heading", { name: "This connection isn’t here" })).toBeAbsent(),
      click(role("button", { name: "Retry" })),
      expect(art("came-apart")).toBeAbsent(),
      expect(role("status")).toHaveText("Loading connection…")
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
      expect(role("heading", { name: "This connection isn’t here", level: 2 })).toExist(),
      Subscription.emit(
        subscriptions.connections,
        Message.ReceivedConnections({ connections: [{ connection: search, pending: false }] })
      ),
      expect(role("note", { name: "Working" })).toBeAbsent(),
      expect(text("Ask MCP server whether this connection works as it is set up.")).toExist()
    )
  })
})

const dialog = withViewInputs(dialogView, { workspaceName: workspace.name })()

/**
 * A view and the dialog for adding a connection, replacing a key, or confirming a removal, which the shell keeps beside
 * it.
 */
const withDialog =
  (inner: typeof listView): typeof listView =>
  (model, h) =>
    h.div([], [inner(model, h), dialog(model, h)])

/** The dialog acknowledged open: its element shown, and the resources it holds acquired. */
const dialogOpened = () =>
  [
    Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
    Mount.resolve(Dialog.test.AcquireResources, DialogBlock.Message.SucceededAcquireResources())
  ] as const

/** The dialog acknowledged closed: its element hidden, and the resources it held released. */
const dialogClosed = () =>
  [
    Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
    Mount.expectEnded(Dialog.test.AcquireResources)
  ] as const

const withSeveralAdded = withDialog(listView)

const chooserDialog = role("dialog", { name: "Add connection" })
const configureDialog = role("dialog", { name: "Configure connection" })

const key = Request.Key.make("key-1")

/** The connection the host makes for the form filled in as the tests do, once the store lists it. */
const created = connectionTo("connection-9", "search-api", "MCP server", "apiKey", {
  url: "https://search.example.com/mcp",
  verbose: false,
  region: "eu"
})

describe("adding a connection", () => {
  it("is offered to a person who may add one once the integrations are listed, in the header and the empty list", () => {
    scene({ update, view: listView }, given(withSeveral), expect(role("button", { name: "Add connection" })).toExist())
    scene(
      { update, view: listView },
      given(modifyFields(opened, { connections: () => [] })),
      expectAll(all.role("button", { name: "Add connection" })).toHaveCount(2)
    )
    for (const hidden of [
      modifyFields(withSeveral, { grants: () => memberGrants }),
      modifyFields(withSeveral, { integrations: () => Integrations.cases.Loading.make({}) }),
      modifyFields(withSeveral, { integrations: () => Integrations.cases.Failed.make({ error: "Unreachable." }) })
    ]) {
      scene(
        { update, view: listView },
        given(hidden),
        expect(role("heading", { name: "Connections", level: 1 })).toExist(),
        expect(role("button", { name: "Add connection" })).toBeAbsent()
      )
    }
  })

  it("calls the button that adds a connection Add on a phone, which opens the same dialog, and Add connection on a wider window", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      expect(within(role("main", { name: "Connections" }), role("button", { name: "Add" }))).toBeAbsent(),
      expect(within(role("main", { name: "Connections" }), role("button", { name: "Add connection" }))).toExist()
    )
    scene(
      { update, view: withDialog(phoneListView) },
      given(withSeveral),
      expect(within(role("main", { name: "Connections" }), role("button", { name: "Add" }))).toExist(),
      expect(role("button", { name: "Add connection" })).toBeAbsent(),
      click(role("button", { name: "Add" })),
      ...dialogOpened(),
      expect(chooserDialog).toExist()
    )

    for (const viewport of ["Tablet", "Desktop", "Split"] as const) {
      scene(
        { update, view: withViewInputs(view, { workspaceName: workspace.name, viewport })() },
        given(withSeveral),
        expect(role("button", { name: "Add connection" })).toExist(),
        expect(role("button", { name: "Add" })).toBeAbsent()
      )
    }
  })

  it("keeps the empty list's button as Add connection on a phone, beside the Add of the header, and offers neither to one who may not", () => {
    scene(
      { update, view: phoneListView },
      given(modifyFields(opened, { connections: () => [] })),
      expect(within(role("main", { name: "Connections" }), role("button", { name: "Add" }))).toExist(),
      expectAll(all.role("button", { name: "Add connection" })).toHaveCount(1)
    )
    scene(
      { update, view: phoneListView },
      given(modifyFields(withSeveral, { grants: () => memberGrants })),
      expect(role("heading", { name: "Connections", level: 1 })).toExist(),
      expect(role("button", { name: "Add" })).toBeAbsent(),
      expect(role("button", { name: "Add connection" })).toBeAbsent()
    )
  })

  it("opens a dialog on the integrations the host installs, with what each gives and how it authenticates", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      expect(chooserDialog).toBeAbsent(),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(
        chooserDialog,
        expect(text("Studio")).toExist(),
        expect(label("Search integrations")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
        expect(role("list", { name: "Integrations" })).toExist(),
        expect(role("button", { name: "Anthropic" })).toHaveAttr("aria-description", "Models · API key"),
        expect(role("button", { name: "MCP server" })).toHaveAttr(
          "aria-description",
          "Tools · API key or no authentication"
        ),
        expect(role("button", { name: "This machine" })).toHaveAttr(
          "aria-description",
          "Sandboxes · No authentication"
        ),
        expect(role("button", { name: "Cancel" })).toExist()
      )
    )
  })

  it("narrows the integrations to what a section of the sidebar gives, when asked from its Create", () => {
    const sidebar = withViewInputs(sidebarView, {
      isListOpen: false,
      openConnectionId: Option.none(),
      isChannelsOpen: false
    })()
    scene(
      { update, view: withDialog(sidebar) },
      given(withSeveral),
      click(role("button", { name: "Add tool connection" })),
      ...dialogOpened(),
      inside(
        role("dialog", { name: "Add tool connection" }),
        expect(role("button", { name: "MCP server" })).toExist(),
        expect(role("button", { name: "Anthropic" })).toBeAbsent(),
        expect(role("button", { name: "This machine" })).toBeAbsent()
      )
    )
    scene(
      { update, view: withDialog(sidebar) },
      given(
        modifyFields(withSeveral, { integrations: () => Integrations.cases.Loaded.make({ integrations: [searchApi] }) })
      ),
      click(role("button", { name: "Add model connection" })),
      ...dialogOpened(),
      inside(
        role("dialog", { name: "Add model connection" }),
        expect(text("No integrations available")).toExist(),
        expect(text("This host installs no integration that gives models.")).toExist(),
        expect(label("Search integrations")).toBeAbsent()
      )
    )
    scene(
      { update, view: withDialog(sidebar) },
      given(
        modifyFields(withSeveral, { integrations: () => Integrations.cases.Loaded.make({ integrations: [searchApi] }) })
      ),
      click(role("button", { name: "Add harness connection" })),
      ...dialogOpened(),
      inside(
        role("dialog", { name: "Add harness connection" }),
        expect(text("This host installs no integration that gives harnesses.")).toExist()
      )
    )
  })

  it("is offered in a section of the sidebar to a person who may add one, but not for the channels", () => {
    const sidebar = withViewInputs(sidebarView, {
      isListOpen: false,
      openConnectionId: Option.none(),
      isChannelsOpen: false
    })()
    scene(
      { update, view: sidebar },
      given(withSeveral),
      expect(role("button", { name: "Add model connection" })).toExist(),
      expect(role("button", { name: "Add tool connection" })).toExist(),
      expect(role("button", { name: "Add sandbox connection" })).toExist(),
      expect(role("button", { name: "Add harness connection" })).toExist(),
      expect(role("button", { name: "Add channel connection" })).toBeAbsent()
    )
    scene(
      { update, view: sidebar },
      given(modifyFields(withSeveral, { grants: () => memberGrants })),
      expect(role("button", { name: "Add model connection" })).toBeAbsent()
    )
  })

  it("lists only the integrations a search matches, in any case, and says when none do, with a way to clear it", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(
        chooserDialog,
        type(label("Search integrations"), "MCP"),
        expect(role("button", { name: "MCP server" })).toExist(),
        expect(role("button", { name: "Anthropic" })).toBeAbsent(),
        type(label("Search integrations"), "ánthropic"),
        expect(role("button", { name: "Anthropic" })).toExist(),
        expect(role("button", { name: "MCP server" })).toBeAbsent(),
        type(label("Search integrations"), "zzz"),
        expect(text("No integrations match “zzz”.")).toExist(),
        expect(role("list", { name: "Integrations" })).toBeAbsent(),
        click(role("button", { name: "Clear search" })),
        expect(role("button", { name: "Anthropic" })).toExist(),
        expect(role("button", { name: "MCP server" })).toExist()
      )
    )
  })

  it("puts Back at the start of the footer of the form and Create connection at its end", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(
        configureDialog,
        expectAll(all.role("button")).toHaveCount(3),
        expect(nth(all.role("button"), 0)).toHaveAccessibleName("Close"),
        expect(nth(all.role("button"), 1)).toHaveAccessibleName("Back"),
        expect(nth(all.role("button"), 2)).toHaveAccessibleName("Create connection"),
        expect(within(selector(".me-auto"), role("button", { name: "Back" }))).toExist(),
        expect(within(selector(".me-auto"), role("button", { name: "Create connection" }))).toBeAbsent()
      )
    )
  })

  it("closes with Cancel, and opens on the integrations again the next time", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, type(label("Search integrations"), "MCP"), click(role("button", { name: "Cancel" }))),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(chooserDialog).toBeAbsent(),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      expect(label("Search integrations")).toHaveValue("")
    )
  })

  it("asks for the connection to the integration chosen: its name from the integration's, its settings, how it authenticates, and its key", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.expectExact(FocusField({ id: "add-connection-name" })),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      expect(chooserDialog).toBeAbsent(),
      inside(
        configureDialog,
        expect(text("MCP server · Tools")).toExist(),
        expect(label("Connection name")).toHaveValue("MCP server"),
        expect(label("Connection name")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
        expect(text("A name your workspace will recognize.")).toExist(),
        expect(label("Server URL")).toHaveValue(""),
        expect(text("Where the MCP server answers over Streamable HTTP.")).toExist(),
        expect(label("Key header · Optional")).toExist(),
        expect(role("switch", { name: "Verbose · Optional" })).toHaveAttr("aria-checked", "false"),
        expect(label("Region · Optional")).toExist(),
        expect(label("Authentication")).toHaveValue("apiKey"),
        expect(label("API key")).toHaveAttr("type", "password"),
        expect(text("Stored securely. Once saved, it cannot be viewed or copied.")).toExist(),
        expect(role("button", { name: "Back" })).toExist(),
        expect(role("button", { name: "Create connection" })).toBeDisabled()
      )
    )
  })

  it("lets the person create the connection once it has a name, the settings that are required, and its key, or no key where it takes none", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(
        configureDialog,
        type(label("Connection name"), "  "),
        type(label("Server URL"), "https://search.example.com/mcp"),
        type(label("API key"), "secret"),
        expect(role("button", { name: "Create connection" })).toBeDisabled(),
        type(label("Connection name"), "Search"),
        expect(role("button", { name: "Create connection" })).toBeEnabled(),
        type(label("API key"), ""),
        expect(role("button", { name: "Create connection" })).toBeDisabled(),
        change(label("Authentication"), "none"),
        expect(label("API key")).toBeAbsent(),
        expect(text("Use this only when the system accepts requests without credentials.")).toExist(),
        expect(role("button", { name: "Create connection" })).toBeEnabled(),
        change(label("Authentication"), "apiKey"),
        expect(label("API key")).toExist(),
        expect(role("button", { name: "Create connection" })).toBeDisabled(),
        type(label("Server URL"), "")
      )
    )
  })

  it("goes back to the integrations it was chosen among, still narrowed to what its section gives", () => {
    const sidebar = withViewInputs(sidebarView, {
      isListOpen: false,
      openConnectionId: Option.none(),
      isChannelsOpen: false
    })()
    scene(
      { update, view: withDialog(sidebar) },
      given(withSeveral),
      click(role("button", { name: "Add tool connection" })),
      ...dialogOpened(),
      inside(role("dialog", { name: "Add tool connection" }), click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(configureDialog, click(role("button", { name: "Back" }))),
      Command.expectExact(FocusField({ id: "search-integrations" })),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      expect(configureDialog).toBeAbsent(),
      inside(
        role("dialog", { name: "Add tool connection" }),
        expect(role("button", { name: "MCP server" })).toExist(),
        expect(role("button", { name: "Anthropic" })).toBeAbsent()
      )
    )
  })

  it("sends the connection once, and shows that it is on its way with nothing to change but waiting", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(
        configureDialog,
        type(label("Server URL"), "https://search.example.com/mcp"),
        type(label("API key"), "secret"),
        click(role("button", { name: "Create connection" }))
      ),
      Command.expectExact(
        AddConnection({
          workspaceId,
          integration: "search-api",
          name: "MCP server",
          auth: "apiKey",
          apiKey: "secret",
          settings: { url: "https://search.example.com/mcp", verbose: false, region: "eu" },
          key: Option.none()
        })
      ),
      inside(
        configureDialog,
        expect(label("Connection name")).toBeDisabled(),
        expect(label("Server URL")).toBeDisabled(),
        expect(label("API key")).toBeDisabled(),
        expect(role("button", { name: "Creating…" })).toBeDisabled(),
        expect(role("button", { name: "Back" })).toBeDisabled()
      ),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "StorageUnavailable", description: Option.none() }
        })
      )
    )
  })

  it("says under the fields why the connection could not be made, keeps them, and sends the same key to try again, but a new one once they change", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(
        configureDialog,
        type(label("Server URL"), "https://search.example.com/mcp"),
        type(label("API key"), "secret"),
        click(role("button", { name: "Create connection" }))
      ),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Failed", description: Option.none() }
        })
      ),
      inside(
        configureDialog,
        expect(
          text("The connection couldn’t be created. Try again when the host is available; it won’t be created twice.")
        ).toExist(),
        expect(label("Server URL")).toHaveValue("https://search.example.com/mcp"),
        expect(label("API key")).toHaveValue("secret"),
        expect(role("button", { name: "Refresh" })).toBeAbsent(),
        click(role("button", { name: "Create connection" }))
      ),
      Command.expectExact(
        AddConnection({
          workspaceId,
          integration: "search-api",
          name: "MCP server",
          auth: "apiKey",
          apiKey: "secret",
          settings: { url: "https://search.example.com/mcp", verbose: false, region: "eu" },
          key: Option.some(key)
        })
      ),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Failed", description: Option.none() }
        })
      ),
      inside(
        configureDialog,
        type(label("Connection name"), "Search"),
        click(role("button", { name: "Create connection" }))
      ),
      Command.expectExact(
        AddConnection({
          workspaceId,
          integration: "search-api",
          name: "Search",
          auth: "apiKey",
          apiKey: "secret",
          settings: { url: "https://search.example.com/mcp", verbose: false, region: "eu" },
          key: Option.none()
        })
      ),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(Request.Key.make("key-2")),
          failure: { action: "Create", reason: "Refused", description: Option.some("No such region.") }
        })
      ),
      inside(configureDialog, expect(text("No such region.")).toExist())
    )
  })

  it("offers Refresh where what the person sees is out of date, which asks the page to list the integrations again", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(
        configureDialog,
        type(label("Server URL"), "https://search.example.com/mcp"),
        type(label("API key"), "secret"),
        click(role("button", { name: "Create connection" }))
      ),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Uninstalled", description: Option.none() }
        })
      ),
      inside(
        configureDialog,
        expect(text("This integration isn’t installed on this host anymore.")).toExist(),
        click(role("button", { name: "Refresh" })),
        expect(text("This integration isn’t installed on this host anymore.")).toBeAbsent()
      ),
      expectOutMessage(OutMessage.RequestedIntegrations())
    )
  })

  it("waits for the store to list the connection the host made, and then closes, checks it, and reports it", () => {
    scene(
      { update, view: withSeveralAdded, subscriptions: ConnectionsBlock.subscriptions },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(
        configureDialog,
        type(label("Server URL"), "https://search.example.com/mcp"),
        type(label("API key"), "secret"),
        click(role("button", { name: "Create connection" }))
      ),
      Command.resolve(AddConnection, Message.AddedConnection({ connectionId: created.id, name: "MCP server" })),
      inside(configureDialog, expect(role("button", { name: "Creating…" })).toBeDisabled()),
      Subscription.emit(
        subscriptions.connections,
        Message.ReceivedConnections({
          connections: [runner, team, support, search, machine, created].map((connection) => ({
            connection,
            pending: false
          }))
        })
      ),
      expectOutMessage(OutMessage.CreatedConnection({ connectionId: created.id, name: "MCP server" })),
      Command.expectHas(CheckConnection({ workspaceId, connectionId: created.id }), Dialog.test.CloseDialog),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: created.id, health: { status: "healthy" } })
      ),
      ...dialogClosed(),
      expect(configureDialog).toBeAbsent()
    )
  })

  it("lets the dialog be closed once the host made the connection, though the store lists it later", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      inside(
        configureDialog,
        type(label("Server URL"), "https://search.example.com/mcp"),
        type(label("API key"), "secret"),
        click(role("button", { name: "Create connection" }))
      ),
      Command.resolve(AddConnection, Message.AddedConnection({ connectionId: created.id, name: "MCP server" })),
      inside(configureDialog, click(role("button", { name: "Close" }))),
      ...dialogClosed(),
      expect(configureDialog).toBeAbsent()
    )
  })
})

describe("replacing a connection's key", () => {
  const replaceDialog = role("dialog", { name: "Replace API key" })
  const withSearch: Model = modifyFields(opened, { connections: () => [{ connection: search, pending: false }] })
  const onPage = withDialog(
    withViewInputs(connectionView, { connectionId: search.id, workspaceName: workspace.name })()
  )

  it("is offered on the page of a connection with a key, to a person who may manage it, while its integration is installed", () => {
    scene(
      { update, view: onPage },
      given(withSearch),
      inside(role("region", { name: "Authentication" }), expect(role("button", { name: "Replace key" })).toExist())
    )
    for (const hidden of [
      modifyFields(withSearch, { grants: () => memberGrants }),
      modifyFields(withSearch, { integrations: () => Integrations.cases.Loading.make({}) }),
      modifyFields(withSearch, {
        connections: () => [{ connection: connectionTo("connection-2", "search-api", "Search tools"), pending: false }]
      })
    ]) {
      scene(
        { update, view: onPage },
        given(hidden),
        inside(role("region", { name: "Authentication" }), expect(role("button", { name: "Replace key" })).toBeAbsent())
      )
    }
  })

  it("asks for the new key, masked, saying the current one stays until it is saved", () => {
    scene(
      { update, view: onPage },
      given(withSearch),
      click(role("button", { name: "Replace key" })),
      ...dialogOpened(),
      inside(
        replaceDialog,
        expect(text("Search tools")).toExist(),
        expect(text("The current key stays in place until the new key is saved.")).toExist(),
        expect(label("New API key")).toHaveAttr("type", "password"),
        expect(label("New API key")).toHaveAttr("data-foldkit-dialog-initial-focus", ""),
        expect(text("Stored securely. Once saved, it cannot be viewed or copied.")).toExist(),
        expect(role("button", { name: "Replace key" })).toBeDisabled(),
        type(label("New API key"), "   "),
        expect(role("button", { name: "Replace key" })).toBeDisabled(),
        type(label("New API key"), "sk-new"),
        expect(role("button", { name: "Replace key" })).toBeEnabled(),
        expect(within(selector(".me-auto"), role("button", { name: "Cancel" }))).toExist(),
        click(role("button", { name: "Cancel" }))
      ),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      click(role("button", { name: "Replace key" })),
      ...dialogOpened(),
      expect(label("New API key")).toHaveValue("")
    )
  })

  it("sends the key, shows that it is on its way, and closes once it is replaced, reporting it", () => {
    scene(
      { update, view: onPage },
      given(withSearch),
      click(role("button", { name: "Replace key" })),
      ...dialogOpened(),
      inside(replaceDialog, type(label("New API key"), "sk-new"), click(role("button", { name: "Replace key" }))),
      Command.expectExact(ReplaceConnectionKey({ workspaceId, connectionId: search.id, apiKey: "sk-new" })),
      inside(
        replaceDialog,
        expect(label("New API key")).toBeDisabled(),
        expect(role("button", { name: "Replacing…" })).toBeDisabled()
      ),
      Command.resolve(ReplaceConnectionKey, Message.ReplacedConnectionKey({ connectionId: search.id })),
      expectOutMessage(OutMessage.ReplacedKey()),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(replaceDialog).toBeAbsent()
    )
  })

  it("says why the key could not be replaced, keeps what was typed, and lets the person send it again", () => {
    scene(
      { update, view: onPage },
      given(withSearch),
      click(role("button", { name: "Replace key" })),
      ...dialogOpened(),
      inside(replaceDialog, type(label("New API key"), "sk-new"), click(role("button", { name: "Replace key" }))),
      Command.resolve(
        ReplaceConnectionKey,
        Message.FailedReplaceConnectionKey({
          connectionId: search.id,
          failure: { action: "ReplaceKey", reason: "Invalid", description: Option.none() }
        })
      ),
      inside(
        replaceDialog,
        expect(text("Enter the key as the system issued it.")).toExist(),
        expect(label("New API key")).toHaveValue("sk-new"),
        type(label("New API key"), "sk-newer"),
        expect(text("Enter the key as the system issued it.")).toBeAbsent(),
        click(role("button", { name: "Replace key" }))
      ),
      Command.resolve(
        ReplaceConnectionKey,
        Message.FailedReplaceConnectionKey({
          connectionId: search.id,
          failure: { action: "ReplaceKey", reason: "Changed", description: Option.none() }
        })
      ),
      inside(
        replaceDialog,
        expect(text("This connection changed meanwhile. Refresh to review it, then try again.")).toExist(),
        click(role("button", { name: "Refresh" }))
      ),
      expectOutMessage(OutMessage.RequestedIntegrations())
    )
  })
})

describe("removing a connection", () => {
  const removeDialog = role("dialog", { name: "Remove connection?" })
  const onPage = (connection: typeof search) =>
    withDialog(withViewInputs(connectionView, { connectionId: connection.id, workspaceName: workspace.name })())
  const withSearch: Model = modifyFields(opened, { connections: () => [{ connection: search, pending: false }] })

  it("is offered on the page of a connection to a person who may manage it, in a section of its own", () => {
    scene(
      { update, view: onPage(search) },
      given(withSearch),
      inside(
        role("region", { name: "Removal" }),
        expect(text("Removing this connection removes it from the workspace, along with its saved key.")).toExist(),
        expect(role("button", { name: "Remove connection" })).toExist()
      )
    )
    scene(
      { update, view: onPage(machine) },
      given(modifyFields(opened, { connections: () => [{ connection: machine, pending: false }] })),
      inside(
        role("region", { name: "Removal" }),
        expect(text("Removing this connection removes it from the workspace.")).toExist()
      )
    )
    scene(
      { update, view: onPage(search) },
      given(modifyFields(withSearch, { grants: () => memberGrants })),
      expect(role("region", { name: "Removal" })).toBeAbsent()
    )
  })

  it("asks to confirm in a dialog that names the connection and says its key goes with it, if it has one", () => {
    scene(
      { update, view: onPage(search) },
      given(withSearch),
      click(role("button", { name: "Remove connection" })),
      ...dialogOpened(),
      inside(
        removeDialog,
        expect(text("Search tools")).toExist(),
        expect(text("Search tools will be removed from the workspace, along with its saved key.")).toExist(),
        expect(within(selector(".me-auto"), role("button", { name: "Cancel" }))).toExist(),
        click(role("button", { name: "Cancel" }))
      ),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(removeDialog).toBeAbsent()
    )
    scene(
      { update, view: onPage(machine) },
      given(modifyFields(opened, { connections: () => [{ connection: machine, pending: false }] })),
      click(role("button", { name: "Remove connection" })),
      ...dialogOpened(),
      inside(removeDialog, expect(text("This machine will be removed from the workspace.")).toExist())
    )
  })

  it("sends the removal once, closes once the store keeps it, and reports the connection by the name it had", () => {
    scene(
      { update, view: onPage(search) },
      given(withSearch),
      click(role("button", { name: "Remove connection" })),
      ...dialogOpened(),
      inside(removeDialog, click(role("button", { name: "Remove connection" }))),
      Command.expectExact(RemoveConnection({ ...asMember, connectionId: search.id })),
      inside(removeDialog, expect(role("button", { name: "Removing…" })).toBeDisabled()),
      Command.resolve(RemoveConnection, Message.WroteAction({ written: Written.Remove({ connectionId: search.id }) })),
      expectOutMessage(OutMessage.RemovedConnection({ name: "Search tools" })),
      Command.expectExact(Dialog.test.CloseDialog),
      ...dialogClosed(),
      expect(removeDialog).toBeAbsent()
    )
  })

  it("says under the confirmation, which stays open, that the connection could not be removed, until it is sent again", () => {
    scene(
      { update, view: onPage(search) },
      given(withSearch),
      click(role("button", { name: "Remove connection" })),
      ...dialogOpened(),
      inside(removeDialog, click(role("button", { name: "Remove connection" }))),
      Command.resolve(
        RemoveConnection,
        Message.FailedWriteAction({ written: Written.Remove({ connectionId: search.id }), reason: "Failed" })
      ),
      inside(
        removeDialog,
        expect(text("The connection couldn’t be removed. Try again when the host is available.")).toExist(),
        click(role("button", { name: "Remove connection" }))
      ),
      Command.resolve(RemoveConnection, Message.WroteAction({ written: Written.Remove({ connectionId: search.id }) })),
      expectOutMessage(OutMessage.RemovedConnection({ name: "Search tools" })),
      ...dialogClosed()
    )
  })
})

describe("the sizes of the connections' dialogs, as @amends-dev/ui gives them", () => {
  it("is regular for choosing an integration, and form for configuring the connection it makes", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      ...panelIs("connections-dialog", "regular"),
      inside(chooserDialog, click(role("button", { name: "MCP server" }))),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      expect(configureDialog).toExist(),
      ...panelIs("connections-dialog", "form")
    )
  })

  it("is compact for replacing a key and for confirming a removal", () => {
    const withSearch: Model = modifyFields(opened, { connections: () => [{ connection: search, pending: false }] })
    const onPage = withDialog(
      withViewInputs(connectionView, { connectionId: search.id, workspaceName: workspace.name })()
    )

    scene(
      { update, view: onPage },
      given(withSearch),
      click(role("button", { name: "Replace key" })),
      ...dialogOpened(),
      ...panelIs("connections-dialog", "compact")
    )
    scene(
      { update, view: onPage },
      given(withSearch),
      click(role("button", { name: "Remove connection" })),
      ...dialogOpened(),
      ...panelIs("connections-dialog", "compact")
    )
  })

  it("draws the Cancel as a secondary button, bordered as the action beside it is", () => {
    scene(
      { update, view: withSeveralAdded },
      given(withSeveral),
      click(role("button", { name: "Add connection" })),
      ...dialogOpened(),
      inside(
        chooserDialog,
        expect(role("button", { name: "Cancel" })).toHaveClass("border-outline"),
        expect(role("button", { name: "Cancel" })).toHaveClass("bg-action-secondary"),
        expect(role("button", { name: "Cancel" })).not.toHaveClass("bg-transparent")
      )
    )
  })
})
