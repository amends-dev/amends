import { BuiltinRoles } from "@amends-dev/core/authorization"
import { Request } from "@amends-dev/core/request"
import { describe, expect, it } from "@effect/vitest"
import { Dialog, DialogBlock } from "@foldkit/ui"
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
import {
  AddConnection,
  CheckConnection,
  ConfigureConnection,
  FocusField,
  RemoveConnection,
  RenameConnection,
  ReplaceConnectionKey
} from "./command.ts"
import { DialogBinding } from "./composition.ts"
import {
  Adding,
  byName,
  checkOf,
  configuringOf,
  connectionItemsGiving,
  connectionsGiving,
  connectionsOnTab,
  findEdit,
  integrationsToAdd,
  Integrations,
  isDialogBusy,
  isNameChanged,
  isSettingsChanged,
  mayAdd,
  mayCreate,
  mayManage,
  Message,
  nameDraftOf,
  OutMessage,
  settingsToAdd,
  shownConnections,
  shownIntegrations,
  startConfiguring,
  Written
} from "./definition.ts"
import { init } from "./init.ts"
import { update } from "./update.ts"
import {
  addLabel,
  authOptionsLabel,
  connectionsMessage,
  connectionsToast,
  connectionStatus,
  integrationLine,
  needsRefresh
} from "./wording.ts"

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

/** What the dialog reports, as the connections receive it. */
const fromDialog = (message: typeof DialogBlock.Message.Type) =>
  DialogBinding.embedView({
    slotId: "dialog",
    model: listed.dialog,
    viewInputs: { toView: () => null }
  }).toParentMessage(message)

const key = Request.Key.make("key-1")

const created = connectionTo("connection-9", "search-api", "MCP server", "apiKey", {
  url: "https://search.example.com/mcp",
  verbose: false,
  region: "eu"
})

const dialogShown = Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())

/** The dialog asked for on the integrations, among all or those that give `capability`. */
const choosingDialog = (capability: Option.Option<"models" | "tools" | "sandboxes" | "harnesses" | "channels">) =>
  [message(Message.ClickedAdd({ capability })), dialogShown] as const

/** The dialog on the form that adds a connection through the search server, filled in as the tests do. */
const filledIn = [
  ...choosingDialog(Option.none()),
  message(Message.ChoseIntegration({ integrationId: "search-api" })),
  Command.resolve(FocusField, Message.CompletedFocusField()),
  message(Message.ChangedAddingSetting({ name: "url", value: "https://search.example.com/mcp" })),
  message(Message.TypedApiKey({ apiKey: "secret" }))
] as const

const addSearchArgs = {
  workspaceId,
  integration: "search-api",
  name: "MCP server",
  auth: "apiKey",
  apiKey: "secret",
  settings: { url: "https://search.example.com/mcp", verbose: false, region: "eu" },
  key: Option.none()
} as const

const addSearch = AddConnection(addSearchArgs)

