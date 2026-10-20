import { BuiltinRoles } from "@amends-dev/core/authorization"
import { describe, expect, it } from "@effect/vitest"
import { Option } from "effect"
import { Command, expectNoOutMessage, expectOutMessage, given, message, model, story } from "foldkit/story"
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
import { CheckConnection, ConfigureConnection, RenameConnection } from "./command.ts"
import {
  byName,
  checkOf,
  connectionItemsGiving,
  connectionsGiving,
  connectionsOnTab,
  findEdit,
  Integrations,
  isNameChanged,
  isSettingsChanged,
  mayCreate,
  mayManage,
  Message,
  nameDraftOf,
  OutMessage,
  shownConnections
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import { connectionStatus, connectionsMessage, integrationLine, needsRefresh } from "./wording.ts"

const { workspace, member } = membership
const asMember = { workspaceId: workspace.id, memberId: member.id }
const workspaceId = workspace.id

const modelsApi = integrationGiving("anthropic", "Anthropic", ["models"], ["apiKey"])
const sandboxApi = integrationGiving("local", "This machine", ["sandboxes"])

const team = connectionTo("connection-1", "anthropic", "Team", "apiKey")
const search = connectionTo("connection-2", "search-api", "Search", "apiKey", {
  url: "https://search.example.com/mcp",
  verbose: false,
  region: "eu"
})
const machine = connectionTo("connection-3", "local", "Machine")

const unpending = (...connections: ReadonlyArray<typeof team>) =>
  connections.map((connection) => ({ connection, pending: false }))

const listed = init(workspace.id, member.id).model

/** The integrations, the connections, and the grants of an owner, read. */
const read = [
  message(Message.ReceivedIntegrations({ integrations: [modelsApi, searchApi, sandboxApi] })),
  message(Message.ReceivedGrants({ grants: grantsOf([aliceOwns]) })),
  message(Message.ReceivedConnections({ connections: unpending(team, search, machine) }))
] as const

const readAsMember = [
  message(Message.ReceivedIntegrations({ integrations: [modelsApi, searchApi, sandboxApi] })),
  message(Message.ReceivedGrants({ grants: grantsOf([roleOf("assignment-3", member.id, BuiltinRoles.MemberId)]) })),
  message(Message.ReceivedConnections({ connections: unpending(team, search, machine) }))
] as const

describe("the connections", () => {
  it("wait for the page to list the integrations, and keep what it informs them of or why it could not", () => {
    expect(init(workspace.id, member.id).commands ?? []).toEqual([])
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loading())
      }),
      message(Message.FailedLoadIntegrations({ error: "The host could not be reached. Try again." })),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Failed({ error: "The host could not be reached. Try again." }))
      }),
      // Trying again shows they are loading and asks the page to list them again.
      message(Message.ClickedReloadIntegrations()),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      Command.expectNone(),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loading())
      }),
      message(Message.ReceivedIntegrations({ integrations: [searchApi] })),
      model((model) => {
        expect(model.integrations).toEqual(Integrations.Loaded({ integrations: [searchApi] }))
      }),
      // Asking again once they are loaded asks nothing.
      message(Message.ClickedReloadIntegrations()),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("read the connections by name, and say they are read, so that none yet is not said before", () => {
    story(
      update,
      given(listed),
      model((model) => {
        expect(model.isLoaded).toBe(false)
      }),
      message(Message.ReceivedConnections({ connections: unpending(team, search, machine) })),
      model((model) => {
        expect(model.isLoaded).toBe(true)
        expect(model.connections.map(({ connection }) => connection.name)).toEqual(["Machine", "Search", "Team"])
      }),
      message(Message.ReceivedConnections({ connections: [] })),
      model((model) => {
        expect(model.isLoaded).toBe(true)
        expect(model.connections).toEqual([])
      })
    )
    const sameName = connectionTo("connection-0", "local", "Team")
    expect([...unpending(team, sameName)].sort(byName).map(({ connection }) => connection.id)).toEqual([
      "connection-0",
      "connection-1"
    ])
  })

  it("decide who may add connections and who may manage one from the grants they hold", () => {
    story(
      update,
      given(listed),
      ...read,
      model((model) => {
        expect(mayCreate(model)).toBe(true)
        expect(model.connections.every((item) => mayManage(model, item))).toBe(true)
      })
    )
    story(
      update,
      given(listed),
      ...readAsMember,
      model((model) => {
        expect(mayCreate(model)).toBe(false)
        expect(model.connections.some((item) => mayManage(model, item))).toBe(false)
      })
    )
  })

  it("name the members, and keep why a read failed until a write is kept", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedMembers({ members: [member, bob] })),
      model((model) => {
        expect(model.members).toEqual([member, bob])
      }),
      message(Message.FailedRead({ error: "This browser could not read the workspace's copy." })),
      model((model) => {
        expect(model.notice).toEqual(Option.some("This browser could not read the workspace's copy."))
      })
    )
    story(
      update,
      given(modifyFields(listed, { notice: () => Option.some("This browser could not read the workspace's copy.") })),
      ...read,
      message(Message.TypedName({ connectionId: team.id, name: "Anthropic" })),
      message(Message.SubmittedName({ connectionId: team.id })),
      Command.resolve(RenameConnection, Message.WroteAction({ written: { _tag: "Rename", connectionId: team.id } })),
      model((model) => {
        expect(model.notice).toEqual(Option.none())
      })
    )
  })

  it("put each connection on All and on the tab of each thing its integration gives, and name those a search matches", () => {
    story(
      update,
      given(listed),
      ...read,
      model((model) => {
        expect(connectionsOnTab(model, "all").map(({ connection }) => connection.name)).toEqual([
          "Machine",
          "Search",
          "Team"
        ])
        expect(connectionsOnTab(model, "models").map(({ connection }) => connection.name)).toEqual(["Team"])
        expect(connectionsOnTab(model, "tools").map(({ connection }) => connection.name)).toEqual(["Search"])
        expect(connectionsOnTab(model, "channels")).toEqual([])
        expect(connectionItemsGiving(model, "sandboxes").map(({ connection }) => connection.name)).toEqual(["Machine"])
        expect(connectionsGiving(model, "models")).toEqual([[team.id, "Team"]])
        expect(model.browse).toEqual({ tab: "all", query: "" })
      }),
      message(Message.TypedBrowseQuery({ query: " MCP " })),
      model((model) => {
        expect(model.browse).toEqual({ tab: "all", query: " MCP " })
        expect(shownConnections(model).map(({ connection }) => connection.name)).toEqual(["Search"])
      }),
      message(Message.TypedBrowseQuery({ query: "ánthropic" })),
      model((model) => {
        expect(shownConnections(model).map(({ connection }) => connection.name)).toEqual(["Team"])
      }),
      message(Message.ChoseBrowseTab({ tab: "tools" })),
      // Choosing a tab clears the search.
      model((model) => {
        expect(model.browse).toEqual({ tab: "tools", query: "" })
        expect(shownConnections(model).map(({ connection }) => connection.name)).toEqual(["Search"])
      }),
      expectNoOutMessage(),
      Command.expectNone()
    )
  })

  it("list a connection whose integration the host does not install on All alone", () => {
    const gone = connectionReadAs(connectionTo("connection-6", "vertex", "Vertex", "apiKey"), { _tag: "Uninstalled" })
    story(
      update,
      given(listed),
      ...read,
      message(Message.ReceivedConnections({ connections: unpending(team, gone) })),
      model((model) => {
        expect(connectionsOnTab(model, "all").length).toBe(2)
        expect(connectionsOnTab(model, "models").length).toBe(1)
        expect(connectionsGiving(model, "models")).toEqual([[team.id, "Team"]])
      })
    )
  })

  it("ask the page to show the list on a tab when the person browses it, the channels, and a connection's page when they pick one", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedBrowse({ tab: "sandboxes" })),
      expectOutMessage(OutMessage.RequestedBrowse()),
      model((model) => {
        expect(model.browse.tab).toBe("sandboxes")
      }),
      message(Message.ClickedBrowseChannels()),
      expectOutMessage(OutMessage.RequestedChannels()),
      message(Message.ClickedConnection({ connectionId: search.id })),
      expectOutMessage(OutMessage.OpenedConnection({ connectionId: search.id })),
      Command.expectNone()
    )
  })

  it("say how a connection stands, from its readiness and whether a change to it is on its way", () => {
    const needsSetup = connectionReadAs(search, { _tag: "Invalid", description: "MCP server takes no key" })
    const gone = connectionReadAs(team, { _tag: "Uninstalled" })
    expect(connectionStatus({ connection: search, pending: false })).toBeUndefined()
    expect(connectionStatus({ connection: needsSetup, pending: false })).toEqual({
      kind: "attention",
      label: "Needs setup",
      detail: "MCP server takes no key"
    })
    expect(connectionStatus({ connection: gone, pending: false })).toEqual({
      kind: "blocked",
      label: "Unavailable",
      detail: "Its integration isn't installed on this host."
    })
    expect(connectionStatus({ connection: needsSetup, pending: true })).toBeUndefined()
    expect(integrationLine(Option.some(searchApi), { connection: search, pending: false })).toEqual(
      Option.some("MCP server · Tools")
    )
    expect(integrationLine(Option.none(), { connection: gone, pending: false })).toEqual(
      Option.some("Integration not installed")
    )
    expect(integrationLine(Option.none(), { connection: search, pending: false })).toEqual(Option.none())
  })

  it("rename a connection from the name the person typed, trimmed, once, and keep the name until the store keeps it", () => {
    story(
      update,
      given(listed),
      ...read,
      // Nothing to save before the person types.
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.expectNone(),
      message(Message.TypedName({ connectionId: search.id, name: "  Search servers " })),
      model((model) => {
        const item = model.connections.find(({ connection }) => connection.id === search.id)!
        expect(nameDraftOf(model, item)).toBe("  Search servers ")
        expect(isNameChanged(model, item)).toBe(true)
        expect(model.edits).toEqual([
          {
            connectionId: search.id,
            name: Option.some("  Search servers "),
            settings: Option.none(),
            saving: Option.none(),
            failure: Option.none()
          }
        ])
      }),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.expectExact(
        RenameConnection({ ...asMember, connectionId: search.id, name: "Search servers", expectedName: "Search" })
      ),
      model((model) => {
        expect(Option.flatMap(findEdit(model, search.id), (open) => open.saving)).toEqual(Option.some("Rename"))
      }),
      Command.resolve(RenameConnection, Message.WroteAction({ written: { _tag: "Rename", connectionId: search.id } })),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
  })

  it("send what is on its way once: a name, settings, or a check asked for again while it is sent asks nothing", () => {
    const saving = (action: "Rename" | "Configure") => ({
      connectionId: search.id,
      name: Option.some("Search servers"),
      settings: Option.some({ url: "https://search.example.com/v2", keyHeader: "", verbose: false, region: "eu" }),
      saving: Option.some(action),
      failure: Option.none()
    })
    story(
      update,
      given(modifyFields(listed, { edits: () => [saving("Rename")] })),
      ...read,
      message(Message.SubmittedName({ connectionId: search.id })),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.expectNone()
    )
    story(
      update,
      given(modifyFields(listed, { edits: () => [saving("Configure")] })),
      ...read,
      message(Message.SubmittedName({ connectionId: search.id })),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.expectNone()
    )
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedCheck({ connectionId: search.id })),
      Command.expectExact(CheckConnection({ workspaceId, connectionId: search.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: search.id, health: { status: "healthy" } })
      )
    )
    story(
      update,
      given(modifyFields(listed, { checks: () => [{ connectionId: search.id, check: { _tag: "Checking" } }] })),
      ...read,
      message(Message.ClickedCheck({ connectionId: search.id })),
      Command.expectNone()
    )
  })

  it("not rename a connection to a blank name, to the name it has, or by a person who may not, or one that is on its way", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ connectionId: search.id, name: "   " })),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.expectNone(),
      message(Message.TypedName({ connectionId: search.id, name: "Search" })),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.expectNone(),
      // A connection the workspace does not list has no page to type on.
      message(Message.TypedName({ connectionId: team.id, name: "Other" })),
      message(Message.ReceivedConnections({ connections: unpending(search, machine) })),
      message(Message.TypedName({ connectionId: team.id, name: "Anthropic" })),
      message(Message.SubmittedName({ connectionId: team.id })),
      Command.expectNone(),
      model((model) => {
        expect(findEdit(model, team.id)).toEqual(Option.none())
      })
    )
    story(
      update,
      given(listed),
      ...readAsMember,
      message(Message.TypedName({ connectionId: search.id, name: "Search servers" })),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.expectNone()
    )
    story(
      update,
      given(listed),
      ...read,
      message(Message.ReceivedConnections({ connections: [{ connection: search, pending: true }] })),
      message(Message.TypedName({ connectionId: search.id, name: "Search servers" })),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.expectNone()
    )
  })

  it("say under the name why it could not be saved, until the person changes it, and let them save it again", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ connectionId: search.id, name: "Search servers" })),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.resolve(
        RenameConnection,
        Message.FailedWriteAction({ written: { _tag: "Rename", connectionId: search.id }, reason: "Failed" })
      ),
      model((model) => {
        const edit = findEdit(model, search.id)
        expect(Option.flatMap(edit, (open) => open.saving)).toEqual(Option.none())
        expect(Option.flatMap(edit, (open) => open.name)).toEqual(Option.some("Search servers"))
        expect(
          Option.map(
            Option.flatMap(edit, (open) => open.failure),
            connectionsMessage
          )
        ).toEqual(Option.some("The name couldn't be saved. Try again when the host is available."))
      }),
      // Typing the name again says the failure is out of date.
      message(Message.TypedName({ connectionId: search.id, name: "Search server" })),
      model((model) => {
        expect(Option.flatMap(findEdit(model, search.id), (open) => open.failure)).toEqual(Option.none())
      }),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.resolve(
        RenameConnection,
        Message.FailedWriteAction({ written: { _tag: "Rename", connectionId: search.id }, reason: "Invalid" })
      ),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.resolve(RenameConnection, Message.WroteAction({ written: { _tag: "Rename", connectionId: search.id } })),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
  })

  it("send the settings the person edited, as the integration's form makes them, when they changed and are whole", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.expectNone(),
      message(Message.ChangedSetting({ connectionId: search.id, name: "region", value: "us" })),
      message(Message.ChangedSetting({ connectionId: search.id, name: "verbose", value: true })),
      model((model) => {
        const item = model.connections.find(({ connection }) => connection.id === search.id)!
        expect(isSettingsChanged(model, item)).toBe(true)
      }),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.expectExact(
        ConfigureConnection({
          ...asMember,
          connectionId: search.id,
          settings: { url: "https://search.example.com/mcp", verbose: true, region: "us" }
        })
      ),
      model((model) => {
        expect(Option.flatMap(findEdit(model, search.id), (open) => open.saving)).toEqual(Option.some("Configure"))
      }),
      Command.resolve(
        ConfigureConnection,
        Message.WroteAction({ written: { _tag: "Configure", connectionId: search.id } })
      ),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
  })

  it("keep the settings that can't be sent, and the settings that failed, with the reason, until they change", () => {
    story(
      update,
      given(listed),
      ...read,
      // A required setting left empty is not sent.
      message(Message.ChangedSetting({ connectionId: search.id, name: "url", value: "" })),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.expectNone(),
      message(Message.ChangedSetting({ connectionId: search.id, name: "url", value: "https://search.example.com/v2" })),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.resolve(
        ConfigureConnection,
        Message.FailedWriteAction({ written: { _tag: "Configure", connectionId: search.id }, reason: "Failed" })
      ),
      model((model) => {
        const edit = findEdit(model, search.id)
        expect(
          Option.map(
            Option.flatMap(edit, (open) => open.failure),
            connectionsMessage
          )
        ).toEqual(Option.some("The settings couldn't be saved. Try again when the host is available."))
        expect(Option.isSome(Option.flatMap(edit, (open) => open.settings))).toBe(true)
      }),
      message(Message.ChangedSetting({ connectionId: search.id, name: "region", value: "us" })),
      model((model) => {
        expect(Option.flatMap(findEdit(model, search.id), (open) => open.failure)).toEqual(Option.none())
      }),
      // A failure about the name stays while the settings change.
      message(Message.TypedName({ connectionId: search.id, name: "Search servers" })),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.resolve(
        RenameConnection,
        Message.FailedWriteAction({ written: { _tag: "Rename", connectionId: search.id }, reason: "Failed" })
      ),
      message(Message.ChangedSetting({ connectionId: search.id, name: "region", value: "eu" })),
      model((model) => {
        expect(Option.isSome(Option.flatMap(findEdit(model, search.id), (open) => open.failure))).toBe(true)
      })
    )
  })

  it("not send settings of a connection whose integration is not listed, by a person who may not, or on its way", () => {
    story(
      update,
      given(listed),
      message(Message.ReceivedConnections({ connections: unpending(search) })),
      message(Message.ReceivedGrants({ grants: grantsOf([aliceOwns]) })),
      message(Message.ChangedSetting({ connectionId: search.id, name: "region", value: "us" })),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.edits).toEqual([])
      })
    )
    story(
      update,
      given(listed),
      ...readAsMember,
      message(Message.ChangedSetting({ connectionId: search.id, name: "region", value: "us" })),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.expectNone()
    )
  })

  it("check a connection once at a time, show what the check found in place of the last, and refresh what failed", () => {
    story(
      update,
      given(listed),
      ...read,
      model((model) => {
        expect(checkOf(model, search.id)).toEqual(Option.none())
      }),
      message(Message.ClickedCheck({ connectionId: search.id })),
      Command.expectExact(CheckConnection({ workspaceId, connectionId: search.id })),
      model((model) => {
        expect(Option.map(checkOf(model, search.id), (check) => check._tag)).toEqual(Option.some("Checking"))
      }),
      Command.resolve(
        CheckConnection,
        Message.FailedCheckConnection({
          connectionId: search.id,
          failure: { action: "Check", reason: "Changed", description: Option.none() }
        })
      ),
      model((model) => {
        expect(Option.map(checkOf(model, search.id), (check) => check._tag)).toEqual(Option.some("Failed"))
      }),
      // Refreshing drops the failed check and asks the page to list the integrations again.
      message(Message.ClickedRefresh()),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      model((model) => {
        expect(checkOf(model, search.id)).toEqual(Option.none())
      }),
      message(Message.ClickedCheck({ connectionId: search.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: search.id, health: { status: "unavailable" } })
      ),
      model((model) => {
        expect(checkOf(model, search.id)).toEqual(Option.some({ _tag: "Checked", health: { status: "unavailable" } }))
      }),
      // Refreshing keeps what a check found.
      message(Message.ClickedRefresh()),
      model((model) => {
        expect(Option.map(checkOf(model, search.id), (check) => check._tag)).toEqual(Option.some("Checked"))
      })
    )
  })

  it("not check a connection for a person who may not manage it, and drop what was kept of one that is gone", () => {
    story(
      update,
      given(listed),
      ...readAsMember,
      message(Message.ClickedCheck({ connectionId: search.id })),
      Command.expectNone()
    )
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedCheck({ connectionId: team.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: team.id, health: { status: "healthy" } })
      ),
      message(Message.ClickedCheck({ connectionId: search.id })),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: search.id, health: { status: "healthy" } })
      ),
      message(Message.TypedName({ connectionId: team.id, name: "Anthropic" })),
      message(Message.ReceivedConnections({ connections: unpending(search, machine) })),
      model((model) => {
        expect(checkOf(model, team.id)).toEqual(Option.none())
        expect(findEdit(model, team.id)).toEqual(Option.none())
        expect(Option.isSome(checkOf(model, search.id))).toBe(true)
      })
    )
  })

  it("word a failure for the action it was about, and say which need the person to refresh", () => {
    expect(connectionsMessage({ action: "Check", reason: "Uninstalled", description: Option.none() })).toBe(
      "This integration isn't installed on this host anymore."
    )
    expect(
      connectionsMessage({ action: "Configure", reason: "Refused", description: Option.some("No such region.") })
    ).toBe("No such region.")
    expect(connectionsMessage({ action: "Configure", reason: "Refused", description: Option.none() })).toBe(
      "The integration refuses these settings. Check them, then try again."
    )
    expect(connectionsMessage({ action: "Create", reason: "Gone", description: Option.none() })).toBe(
      "This workspace is no longer available to you."
    )
    expect(connectionsMessage({ action: "Remove", reason: "Gone", description: Option.none() })).toBe(
      "This connection is no longer available. Refresh to see the latest."
    )
    expect(connectionsMessage({ action: "Create", reason: "StorageUnavailable", description: Option.none() })).toBe(
      "This host keeps no keys. Ask your administrator to enable credential storage, then try again."
    )
    expect((["Changed", "Denied", "Gone", "Uninstalled"] as const).every((reason) => needsRefresh(reason))).toBe(true)
    expect(
      (["Invalid", "Failed", "Refused", "StorageUnavailable"] as const).some((reason) => needsRefresh(reason))
    ).toBe(false)
  })
})