describe("adding a connection", () => {
  it("is for a person who may create connections once the host listed its integrations", () => {
    story(
      update,
      given(listed),
      ...read,
      model((model) => {
        expect(mayAdd(model)).toBe(true)
      })
    )
    story(
      update,
      given(listed),
      message(Message.ReceivedGrants({ grants: grantsOf([aliceOwns]) })),
      model((model) => {
        expect(mayCreate(model)).toBe(true)
        expect(mayAdd(model)).toBe(false)
      }),
      message(Message.FailedLoadIntegrations({ error: "Unreachable." })),
      model((model) => {
        expect(mayAdd(model)).toBe(false)
      })
    )
    story(
      update,
      given(listed),
      ...readAsMember,
      model((model) => {
        expect(mayAdd(model)).toBe(false)
      })
    )
  })

  it("opens the dialog on the integrations, among those a section gives when it asked, and not twice, nor for a person who may not", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.ClickedAdd({ capability: Option.some("tools") })),
      dialogShown,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.adding).toEqual(Option.some(Adding.Choosing({ capability: Option.some("tools"), query: "" })))
        expect(model.replacing).toEqual(Option.none())
        expect(model.removing).toEqual(Option.none())
      }),
      // Asking while it is open changes nothing.
      message(Message.ClickedAdd({ capability: Option.none() })),
      Command.expectNone(),
      model((model) => {
        expect(model.adding).toEqual(Option.some(Adding.Choosing({ capability: Option.some("tools"), query: "" })))
      })
    )
    story(
      update,
      given(listed),
      ...readAsMember,
      message(Message.ClickedAdd({ capability: Option.none() })),
      Command.expectNone(),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
      })
    )
  })

  it("names what adds a connection after what a section gives", () => {
    expect(addLabel(Option.none())).toBe("Add connection")
    expect(addLabel(Option.some("models"))).toBe("Add model connection")
    expect(addLabel(Option.some("sandboxes"))).toBe("Add sandbox connection")
    expect(authOptionsLabel(["apiKey"])).toBe("API key")
    expect(authOptionsLabel(["apiKey", "none"])).toBe("API key or no authentication")
  })

  it("lists the integrations to add through: those that give what was asked for, whose name or ID matches the search", () => {
    story(
      update,
      given(listed),
      ...read,
      ...choosingDialog(Option.none()),
      model((model) => {
        expect(integrationsToAdd(model, Option.none()).map(({ id }) => id)).toEqual([
          "anthropic",
          "search-api",
          "local"
        ])
        expect(integrationsToAdd(model, Option.some("tools")).map(({ id }) => id)).toEqual(["search-api"])
        expect(integrationsToAdd(model, Option.some("channels"))).toEqual([])
      }),
      message(Message.TypedIntegrationQuery({ query: " ÁNTHROP " })),
      model((model) => {
        const choosing = Option.getOrThrow(model.adding)
        expect(
          Adding.isAnyOf(["Choosing"])(choosing) && shownIntegrations(model, choosing).map(({ id }) => id)
        ).toEqual(["anthropic"])
      }),
      message(Message.TypedIntegrationQuery({ query: "SEARCH-API" })),
      model((model) => {
        const choosing = Option.getOrThrow(model.adding)
        expect(
          Adding.isAnyOf(["Choosing"])(choosing) && shownIntegrations(model, choosing).map(({ id }) => id)
        ).toEqual(["search-api"])
      })
    )
  })

  it("starts the form on the integration chosen: its name, its settings on their defaults, and its first way of authenticating", () => {
    story(
      update,
      given(listed),
      ...read,
      ...choosingDialog(Option.some("tools")),
      message(Message.ChoseIntegration({ integrationId: "search-api" })),
      Command.expectExact(FocusField({ id: "add-connection-name" })),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      model((model) => {
        expect(model.adding).toEqual(Option.some(startConfiguring(searchApi, Option.some("tools"))))
        expect(model.adding).toMatchObject(
          Option.some({
            _tag: "Configuring",
            integrationId: "search-api",
            name: "MCP server",
            auth: "apiKey",
            apiKey: "",
            settings: { url: "", verbose: false, region: "eu" },
            key: Option.none(),
            failure: Option.none(),
            creating: Option.none()
          })
        )
      })
    )
  })

  it("chooses no integration that is not among those it lists, nor when it is not choosing", () => {
    story(
      update,
      given(listed),
      ...read,
      ...choosingDialog(Option.some("models")),
      message(Message.ChoseIntegration({ integrationId: "search-api" })),
      Command.expectNone(),
      message(Message.ChoseIntegration({ integrationId: "vertex" })),
      Command.expectNone(),
      model((model) => {
        expect(Option.exists(model.adding, Adding.isAnyOf(["Choosing"]))).toBe(true)
      })
    )
    story(
      update,
      given(listed),
      ...read,
      message(Message.ChoseIntegration({ integrationId: "search-api" })),
      Command.expectNone(),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
      })
    )
  })

  it("goes back from the form to the integrations it came from, forgetting the form", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(Message.ClickedBack()),
      Command.expectExact(FocusField({ id: "search-integrations" })),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      model((model) => {
        expect(model.adding).toEqual(Option.some(Adding.Choosing({ capability: Option.none(), query: "" })))
      }),
      // There is nowhere to go back to from the integrations.
      message(Message.ClickedBack()),
      Command.expectNone()
    )
  })

  it("sends nothing until the form has a name, the settings that are required, and its key, or none where it takes none", () => {
    story(
      update,
      given(listed),
      ...read,
      ...choosingDialog(Option.none()),
      message(Message.ChoseIntegration({ integrationId: "search-api" })),
      Command.resolve(FocusField, Message.CompletedFocusField()),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      message(Message.ChangedAddingSetting({ name: "url", value: "https://search.example.com/mcp" })),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      message(Message.TypedApiKey({ apiKey: "  " })),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      message(Message.TypedApiKey({ apiKey: "secret" })),
      model((model) => {
        const configuring = Option.getOrThrow(configuringOf(model))
        expect(Option.isSome(settingsToAdd(searchApi, configuring))).toBe(true)
      }),
      message(Message.TypedAddingName({ name: "   " })),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      message(Message.TypedAddingName({ name: "Search" })),
      message(Message.ChoseAuth({ auth: "none" })),
      message(Message.TypedApiKey({ apiKey: "" })),
      message(Message.SubmittedAdding()),
      Command.expectExact(
        AddConnection({
          workspaceId,
          integration: "search-api",
          name: "Search",
          auth: "none",
          apiKey: "",
          settings: { url: "https://search.example.com/mcp", verbose: false, region: "eu" },
          key: Option.none()
        })
      ),
      Command.resolve(AddConnection, Message.AddedConnection({ connectionId: created.id, name: "Search" }))
    )
  })

  it("sends the connection once, with its name trimmed and what the settings make, and says it is on its way", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(Message.TypedAddingName({ name: " MCP server " })),
      message(Message.ChangedAddingSetting({ name: "verbose", value: true })),
      message(Message.SubmittedAdding()),
      Command.expectExact(
        AddConnection({
          workspaceId,
          integration: "search-api",
          name: "MCP server",
          auth: "apiKey",
          apiKey: "secret",
          settings: { url: "https://search.example.com/mcp", verbose: true, region: "eu" },
          key: Option.none()
        })
      ),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(
          Option.some({ creating: Option.some({ name: "MCP server", connectionId: Option.none() }) })
        )
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Failed", description: Option.none() }
        })
      )
    )
  })

  it("does not send the connection again while its request is on its way, nor change what was sent", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(Message.SubmittedAdding()),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Failed", description: Option.none() }
        })
      )
    )
    const sending = modifyFields(listed, {
      isLoaded: () => true,
      integrations: () => Integrations.Loaded({ integrations: [searchApi] }),
      grants: () => grantsOf([aliceOwns]),
      adding: () =>
        Option.some(
          Adding.Configuring({
            ...startConfiguring(searchApi, Option.none()),
            settings: { url: "https://search.example.com/mcp", verbose: false, region: "eu" },
            apiKey: "secret",
            creating: Option.some({ name: "MCP server", connectionId: Option.none() })
          })
        )
    })
    story(
      update,
      given(sending),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      message(Message.TypedAddingName({ name: "Other" })),
      message(Message.ClickedBack()),
      Command.expectNone(),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(Option.some({ name: "MCP server" }))
      })
    )
  })

  it("keeps what failed with the key it was sent under, and sends the same key to try again, until the form changes", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(Message.SubmittedAdding()),
      Command.expectExact(addSearch),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Failed", description: Option.none() }
        })
      ),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(
          Option.some({
            key: Option.some(key),
            creating: Option.none(),
            failure: Option.some({ action: "Create", reason: "Failed", description: Option.none() })
          })
        )
        expect(isDialogBusy(model)).toBe(false)
      }),
      message(Message.SubmittedAdding()),
      Command.expectExact(AddConnection({ ...addSearchArgs, key: Option.some(key) })),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Refused", description: Option.some("No such region.") }
        })
      ),
      // What the person changes is not what the key was sent for: it and the failure are dropped.
      message(Message.ChangedAddingSetting({ name: "region", value: "us" })),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(Option.some({ key: Option.none(), failure: Option.none() }))
      }),
      message(Message.SubmittedAdding()),
      Command.expectExact(
        AddConnection({
          ...addSearchArgs,
          settings: { url: "https://search.example.com/mcp", verbose: false, region: "us" },
          key: Option.none()
        })
      ),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(Request.Key.make("key-2")),
          failure: { action: "Create", reason: "Failed", description: Option.none() }
        })
      ),
      message(Message.TypedAddingName({ name: "Search" })),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(Option.some({ key: Option.none(), failure: Option.none() }))
      }),
      message(Message.TypedApiKey({ apiKey: "other" })),
      message(Message.ChoseAuth({ auth: "none" })),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(Option.some({ auth: "none", apiKey: "other" }))
      })
    )
  })

  it("says the integration is no longer listed when it was removed from the host meanwhile, and sends nothing", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(Message.ReceivedIntegrations({ integrations: [modelsApi] })),
      message(Message.SubmittedAdding()),
      Command.expectNone(),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(
          Option.some({ failure: Option.some({ action: "Create", reason: "Uninstalled", description: Option.none() }) })
        )
      })
    )
  })

  it("waits for the connection the host made to be listed, and then closes, checks it, and reports it", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(Message.SubmittedAdding()),
      Command.resolve(AddConnection, Message.AddedConnection({ connectionId: created.id, name: "MCP server" })),
      expectNoOutMessage(),
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(configuringOf(model)).toMatchObject(
          Option.some({ creating: Option.some({ name: "MCP server", connectionId: Option.some(created.id) }) })
        )
        // The host made it, so the dialog may be closed meanwhile.
        expect(isDialogBusy(model)).toBe(false)
      }),
      message(Message.ReceivedConnections({ connections: unpending(team, search, machine, created) })),
      expectOutMessage(OutMessage.CreatedConnection({ connectionId: created.id, name: "MCP server" })),
      Command.expectHas(Dialog.test.CloseDialog, CheckConnection({ workspaceId, connectionId: created.id })),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
        expect(Option.map(checkOf(model, created.id), (check) => check._tag)).toEqual(Option.some("Checking"))
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: created.id, health: { status: "healthy" } })
      )
    )
  })

  it("finishes at once when the store already lists the connection the host made", () => {
    const sending = modifyFields(listed, {
      isLoaded: () => true,
      integrations: () => Integrations.Loaded({ integrations: [searchApi] }),
      grants: () => grantsOf([aliceOwns]),
      connections: () => unpending(team, search, machine, created),
      dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
      adding: () =>
        Option.some(
          Adding.Configuring({
            ...startConfiguring(searchApi, Option.none()),
            creating: Option.some({ name: "MCP server", connectionId: Option.none() })
          })
        )
    })
    story(
      update,
      given(sending),
      message(Message.AddedConnection({ connectionId: created.id, name: "MCP server" })),
      expectOutMessage(OutMessage.CreatedConnection({ connectionId: created.id, name: "MCP server" })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(
        CheckConnection,
        Message.CheckedConnection({ connectionId: created.id, health: { status: "healthy" } })
      ),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
      })
    )
  })

  it("closes the dialog when the person closes it, forgetting the form, except while the request is on its way", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.adding).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      // Sending a form that is not open sends nothing.
      message(Message.SubmittedAdding()),
      Command.expectNone()
    )
    const sending = modifyFields(listed, {
      dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
      adding: () =>
        Option.some(
          Adding.Configuring({
            ...startConfiguring(searchApi, Option.none()),
            creating: Option.some({ name: "MCP server", connectionId: Option.none() })
          })
        )
    })
    story(
      update,
      given(sending),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.expectHas(Dialog.test.CloseDialog, Dialog.test.ShowDialog),
      model((model) => {
        expect(Option.isSome(model.adding)).toBe(true)
        expect(model.dialog.isOpen).toBe(true)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog()),
      message(
        Message.FailedAddConnection({
          key: Option.none(),
          failure: { action: "Create", reason: "Failed", description: Option.none() }
        })
      ),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(Option.some({ creating: Option.none() }))
        expect(model.dialog.isOpen).toBe(true)
      })
    )
  })

  it("drops the failures the dialog shows when the person refreshes, and asks the page to list the integrations again", () => {
    story(
      update,
      given(listed),
      ...read,
      ...filledIn,
      message(Message.SubmittedAdding()),
      Command.resolve(
        AddConnection,
        Message.FailedAddConnection({
          key: Option.some(key),
          failure: { action: "Create", reason: "Uninstalled", description: Option.none() }
        })
      ),
      message(Message.ClickedRefresh()),
      expectOutMessage(OutMessage.RequestedIntegrations()),
      model((model) => {
        expect(configuringOf(model)).toMatchObject(Option.some({ failure: Option.none(), key: Option.some(key) }))
      })
    )
  })
})

describe("replacing a connection's key", () => {
  const onSearch = [...read, message(Message.ClickedReplaceKey({ connectionId: search.id })), dialogShown] as const

  /** The dialog on the key being replaced, whose request is on its way. */
  const sendingKey = modifyFields(listed, {
    isLoaded: () => true,
    integrations: () => Integrations.Loaded({ integrations: [modelsApi, searchApi, sandboxApi] }),
    grants: () => grantsOf([aliceOwns]),
    connections: () => unpending(team, search, machine),
    dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
    replacing: () =>
      Option.some({
        connectionId: search.id,
        name: "Search",
        apiKey: "sk-new",
        isSending: true,
        failure: Option.none()
      })
  })

  it("opens the dialog on a blank key for a connection that has one, where the person may manage it", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      model((model) => {
        expect(model.dialog.isOpen).toBe(true)
        expect(model.replacing).toEqual(
          Option.some({ connectionId: search.id, name: "Search", apiKey: "", isSending: false, failure: Option.none() })
        )
        expect(model.adding).toEqual(Option.none())
      })
    )
    for (const [grants, id] of [
      [readAsMember, search.id],
      [read, machine.id],
      [read, "connection-404"]
    ] as const) {
      story(
        update,
        given(listed),
        ...grants,
        message(Message.ClickedReplaceKey({ connectionId: id as typeof search.id })),
        Command.expectNone(),
        model((model) => {
          expect(model.replacing).toEqual(Option.none())
        })
      )
    }
  })

  it("keeps what the person types, and sends it as the key, which cannot be changed while it is on its way", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      message(Message.TypedNewKey({ apiKey: "sk-new" })),
      model((model) => {
        expect(model.replacing).toMatchObject(Option.some({ apiKey: "sk-new" }))
      }),
      message(Message.SubmittedNewKey()),
      Command.expectExact(ReplaceConnectionKey({ workspaceId, connectionId: search.id, apiKey: "sk-new" })),
      model((model) => {
        expect(model.replacing).toMatchObject(Option.some({ apiKey: "sk-new", isSending: true }))
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(ReplaceConnectionKey, Message.ReplacedConnectionKey({ connectionId: search.id })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
    story(
      update,
      given(sendingKey),
      message(Message.TypedNewKey({ apiKey: "other" })),
      message(Message.SubmittedNewKey()),
      Command.expectNone(),
      model((model) => {
        expect(model.replacing).toMatchObject(Option.some({ apiKey: "sk-new", isSending: true }))
      })
    )
  })

  it("sends nothing for a blank key, nor a second time, nor for a connection that is gone", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      message(Message.SubmittedNewKey()),
      Command.expectNone(),
      message(Message.TypedNewKey({ apiKey: "   " })),
      message(Message.SubmittedNewKey()),
      Command.expectNone(),
      message(Message.TypedNewKey({ apiKey: "sk-new" })),
      message(Message.SubmittedNewKey()),
      Command.resolve(
        ReplaceConnectionKey,
        Message.FailedReplaceConnectionKey({
          connectionId: search.id,
          failure: { action: "ReplaceKey", reason: "Gone", description: Option.none() }
        })
      ),
      message(Message.ReceivedConnections({ connections: unpending(team, machine) })),
      model((model) => {
        // Closed, since the connection is not there.
        expect(model.replacing).toEqual(Option.none())
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      message(Message.SubmittedNewKey()),
      Command.expectNone()
    )
  })

  it("closes and reports once the key is replaced, and says why it could not be, keeping what was typed", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      message(Message.TypedNewKey({ apiKey: "sk-new" })),
      message(Message.SubmittedNewKey()),
      Command.resolve(
        ReplaceConnectionKey,
        Message.FailedReplaceConnectionKey({
          connectionId: search.id,
          failure: { action: "ReplaceKey", reason: "Invalid", description: Option.none() }
        })
      ),
      model((model) => {
        expect(model.replacing).toMatchObject(
          Option.some({
            apiKey: "sk-new",
            isSending: false,
            failure: Option.some({ action: "ReplaceKey", reason: "Invalid", description: Option.none() })
          })
        )
      }),
      message(Message.TypedNewKey({ apiKey: "sk-newer" })),
      model((model) => {
        expect(model.replacing).toMatchObject(Option.some({ failure: Option.none() }))
      }),
      message(Message.SubmittedNewKey()),
      Command.resolve(ReplaceConnectionKey, Message.ReplacedConnectionKey({ connectionId: search.id })),
      expectOutMessage(OutMessage.ReplacedKey()),
      Command.expectExact(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.replacing).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("is not closed by an answer about another connection", () => {
    story(
      update,
      given(sendingKey),
      message(Message.ReplacedConnectionKey({ connectionId: team.id })),
      expectNoOutMessage(),
      Command.expectNone(),
      model((model) => {
        expect(Option.isSome(model.replacing)).toBe(true)
      }),
      message(
        Message.FailedReplaceConnectionKey({
          connectionId: team.id,
          failure: { action: "ReplaceKey", reason: "Failed", description: Option.none() }
        })
      ),
      model((model) => {
        expect(model.replacing).toMatchObject(Option.some({ isSending: true, failure: Option.none() }))
      })
    )
  })
})

describe("removing a connection", () => {
  const onSearch = [...read, message(Message.ClickedRemove({ connectionId: search.id })), dialogShown] as const

  it("opens the confirmation for a connection the person may manage, which says whether its key goes with it", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      model((model) => {
        expect(model.removing).toEqual(
          Option.some({
            connectionId: search.id,
            name: "Search",
            hasKey: true,
            isSending: false,
            failure: Option.none()
          })
        )
      }),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      message(Message.ClickedRemove({ connectionId: machine.id })),
      dialogShown,
      model((model) => {
        expect(model.removing).toMatchObject(Option.some({ connectionId: machine.id, hasKey: false }))
      })
    )
    story(
      update,
      given(listed),
      ...readAsMember,
      message(Message.ClickedRemove({ connectionId: search.id })),
      Command.expectNone(),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
      })
    )
  })

  it("sends the removal once as an action, and closes and reports it with the name the connection had", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      message(Message.ConfirmedRemoval()),
      Command.expectExact(RemoveConnection({ ...asMember, connectionId: search.id })),
      model((model) => {
        expect(model.removing).toMatchObject(Option.some({ isSending: true }))
        expect(isDialogBusy(model)).toBe(true)
      }),
      Command.resolve(RemoveConnection, Message.WroteAction({ written: Written.Remove({ connectionId: search.id }) })),
      expectOutMessage(OutMessage.RemovedConnection({ name: "Search" })),
      Command.expectExact(Dialog.test.CloseDialog),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
        expect(model.dialog.isOpen).toBe(false)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
    story(update, given(listed), ...read, message(Message.ConfirmedRemoval()), Command.expectNone())
  })

  it("says under the confirmation, which stays open, that the connection could not be removed, until it is sent again", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      message(Message.ConfirmedRemoval()),
      Command.resolve(
        RemoveConnection,
        Message.FailedWriteAction({ written: Written.Remove({ connectionId: search.id }), reason: "Failed" })
      ),
      model((model) => {
        expect(model.removing).toMatchObject(
          Option.some({
            isSending: false,
            failure: Option.some({ action: "Remove", reason: "Failed", description: Option.none() })
          })
        )
        expect(model.dialog.isOpen).toBe(true)
      }),
      message(Message.ConfirmedRemoval()),
      Command.resolve(RemoveConnection, Message.WroteAction({ written: Written.Remove({ connectionId: search.id }) })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog())
    )
  })

  it("closes the confirmation of a connection somebody else removed, unless the person's own request is on its way", () => {
    story(
      update,
      given(listed),
      ...onSearch,
      message(Message.ReceivedConnections({ connections: unpending(team, machine) })),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      model((model) => {
        expect(model.removing).toEqual(Option.none())
      })
    )
    story(
      update,
      given(
        modifyFields(listed, {
          dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
          removing: () =>
            Option.some({
              connectionId: search.id,
              name: "Search",
              hasKey: true,
              isSending: true,
              failure: Option.none()
            })
        })
      ),
      message(Message.ReceivedConnections({ connections: unpending(team, machine) })),
      Command.expectNone(),
      model((model) => {
        expect(Option.isSome(model.removing)).toBe(true)
      })
    )
  })

  it("keeps the dialog open on the request on its way when the person closes it then, and lets it close when it is not", () => {
    story(
      update,
      given(
        modifyFields(listed, {
          dialog: (dialog) => modifyFields(dialog, { isOpen: () => true }),
          removing: () =>
            Option.some({
              connectionId: search.id,
              name: "Search",
              hasKey: true,
              isSending: true,
              failure: Option.none()
            })
        })
      ),
      message(fromDialog(DialogBlock.Message.RequestedClose())),
      Command.expectHas(Dialog.test.CloseDialog, Dialog.test.ShowDialog),
      model((model) => {
        expect(Option.isSome(model.removing)).toBe(true)
      }),
      Command.resolve(Dialog.test.CloseDialog, DialogBlock.Message.CompletedCloseDialog()),
      Command.resolve(Dialog.test.ShowDialog, DialogBlock.Message.SucceededShowDialog())
    )
  })
})

describe("what the connections confirm", () => {
  it("says what was done, naming the connection where it is not the page's own", () => {
    expect(connectionsToast.created("MCP server")).toBe("MCP server created")
    expect(connectionsToast.nameSaved).toBe("Name saved")
    expect(connectionsToast.settingsSaved).toBe("Settings saved")
    expect(connectionsToast.keyReplaced).toBe("API key replaced")
    expect(connectionsToast.removed("MCP server")).toBe("MCP server removed")
  })

  it("reports a name and settings that were saved, once the store keeps them", () => {
    story(
      update,
      given(listed),
      ...read,
      message(Message.TypedName({ connectionId: search.id, name: "Search servers" })),
      message(Message.SubmittedName({ connectionId: search.id })),
      Command.resolve(RenameConnection, Message.WroteAction({ written: Written.Rename({ connectionId: search.id }) })),
      expectOutMessage(OutMessage.SavedName()),
      message(Message.ChangedSetting({ connectionId: search.id, name: "region", value: "us" })),
      message(Message.SubmittedSettings({ connectionId: search.id })),
      Command.resolve(
        ConfigureConnection,
        Message.WroteAction({ written: Written.Configure({ connectionId: search.id }) })
      ),
      expectOutMessage(OutMessage.SavedSettings())
    )
  })
})
